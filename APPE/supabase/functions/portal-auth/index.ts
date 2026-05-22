import { adminClient, jsonResponse, sha256Hex } from "../_shared/db.ts"
import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { sendTransactionalEmail } from "../_shared/email.ts"

const SESSION_DAYS = 7
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
const RECOVERY_PASSWORD_MIN_LENGTH = 6
const MATRICULA_PATTERN = /^\d{9}\/\d{2}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_HASH_ITERATIONS = 120000

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

type PortalUserRow = PortalUser & {
  password_hash?: string | null
}

type PortalCourse = {
  id: string
  title: string
  description: string
  instructor_name: string
  starts_at: string
  modality: "online" | "presencial" | "ambos"
  location: string | null
  status: "aberto" | "encerrado"
  capacity_limit: number | null
  created_at: string
  updated_at: string
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase()
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

function isAuthUserAlreadyRegistered(error: unknown) {
  const message = typeof error === "object" && error !== null && "message" in error
    ? String(error.message).toLowerCase()
    : ""

  return message.includes("already been registered")
    || message.includes("already registered")
    || message.includes("user already registered")
    || message.includes("duplicate key")
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

function enrichProfile(profile: PortalUser) {
  return {
    ...profile,
    isAdmin: isAdminEmail(profile.email),
  }
}

function getLoginMethodLabel(method?: string | null) {
  if (method === "gmail") return "gmail"
  if (method === "dados") return "dados"
  return "senha"
}

function isUniqueViolation(error: unknown, constraint: string) {
  const message = typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : ""
  return message.includes(constraint) || message.includes("duplicate key")
}

function getConflictMessage(emailConflict: { id: string } | undefined, matriculaConflict: { id: string } | undefined) {
  if (emailConflict) return "Este email ja esta cadastrado."
  if (matriculaConflict) return "Esta matricula ja esta cadastrada."
  return null
}

function getConflictMessageFromError(error: unknown) {
  if (isUniqueViolation(error, "portal_users_email_exact_unique") || isUniqueViolation(error, "portal_users_email_unique")) {
    return "Este email ja esta cadastrado."
  }

  if (isUniqueViolation(error, "portal_users_matricula_unique")) {
    return "Esta matricula ja esta cadastrada."
  }

  return null
}

function validateRegistrationInput(payload: {
  nomeCompleto: string
  email: string
  numero: string
  matricula: string
  password: string
  confirmPassword: string
}) {
  if (!payload.nomeCompleto || !payload.email || !payload.numero || !payload.matricula || !payload.password || !payload.confirmPassword) {
    return "Preencha todos os campos do cadastro."
  }

  if (!EMAIL_PATTERN.test(payload.email)) {
    return "Informe um email valido."
  }

  if (!MATRICULA_PATTERN.test(payload.matricula)) {
    return "Use o formato 123456789/01 para a matricula."
  }

  if (!PASSWORD_PATTERN.test(payload.password)) {
    return "A senha deve ter no minimo 8 caracteres e conter letras e numeros."
  }

  if (payload.password !== payload.confirmPassword) {
    return "As senhas nao coincidem."
  }

  return null
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function hexToBytes(hex: string) {
  const pairs = hex.match(/.{1,2}/g) ?? []
  return new Uint8Array(pairs.map((pair) => Number.parseInt(pair, 16)))
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )

  const derivedBits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt,
    iterations: PASSWORD_HASH_ITERATIONS,
    hash: "SHA-256",
  }, keyMaterial, 256)

  const digest = new Uint8Array(derivedBits)
  return `pbkdf2_sha256$${PASSWORD_HASH_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(digest)}`
}

async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, iterationsRaw, saltHex, digestHex] = passwordHash.split("$")
  if (algorithm !== "pbkdf2_sha256" || !iterationsRaw || !saltHex || !digestHex) {
    return false
  }

  const iterations = Number.parseInt(iterationsRaw, 10)
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false
  }

  const salt = hexToBytes(saltHex)
  const expectedDigest = hexToBytes(digestHex)
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )

  const derivedBits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt,
    iterations,
    hash: "SHA-256",
  }, keyMaterial, expectedDigest.byteLength * 8)

  const actualDigest = new Uint8Array(derivedBits)
  if (actualDigest.byteLength !== expectedDigest.byteLength) {
    return false
  }

  let mismatch = 0
  for (let index = 0; index < actualDigest.length; index += 1) {
    mismatch |= actualDigest[index] ^ expectedDigest[index]
  }

  return mismatch === 0
}

