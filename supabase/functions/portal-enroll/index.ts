import { adminClient, jsonResponse, sha256Hex } from "../_shared/db.ts"
import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { buildGoogleCalendarUrl } from "../_shared/google-calendar.ts"

async function getSession(req: Request) {
  const portalSession = req.headers.get("x-portal-session") ?? ""
  const authHeader = req.headers.get("Authorization") ?? ""
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  const token = portalSession || bearerToken
  if (!token) return null

  const tokenHash = await sha256Hex(token)
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
        metodo_login
      )
    `)
    .eq("session_token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const user = Array.isArray(data.portal_users) ? data.portal_users[0] : data.portal_users
  if (!user) return null

  return { user }
}

async function sendConfirmationEmail(payload: {
  email: string
  name: string
  courseTitle: string
  courseMode: string
  courseDate: string
  courseLabel?: string | null
  courseLocation?: string | null
  googleCalendarUrl?: string | null
}) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY")
  const senderEmail = Deno.env.get("PORTAL_SENDER_EMAIL") ?? "no-reply@appe.local"
  const senderName = Deno.env.get("PORTAL_SENDER_NAME") ?? "APPE"

  if (!resendApiKey) {
    return { delivered: false, reason: "missing_resend_api_key" }
  }

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1a1a2e; line-height: 1.6;">
      <h2>Confirmacao de inscricao - APPE</h2>
      <p>Ola, ${payload.name}.</p>
      <p>Sua inscricao foi registrada com sucesso.</p>
      <ul>
        <li><strong>Curso:</strong> ${payload.courseTitle}</li>
        <li><strong>Modalidade:</strong> ${payload.courseMode}</li>
        <li><strong>Data:</strong> ${payload.courseDate}</li>
        ${payload.courseLabel ? `<li><strong>Periodo:</strong> ${payload.courseLabel}</li>` : ""}
        ${payload.courseLocation ? `<li><strong>Local:</strong> ${payload.courseLocation}</li>` : ""}
      </ul>
      ${
        payload.googleCalendarUrl
          ? `<p><a href="${payload.googleCalendarUrl}" target="_blank" rel="noreferrer">Adicionar lembrete no Google Agenda</a></p>`
          : ""
      }
      <p>Academia de Policia Penal de Pernambuco</p>
    </div>
  `

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: `${senderName} <${senderEmail}>`,
      to: [payload.email],
      subject: `Confirmacao de inscricao - ${payload.courseTitle}`,
      html,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    return { delivered: false, reason: body }
  }

  return { delivered: true, reason: null }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Metodo nao permitido." }, { status: 405, headers: corsHeaders })
    }

    const session = await getSession(req)
    if (!session) {
      return jsonResponse({ error: "Sessao invalida. Faca login novamente." }, { status: 401, headers: corsHeaders })
    }

    const body = await req.json()
    const courseId = String(body.courseId ?? "").trim()
    const courseTitle = String(body.title ?? "").trim()
    const courseMode = body.modalidade === "presencial" ? "presencial" : "online"
    const courseDate = String(body.data ?? "").trim()
    const courseLabel = String(body.label ?? "").trim() || null
    const courseStatus = String(body.status ?? "").trim()
    const courseLocation = String(body.local ?? "").trim() || null
    const courseInstructor = String(body.instrutor ?? "").trim() || null

    if (!courseId || !courseTitle || !courseDate) {
      return jsonResponse({ error: "Dados do curso incompletos." }, { status: 400, headers: corsHeaders })
    }

    if (courseStatus === "encerrado" || courseStatus === "esgotado") {
      return jsonResponse({ error: "As inscricoes para este curso nao estao disponiveis no momento." }, { status: 400, headers: corsHeaders })
    }

    const calendarUrl = buildGoogleCalendarUrl({
      title: courseTitle,
      data: courseDate,
      label: courseLabel,
      local: courseLocation,
      modalidade: courseMode,
    })

    const { data: enrollment, error: enrollError } = await adminClient
      .from("course_enrollments")
      .upsert({
        user_id: session.user.id,
        course_id: courseId,
        course_title: courseTitle,
        course_mode: courseMode,
        course_date: courseDate,
        course_label: courseLabel,
        course_status: courseStatus || null,
        course_location: courseLocation,
        course_instructor: courseInstructor,
        google_calendar_url: calendarUrl,
      }, {
        onConflict: "user_id,course_id",
      })
      .select("id, created_at")
      .single()

    if (enrollError) throw enrollError

    const emailResult = await sendConfirmationEmail({
      email: session.user.email,
      name: session.user.nome_completo,
      courseTitle,
      courseMode,
      courseDate,
      courseLabel,
      courseLocation,
      googleCalendarUrl: calendarUrl,
    })

    return jsonResponse({
      success: true,
      enrollment,
      googleCalendarUrl: calendarUrl,
      emailDelivered: emailResult.delivered,
      emailReason: emailResult.reason,
    }, { headers: corsHeaders })
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Erro interno ao inscrever no curso.",
    }, { status: 500, headers: corsHeaders })
  }
})
