import { adminClient, jsonResponse, sha256Hex } from "../_shared/db.ts"
import { corsHeaders, handleCors } from "../_shared/cors.ts"

const SESSION_DAYS = 7
const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function getAdminEmails() {
  return (Deno.env.get("PORTAL_ADMIN_EMAILS") ?? "")
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean)
}

function isAdminEmail(email?: string | null) {
  if (!email) return false
  return getAdminEmails().includes(normalizeEmail(email))
}

type PortalUser = {
  id: string
  nome_completo: string
  email: string
  numero: string
  matricula: string
  metodo_login: string
  created_at: string
  updated_at: string
}

function enrichProfile(profile: PortalUser) {
  return {
    ...profile,
    isAdmin: isAdminEmail(profile.email),
  }
}

async function findUserConflicts(email: string, matricula: string, ignoreUserId?: string) {
  const { data, error } = await adminClient
    .from("portal_users")
    .select("id, email, matricula")
    .or(`email.eq.${email},matricula.eq.${matricula}`)

  if (error) throw error

  const rows = (data ?? []).filter((item) => item.id !== ignoreUserId)
  const emailConflict = rows.find((item) => normalizeEmail(item.email) === email)
  const matriculaConflict = rows.find((item) => item.matricula === matricula)

  return { emailConflict, matriculaConflict }
}

function getConflictMessage(emailConflict: { matricula: string } | undefined, matriculaConflict: { email: string } | undefined) {
  if (emailConflict && matriculaConflict) {
    return "Ja existe um cadastro com este e-mail ou matricula vinculado a outro usuario."
  }

  if (emailConflict) {
    return "Este e-mail ja esta vinculado a outra conta."
  }

  if (matriculaConflict) {
    return "Esta matricula ja esta vinculada a outra conta."
  }

  return null
}

async function cleanupExpiredSessions(userId?: string) {
  const query = adminClient
    .from("portal_sessions")
    .delete()
    .lt("expires_at", new Date().toISOString())

  if (userId) {
    query.eq("user_id", userId)
  }

  const { error } = await query
  if (error) throw error
}

async function createSession(userId: string) {
  await cleanupExpiredSessions(userId)

  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "")
  const tokenHash = await sha256Hex(token)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS)

  const { error } = await adminClient.from("portal_sessions").insert({
    user_id: userId,
    session_token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  })

  if (error) throw error

  return { token, expiresAt: expiresAt.toISOString() }
}

async function getSessionFromRequest(req: Request) {
  const portalSession = req.headers.get("x-portal-session") ?? ""
  const authHeader = req.headers.get("Authorization") ?? ""
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  const token = portalSession || bearerToken
  if (!token) return null

  const tokenHash = await sha256Hex(token)
  const now = new Date().toISOString()
  const { data, error } = await adminClient
    .from("portal_sessions")
    .select(`
      id,
      expires_at,
      portal_users (
        id,
        nome_completo,
        email,
        numero,
        matricula,
        metodo_login,
        created_at,
        updated_at
      )
    `)
    .eq("session_token_hash", tokenHash)
    .gt("expires_at", now)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const user = Array.isArray(data.portal_users) ? data.portal_users[0] : data.portal_users
  if (!user) return null

  return {
    sessionId: data.id,
    expiresAt: data.expires_at,
    user,
    token,
  }
}