async function findUserConflicts(email: string, matricula: string, ignoreUserId?: string) {
  const { data, error } = await adminClient
    .from("portal_users")
    .select("id, email, matricula, password_hash")
    .or(`email.eq.${email},matricula.eq.${matricula}`)

  if (error) throw error

  const rows = (data ?? []).filter((item) => item.id !== ignoreUserId)
  const emailConflict = rows.find((item) => normalizeEmail(item.email) === email)
  const matriculaConflict = rows.find((item) => item.matricula === matricula)

  return { emailConflict, matriculaConflict }
}

async function fetchPortalUserByEmail(email: string) {
  const { data, error } = await adminClient
    .from("portal_users")
    .select("id, nome_completo, email, numero, matricula, metodo_login, created_at, updated_at, password_hash")
    .ilike("email", email)
    .maybeSingle()

  if (error) throw error
  return data as PortalUserRow | null
}

function generateTemporaryPassword() {
  return `Temp-${crypto.randomUUID()}-9a`
}

function getPasswordRecoveryRedirectUrl() {
  const explicitRedirect = normalizeText(Deno.env.get("PASSWORD_RECOVERY_REDIRECT_URL"))
  if (explicitRedirect) return explicitRedirect

  const siteUrl = normalizeText(Deno.env.get("SITE_URL"))
  if (siteUrl) {
    return new URL("/update-password/", siteUrl).toString()
  }

  return ""
}

async function ensureAuthRecoveryAccount(user: PortalUserRow) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email: user.email,
    password: generateTemporaryPassword(),
    email_confirm: true,
    user_metadata: {
      matricula: user.matricula,
      nome_completo: user.nome_completo,
      portal_user_id: user.id,
    },
  })

  if (error && !isAuthUserAlreadyRegistered(error)) {
    throw error
  }

  return data?.user ?? null
}

async function sendPasswordRecoveryEmail(user: PortalUserRow) {
  const redirectTo = getPasswordRecoveryRedirectUrl()
  if (!redirectTo) {
    throw new Error("PASSWORD_RECOVERY_REDIRECT_URL ou SITE_URL nao configurado nos segredos da Edge Function.")
  }

  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: user.email,
    options: {
      redirectTo,
    },
  })

  if (error) throw error

  const actionLink = data?.properties?.action_link
  if (!actionLink) {
    throw new Error("Nao foi possivel gerar o link de recuperacao no Supabase Auth.")
  }

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1a1a2e; line-height: 1.6;">
      <h2>Redefinicao de senha - APPE</h2>
      <p>Ola, ${user.nome_completo}.</p>
      <p>Recebemos uma solicitacao para redefinir a senha do seu acesso ao portal APPE.</p>
      <p>
        <a href="${actionLink}" target="_blank" rel="noreferrer" style="display:inline-block;padding:12px 20px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">
          Redefinir senha
        </a>
      </p>
      <p>Se o botao acima nao funcionar, copie e cole este link no navegador:</p>
      <p><a href="${actionLink}" target="_blank" rel="noreferrer">${actionLink}</a></p>
      <p>Se voce nao pediu esta alteracao, ignore este email.</p>
      <p>Academia de Policia Penal de Pernambuco</p>
    </div>
  `

  const text = [
    "Redefinicao de senha - APPE",
    `Ola, ${user.nome_completo}.`,
    "Recebemos uma solicitacao para redefinir a senha do seu acesso ao portal APPE.",
    `Use este link para continuar: ${actionLink}`,
    "Se voce nao pediu esta alteracao, ignore este email.",
  ].join("\n\n")

  const emailResult = await sendTransactionalEmail({
    to: [{ email: user.email, name: user.nome_completo }],
    subject: "Redefinicao de senha - APPE",
    html,
    text,
    tags: ["password-recovery"],
  })

  if (!emailResult.delivered) {
    throw new Error(`Falha ao enviar email de recuperacao via ${emailResult.provider}: ${emailResult.reason ?? "erro_desconhecido"}`)
  }

  return emailResult
}

async function getSupabaseUserFromRequest(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? ""
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (!accessToken) return null

  const { data, error } = await adminClient.auth.getUser(accessToken)
  if (error) throw error
  if (!data.user?.email) return null

  return data.user
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

async function loadCourses() {
  const [coursesResult, enrollmentsResult] = await Promise.all([
    adminClient
      .from("portal_courses")
      .select("id, title, description, instructor_name, starts_at, modality, location, status, capacity_limit, created_at, updated_at")
      .order("starts_at", { ascending: true }),
    adminClient
      .from("course_enrollments")
      .select("course_id"),
  ])

  if (coursesResult.error) throw coursesResult.error
  if (enrollmentsResult.error) throw enrollmentsResult.error

  const enrollmentCounts = new Map<string, number>()
  for (const enrollment of enrollmentsResult.data ?? []) {
    const courseId = String(enrollment.course_id)
    enrollmentCounts.set(courseId, (enrollmentCounts.get(courseId) ?? 0) + 1)
  }

  return ((coursesResult.data ?? []) as PortalCourse[]).map((course) => ({
    ...course,
    enrolled_count: enrollmentCounts.get(course.id) ?? 0,
  }))
}

async function loadAdminEnrollments() {
  const { data, error } = await adminClient
    .from("course_enrollments")
    .select(`
      id,
      course_id,
      course_title,
      course_mode,
      course_date,
      created_at,
      portal_users!inner (
        nome_completo,
        numero,
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
    inscritos: Array<{ enrollment_id: string, nome_completo: string, numero: string, matricula: string }>
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
      enrollment_id: item.id,
      nome_completo: user.nome_completo,
      numero: user.numero,
      matricula: user.matricula,
    })
  }

  return [...grouped.values()]
}

