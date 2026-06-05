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

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
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

export async function sendTransactionalEmail(payload: EmailPayload) {
  return await sendViaBrevo(payload)
}