async function loadEnrollments(userId: string) {
  const { data, error } = await adminClient
    .from("course_enrollments")
    .select("course_id, course_title, course_mode, course_date, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}

async function validateGoogleIdToken(idToken: string) {
  if (!idToken) {
    throw new Error("Token Google ausente.")
  }

  const response = await fetch(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`)
  if (!response.ok) {
    throw new Error("Nao foi possivel validar o token Google.")
  }

  const payload = await response.json()
  if (!payload?.email || !payload?.sub) {
    throw new Error("Token Google invalido.")
  }

  const expectedAudience = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim()
  if (expectedAudience && payload.aud !== expectedAudience) {
    throw new Error("Audience do token Google nao confere com GOOGLE_OAUTH_CLIENT_ID.")
  }

  return {
    email: normalizeEmail(String(payload.email)),
    name: String(payload.name ?? payload.given_name ?? "").trim(),
  }
}

async function loadAdminEnrollments() {
  const { data, error } = await adminClient
    .from("course_enrollments")
    .select(`
      course_id,
      course_title,
      course_mode,
      course_date,
      created_at,
      portal_users!inner (
        nome_completo,
        matricula
      )
    `)
    .order("course_title", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) throw error

  const grouped = new Map<string, {
    course_id: string
    course_title: string
    course_mode: string
    course_date: string
    inscritos: Array<{ nome_completo: string, matricula: string }>
  }>()

  for (const item of data ?? []) {
    const user = Array.isArray(item.portal_users) ? item.portal_users[0] : item.portal_users
    if (!user) continue

    const groupKey = `${item.course_id}::${item.course_date}`
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        course_id: item.course_id,
        course_title: item.course_title,
        course_mode: item.course_mode,
        course_date: item.course_date,
        inscritos: [],
      })
    }

    grouped.get(groupKey)?.inscritos.push({
      nome_completo: user.nome_completo,
      matricula: user.matricula,
    })
  }

  return [...grouped.values()]
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Metodo nao permitido." }, { status: 405, headers: corsHeaders })
    }

    const body = await req.json()
    const action = body.action ?? "login"

    if (action === "session") {
      const session = await getSessionFromRequest(req)
      if (!session) {
        return jsonResponse({ authenticated: false }, { status: 401, headers: corsHeaders })
      }

      const enrollments = await loadEnrollments(session.user.id)
      return jsonResponse({
        authenticated: true,
        profile: enrichProfile(session.user as PortalUser),
        enrollments,
        isAdmin: isAdminEmail(session.user.email),
        expiresAt: session.expiresAt,
      }, { headers: corsHeaders })
    }

    if (action === "logout") {
      const session = await getSessionFromRequest(req)
      if (session?.sessionId) {
        await adminClient.from("portal_sessions").delete().eq("id", session.sessionId)
      }

      return jsonResponse({ success: true }, { headers: corsHeaders })
    }

    if (action === "admin_enrollments") {
      const session = await getSessionFromRequest(req)
      if (!session) {
        return jsonResponse({ error: "Sessao invalida. Faca login novamente." }, { status: 401, headers: corsHeaders })
      }

      if (!isAdminEmail(session.user.email)) {
        return jsonResponse({ error: "Acesso restrito a administradores." }, { status: 403, headers: corsHeaders })
      }

      const courses = await loadAdminEnrollments()
      return jsonResponse({
        isAdmin: true,
        courses,
      }, { headers: corsHeaders })
    }

    const nomeCompleto = String(body.nomeCompleto ?? "").trim()
    const email = normalizeEmail(String(body.email ?? ""))
    const numero = String(body.numero ?? "").trim()
    const matricula = String(body.matricula ?? "").trim()
    const metodoLogin = body.metodoLogin === "gmail" ? "gmail" : "dados"
    const googleIdToken = String(body.googleIdToken ?? "").trim()

    let resolvedName = nomeCompleto
    let resolvedEmail = email

    if (metodoLogin === "gmail") {
      const googleProfile = await validateGoogleIdToken(googleIdToken)
      resolvedEmail = googleProfile.email

      if (email && email !== resolvedEmail) {
        return jsonResponse({ error: "O e-mail informado nao corresponde ao e-mail autenticado no Google." }, { status: 400, headers: corsHeaders })
      }

      if (!resolvedName) {
        resolvedName = googleProfile.name
      }
    }

    if (!resolvedName || !resolvedEmail || !numero || !matricula) {
      return jsonResponse({ error: "Preencha nome completo, e-mail, numero e matricula." }, { status: 400, headers: corsHeaders })
    }

    if (action === "update_profile") {
      const session = await getSessionFromRequest(req)
      if (!session) {
        return jsonResponse({ error: "Sessao invalida. Faca login novamente." }, { status: 401, headers: corsHeaders })
      }

      const { emailConflict, matriculaConflict } = await findUserConflicts(resolvedEmail, matricula, session.user.id)
      const updateConflictMessage = getConflictMessage(emailConflict, matriculaConflict)
      if (updateConflictMessage) {
        return jsonResponse({ error: updateConflictMessage }, { status: 409, headers: corsHeaders })
      }

      const { data: profile, error: updateError } = await adminClient
        .from("portal_users")
        .update({
          nome_completo: resolvedName,
          email: resolvedEmail,
          numero,
          matricula,
        })
        .eq("id", session.user.id)
        .select("id, nome_completo, email, numero, matricula, metodo_login, created_at, updated_at")
        .single()

      if (updateError) throw updateError

      const enrollments = await loadEnrollments(profile.id)
      return jsonResponse({
        authenticated: true,
        profile: enrichProfile(profile as PortalUser),
        enrollments,
        isAdmin: isAdminEmail(profile.email),
        expiresAt: session.expiresAt,
      }, { headers: corsHeaders })
    }

    const { emailConflict, matriculaConflict } = await findUserConflicts(resolvedEmail, matricula)
    const loginConflictMessage = getConflictMessage(emailConflict, matriculaConflict)
    if (loginConflictMessage) {
      return jsonResponse({ error: loginConflictMessage }, { status: 409, headers: corsHeaders })
    }

    const { data: profile, error: upsertError } = await adminClient
      .from("portal_users")
      .upsert({
        nome_completo: resolvedName,
        email: resolvedEmail,
        numero,
        matricula,
        metodo_login: metodoLogin,
        ultimo_login_em: new Date().toISOString(),
      }, {
        onConflict: "email",
      })
      .select("id, nome_completo, email, numero, matricula, metodo_login, created_at, updated_at")
      .single()

    if (upsertError) throw upsertError

    const session = await createSession(profile.id)
    const enrollments = await loadEnrollments(profile.id)

    return jsonResponse({
      authenticated: true,
      token: session.token,
      expiresAt: session.expiresAt,
      profile: enrichProfile(profile as PortalUser),
      enrollments,
      isAdmin: isAdminEmail(profile.email),
    }, { headers: corsHeaders })
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Erro interno ao autenticar.",
    }, { status: 500, headers: corsHeaders })
  }
})