async function loadAdminCourses() {
  const [courses, groupedEnrollments] = await Promise.all([
    loadCourses(),
    loadAdminEnrollments(),
  ])

  const groupedMap = new Map(groupedEnrollments.map((item) => [item.course_id, item.inscritos]))

  return courses.map((course) => ({
    ...course,
    inscritos: groupedMap.get(course.id) ?? [],
  }))
}

async function removeEnrollmentAsAdmin(enrollmentId: string) {
  const { error } = await adminClient
    .from("course_enrollments")
    .delete()
    .eq("id", enrollmentId)

  if (error) throw error
}

async function createCourseAsAdmin(payload: {
  title: string
  description: string
  instructorName: string
  startsAt: string
  modality: string
  capacityLimit: number
  location: string | null
  createdBy: string
}) {
  const { data, error } = await adminClient
    .from("portal_courses")
    .insert({
      title: payload.title,
      description: payload.description,
      instructor_name: payload.instructorName,
      starts_at: payload.startsAt,
      modality: payload.modality,
      capacity_limit: payload.capacityLimit,
      location: payload.location,
      status: "aberto",
      created_by: payload.createdBy,
    })
    .select("id, title, description, instructor_name, starts_at, modality, location, status, capacity_limit, created_at, updated_at")
    .single()

  if (error) throw error
  return data as PortalCourse
}

async function updateCourseStatusAsAdmin(courseId: string, status: "aberto" | "encerrado") {
  const { data, error } = await adminClient
    .from("portal_courses")
    .update({ status })
    .eq("id", courseId)
    .select("id, title, description, instructor_name, starts_at, modality, location, status, capacity_limit, created_at, updated_at")
    .single()

  if (error) throw error
  return data as PortalCourse
}

async function fetchUserByMatricula(matricula: string) {
  const { data, error } = await adminClient
    .from("portal_users")
    .select("id, nome_completo, email, numero, matricula, metodo_login, created_at, updated_at, password_hash")
    .eq("matricula", matricula)
    .maybeSingle()

  if (error) throw error
  return data as PortalUserRow | null
}

