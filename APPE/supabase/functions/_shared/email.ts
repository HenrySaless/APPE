type EmailRecipient = {
  email: string
  name?: string | null
}

type EmailPayload = {
  to: EmailRecipient[]
  subject: string
  html: string
  text?: string | null
  tags?: string[]
}

function getSenderDetails() {
  return {
    email: Deno.env.get("PORTAL_SENDER_EMAIL") ?? "no-reply@appe.local",
    name: Deno.env.get("PORTAL_SENDER_NAME") ?? "APPE",
  }
}

async function sendViaBrevo(payload: EmailPayload) {
  const apiKey = Deno.env.get("BREVO_API_KEY")
  if (!apiKey) {
    return { delivered: false, provider: "brevo", reason: "missing_brevo_api_key" }
  }

  const sender = getSenderDetails()
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender,
      to: payload.to.map((recipient) => ({
        email: recipient.email,
        ...(recipient.name ? { name: recipient.name } : {}),
      })),
      subject: payload.subject,
      htmlContent: payload.html,
      ...(payload.text ? { textContent: payload.text } : {}),
      ...(payload.tags?.length ? { tags: payload.tags } : {}),
    }),
  })

  if (!response.ok) {
    return {
      delivered: false,
      provider: "brevo",
      reason: await response.text(),
    }
  }

  const data = await response.json().catch(() => ({}))
  return {
    delivered: true,
    provider: "brevo",
    reason: data?.messageId ? `messageId:${data.messageId}` : null,
  }
}

async function sendViaResend(payload: EmailPayload) {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  if (!apiKey) {
    return { delivered: false, provider: "resend", reason: "missing_resend_api_key" }
  }

  const sender = getSenderDetails()
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: `${sender.name} <${sender.email}>`,
      to: payload.to.map((recipient) => recipient.email),
      subject: payload.subject,
      html: payload.html,
      ...(payload.text ? { text: payload.text } : {}),
      ...(payload.tags?.length ? { tags: payload.tags } : {}),
    }),
  })

  if (!response.ok) {
    return {
      delivered: false,
      provider: "resend",
      reason: await response.text(),
    }
  }

  const data = await response.json().catch(() => ({}))
  return {
    delivered: true,
    provider: "resend",
    reason: data?.id ? `id:${data.id}` : null,
  }
}

export async function sendTransactionalEmail(payload: EmailPayload) {
  const brevoResult = await sendViaBrevo(payload)
  if (brevoResult.delivered) return brevoResult
  if (brevoResult.reason !== "missing_brevo_api_key") return brevoResult

  return await sendViaResend(payload)
}
