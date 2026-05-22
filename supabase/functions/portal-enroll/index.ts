import { adminClient, jsonResponse, sha256Hex } from "../_shared/db.ts"
import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { sendTransactionalEmail } from "../_shared/email.ts"
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

function formatCourseDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Recife",
  }).format(new Date(value))
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

  return await sendTransactionalEmail({
    to: [{ email: payload.email, name: payload.name }],
    subject: `Confirmacao de inscricao - ${payload.courseTitle}`,
    html,
    tags: ["course-enrollment"],
  })
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
    if (!courseId) {
      return jsonResponse({ error: "Curso invalido." }, { status: 400, headers: corsHeaders })
    }

    const { data: course, error: courseError } = await adminClient
      .from("portal_courses")
      .select("id, title, description, instructor_name, starts_at, modality, location, status, capacity_limit")
      .eq("id", courseId)
      .maybeSingle()

    if (courseError) throw courseError
    if (!course) {
      return jsonResponse({ error: "Curso nao encontrado." }, { status: 404, headers: corsHeaders })
    }

    if (course.status === "encerrado") {
      return jsonResponse({ error: "Vagas encerradas para este curso." }, { status: 400, headers: corsHeaders })
    }

    const courseTitle = String(course.title)
    const courseMode = String(course.modality)
    const courseDate = formatCourseDate(course.starts_at)
    const courseLabel = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "America/Recife",
    }).format(new Date(course.starts_at))
    const courseStatus = String(course.status)
    const courseLocation = course.location ? String(course.location) : null
    const courseInstructor = String(course.instructor_name)

    const calendarUrl = buildGoogleCalendarUrl({
      title: courseTitle,
      data: courseDate,
      label: courseLabel,
      local: courseLocation,
      modalidade: courseMode,
    })

    const { data: enrollmentAttempt, error: enrollError } = await adminClient
      .rpc("portal_attempt_course_enrollment", {
        p_user_id: session.user.id,
        p_course_id: courseId,
        p_course_title: courseTitle,
        p_course_mode: courseMode,
        p_course_date: courseDate,
        p_course_label: courseLabel,
        p_course_status: courseStatus || null,
        p_course_location: courseLocation,
        p_course_instructor: courseInstructor,
        p_google_calendar_url: calendarUrl,
      })
      .single()

    if (enrollError) throw enrollError
    if (!enrollmentAttempt) {
      throw new Error("Nao foi possivel registrar a inscricao.")
    }

    if (enrollmentAttempt.outcome === "duplicate") {
      return jsonResponse({ error: "Voce ja esta inscrito neste curso." }, { status: 409, headers: corsHeaders })
    }

    if (enrollmentAttempt.outcome === "closed") {
      return jsonResponse({ error: "Vagas encerradas para este curso." }, { status: 400, headers: corsHeaders })
    }

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
      enrollment: enrollmentAttempt.enrollment_id ? {
        id: enrollmentAttempt.enrollment_id,
      } : null,
      enrolledCount: enrollmentAttempt.enrolled_count,
      capacityLimit: enrollmentAttempt.capacity_limit,
      courseStatus: enrollmentAttempt.course_status,
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