async function touchLastLogin(userId: string) {
  const { error } = await adminClient
    .from("portal_users")
    .update({
      ultimo_login_em: new Date().toISOString(),
    })
    .eq("id", userId)

  if (error) throw error
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Metodo nao permitido." }, { status: 405, headers: corsHeaders })
    }

    const body = await req.json()
    const action = normalizeText(body.action) || "login"

    if (action === "session") {
      const session = await getSessionFromRequest(req)
      if (!session) {
        return jsonResponse({ authenticated: false }, { status: 401, headers: corsHeaders })
      }

      const enrollments = await loadEnrollments(session.user.id)
      return jsonResponse({
        authenticated: true,
        profile: enrichProfile({
          ...(session.user as PortalUser),
          metodo_login: getLoginMethodLabel(session.user.metodo_login),
        }),
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

    if (action === "list_courses") {
      const courses = await loadCourses()
      return jsonResponse({ courses }, { headers: corsHeaders })
    }

    if (action === "prepare_password_recovery") {
      const email = normalizeEmail(body.email)
      if (!EMAIL_PATTERN.test(email)) {
        return jsonResponse({ error: "Informe um email valido." }, { status: 400, headers: corsHeaders })
      }

      const user = await fetchPortalUserByEmail(email)
      if (user) {
        await ensureAuthRecoveryAccount(user)
        const emailResult = await sendPasswordRecoveryEmail(user)
        return jsonResponse({
          success: true,
          delivered: true,
          provider: emailResult.provider,
        }, { headers: corsHeaders })
      }

      return jsonResponse({ success: true, delivered: false }, { headers: corsHeaders })
    }

    if (action === "sync_recovery_password") {
      const authUser = await getSupabaseUserFromRequest(req)
      if (!authUser?.email || !authUser.id) {
        return jsonResponse({ error: "Sessao de recuperacao invalida." }, { status: 401, headers: corsHeaders })
      }

      const password = normalizeText(body.password)
      if (password.length < RECOVERY_PASSWORD_MIN_LENGTH) {
        return jsonResponse({
          error: `A senha deve ter no minimo ${RECOVERY_PASSWORD_MIN_LENGTH} caracteres.`,
        }, { status: 400, headers: corsHeaders })
      }

      const portalUser = await fetchPortalUserByEmail(normalizeEmail(authUser.email))
      if (!portalUser) {
        return jsonResponse({ error: "Nenhuma conta do portal foi encontrada para este email." }, { status: 404, headers: corsHeaders })
      }

      const passwordHash = await hashPassword(password)
      const { error: updateError } = await adminClient
        .from("portal_users")
        .update({
          password_hash: passwordHash,
          metodo_login: "senha",
          ultimo_login_em: new Date().toISOString(),
        })
        .eq("id", portalUser.id)

      if (updateError) throw updateError

      return jsonResponse({ success: true }, { headers: corsHeaders })
    }

    if (action === "admin_list_courses") {
      const session = await getSessionFromRequest(req)
      if (!session) {
        return jsonResponse({ error: "Sessao invalida. Faca login novamente." }, { status: 401, headers: corsHeaders })
      }

      if (!isAdminEmail(session.user.email)) {
        return jsonResponse({ error: "Acesso restrito a administradores." }, { status: 403, headers: corsHeaders })
      }

      const courses = await loadAdminCourses()
      return jsonResponse({ courses }, { headers: corsHeaders })
    }

    if (action === "admin_remove_enrollment") {
      const session = await getSessionFromRequest(req)
      if (!session) {
        return jsonResponse({ error: "Sessao invalida. Faca login novamente." }, { status: 401, headers: corsHeaders })
      }

      if (!isAdminEmail(session.user.email)) {
        return jsonResponse({ error: "Acesso restrito a administradores." }, { status: 403, headers: corsHeaders })
      }

      const enrollmentId = normalizeText(body.enrollmentId)
      if (!enrollmentId) {
        return jsonResponse({ error: "Inscricao invalida." }, { status: 400, headers: corsHeaders })
      }

      await removeEnrollmentAsAdmin(enrollmentId)

      return jsonResponse({
        success: true,
      }, { headers: corsHeaders })
    }

    if (action === "admin_create_course") {
      const session = await getSessionFromRequest(req)
      if (!session) {
        return jsonResponse({ error: "Sessao invalida. Faca login novamente." }, { status: 401, headers: corsHeaders })
      }

      if (!isAdminEmail(session.user.email)) {
        return jsonResponse({ error: "Acesso restrito a administradores." }, { status: 403, headers: corsHeaders })
      }

      const title = normalizeText(body.title)
      const description = normalizeText(body.description)
      const instructorName = normalizeText(body.instructorName)
      const startsAt = normalizeText(body.startsAt)
      const modality = normalizeText(body.modality)
      const capacityLimit = Number.parseInt(String(body.capacityLimit ?? ""), 10)
      const location = normalizeText(body.location) || null

      if (!title || !description || !instructorName || !startsAt) {
        return jsonResponse({ error: "Preencha nome, descricao, instrutor e horario do curso." }, { status: 400, headers: corsHeaders })
      }

      if (!["online", "presencial", "ambos"].includes(modality)) {
        return jsonResponse({ error: "Modalidade invalida." }, { status: 400, headers: corsHeaders })
      }

      if (Number.isNaN(Date.parse(startsAt))) {
        return jsonResponse({ error: "Horario invalido." }, { status: 400, headers: corsHeaders })
      }

      if (!Number.isInteger(capacityLimit) || capacityLimit <= 0) {
        return jsonResponse({ error: "Informe um limite de vagas valido." }, { status: 400, headers: corsHeaders })
      }

      const course = await createCourseAsAdmin({
        title,
        description,
        instructorName,
        startsAt,
        modality,
        capacityLimit,
        location,
        createdBy: session.user.id,
      })

      return jsonResponse({ success: true, course }, { headers: corsHeaders })
    }

    if (action === "admin_update_course_status") {
      const session = await getSessionFromRequest(req)
      if (!session) {
        return jsonResponse({ error: "Sessao invalida. Faca login novamente." }, { status: 401, headers: corsHeaders })
      }

      if (!isAdminEmail(session.user.email)) {
        return jsonResponse({ error: "Acesso restrito a administradores." }, { status: 403, headers: corsHeaders })
      }

      const courseId = normalizeText(body.courseId)
      const status = normalizeText(body.status) as "aberto" | "encerrado"

      if (!courseId || !["aberto", "encerrado"].includes(status)) {
        return jsonResponse({ error: "Dados do curso invalidos." }, { status: 400, headers: corsHeaders })
      }

      const course = await updateCourseStatusAsAdmin(courseId, status)
      return jsonResponse({ success: true, course }, { headers: corsHeaders })
    }

    if (action === "login") {
      const matricula = normalizeText(body.matricula)
      const password = normalizeText(body.password)

      if (!matricula || !password) {
        return jsonResponse({ error: "Preencha matricula e senha." }, { status: 400, headers: corsHeaders })
      }

      if (!MATRICULA_PATTERN.test(matricula)) {
        return jsonResponse({ error: "Use o formato 123456789/01 para a matricula." }, { status: 400, headers: corsHeaders })
      }

      const user = await fetchUserByMatricula(matricula)
      if (!user?.password_hash) {
        return jsonResponse({ error: "Matricula ou senha incorretos." }, { status: 401, headers: corsHeaders })
      }

      const passwordMatches = await verifyPassword(password, user.password_hash)
      if (!passwordMatches) {
        return jsonResponse({ error: "Matricula ou senha incorretos." }, { status: 401, headers: corsHeaders })
      }

      await touchLastLogin(user.id)
      const session = await createSession(user.id)
      const enrollments = await loadEnrollments(user.id)

      return jsonResponse({
        authenticated: true,
        token: session.token,
        expiresAt: session.expiresAt,
        profile: enrichProfile({
          ...user,
          metodo_login: getLoginMethodLabel(user.metodo_login),
        }),
        enrollments,
        isAdmin: isAdminEmail(user.email),
      }, { headers: corsHeaders })
    }

    if (action === "register") {
      const nomeCompleto = normalizeText(body.nomeCompleto)
      const email = normalizeEmail(body.email)
      const numero = normalizeText(body.numero)
      const matricula = normalizeText(body.matricula)
      const password = normalizeText(body.password)
      const confirmPassword = normalizeText(body.confirmPassword)

      const validationMessage = validateRegistrationInput({
        nomeCompleto,
        email,
        numero,
        matricula,
        password,
        confirmPassword,
      })

      if (validationMessage) {
        return jsonResponse({ error: validationMessage }, { status: 400, headers: corsHeaders })
      }

      const { emailConflict, matriculaConflict } = await findUserConflicts(email, matricula)
      const legacyActivationCandidate = emailConflict?.id && emailConflict.id === matriculaConflict?.id && !emailConflict.password_hash

      const conflictMessage = getConflictMessage(emailConflict, matriculaConflict)
      if (conflictMessage && !legacyActivationCandidate) {
        return jsonResponse({ error: conflictMessage }, { status: 409, headers: corsHeaders })
      }

      const passwordHash = await hashPassword(password)

      const profileQuery = legacyActivationCandidate
        ? adminClient
          .from("portal_users")
          .update({
            nome_completo: nomeCompleto,
            email,
            numero,
            matricula,
            metodo_login: "senha",
            password_hash: passwordHash,
            ultimo_login_em: new Date().toISOString(),
          })
          .eq("id", emailConflict.id)
        : adminClient
          .from("portal_users")
          .insert({
            nome_completo: nomeCompleto,
            email,
            numero,
            matricula,
            metodo_login: "senha",
            password_hash: passwordHash,
            ultimo_login_em: new Date().toISOString(),
          })

      const { data: profile, error: insertError } = await profileQuery
        .select("id, nome_completo, email, numero, matricula, metodo_login, created_at, updated_at")
        .single()

      const conflictMessageFromError = getConflictMessageFromError(insertError)
      if (conflictMessageFromError) {
        return jsonResponse({ error: conflictMessageFromError }, { status: 409, headers: corsHeaders })
      }

      if (insertError) throw insertError

      const session = await createSession(profile.id)
      return jsonResponse({
        authenticated: true,
        token: session.token,
        expiresAt: session.expiresAt,
        profile: enrichProfile({
          ...(profile as PortalUser),
          metodo_login: getLoginMethodLabel(profile.metodo_login),
        }),
        enrollments: [],
        isAdmin: isAdminEmail(profile.email),
      }, { headers: corsHeaders })
    }

    if (action === "update_profile") {
      const session = await getSessionFromRequest(req)
      if (!session) {
        return jsonResponse({ error: "Sessao invalida. Faca login novamente." }, { status: 401, headers: corsHeaders })
      }

      const nomeCompleto = normalizeText(body.nomeCompleto)
      const email = normalizeEmail(body.email)
      const matricula = normalizeText(body.matricula)
      const numero = normalizeText(body.numero)

      if (!nomeCompleto || !email || !numero || !matricula) {
        return jsonResponse({ error: "Preencha nome completo, telefone, e-mail e matricula." }, { status: 400, headers: corsHeaders })
      }

      if (!EMAIL_PATTERN.test(email)) {
        return jsonResponse({ error: "Informe um email valido." }, { status: 400, headers: corsHeaders })
      }

      if (!MATRICULA_PATTERN.test(matricula)) {
        return jsonResponse({ error: "Use o formato 123456789/01 para a matricula." }, { status: 400, headers: corsHeaders })
      }

      const { emailConflict, matriculaConflict } = await findUserConflicts(email, matricula, session.user.id)
      const conflictMessage = getConflictMessage(emailConflict, matriculaConflict)
      if (conflictMessage) {
        return jsonResponse({ error: conflictMessage }, { status: 409, headers: corsHeaders })
      }

      const { data: profile, error: updateError } = await adminClient
        .from("portal_users")
        .update({
          nome_completo: nomeCompleto,
          email,
          numero,
          matricula,
        })
        .eq("id", session.user.id)
        .select("id, nome_completo, email, numero, matricula, metodo_login, created_at, updated_at")
        .single()

      const conflictMessageFromError = getConflictMessageFromError(updateError)
      if (conflictMessageFromError) {
        return jsonResponse({ error: conflictMessageFromError }, { status: 409, headers: corsHeaders })
      }

      if (updateError) throw updateError

      const enrollments = await loadEnrollments(profile.id)
      return jsonResponse({
        authenticated: true,
        profile: enrichProfile({
          ...(profile as PortalUser),
          metodo_login: getLoginMethodLabel(profile.metodo_login),
        }),
        enrollments,
        isAdmin: isAdminEmail(profile.email),
        expiresAt: session.expiresAt,
      }, { headers: corsHeaders })
    }

    return jsonResponse({ error: "Acao invalida." }, { status: 400, headers: corsHeaders })
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Erro interno ao autenticar.",
    }, { status: 500, headers: corsHeaders })
  }
})
