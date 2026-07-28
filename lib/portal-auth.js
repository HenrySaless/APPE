const PORTAL_CONFIG = window.APPE_CONFIG || {};

export const functionsBaseUrl = String(PORTAL_CONFIG.functionsBaseUrl || "").trim();
export const supabaseAnonKey = String(PORTAL_CONFIG.supabaseAnonKey || "").trim();

export async function callPortalAuth(body, options = {}) {
  if (!functionsBaseUrl) {
    throw new Error("Nao foi possivel concluir a solicitacao.");
  }

  const authorizationToken = options.authToken || supabaseAnonKey;
  const headers = {
    "Content-Type": "application/json",
    ...(supabaseAnonKey ? { apikey: supabaseAnonKey } : {}),
    ...(authorizationToken ? { Authorization: `Bearer ${authorizationToken}` } : {}),
    ...(options.portalSession ? { "x-portal-session": options.portalSession } : {}),
  };

  const response = await fetch(`${functionsBaseUrl}/portal-auth`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.error ||
      payload.message ||
      payload.code ||
      "Nao foi possivel concluir a solicitacao.",
    );
  }

  return payload;
}

export async function callPortalAuthWithSession(body, token) {
  return callPortalAuth(body, { portalSession: token });
}

export function getLoginMethodLabel(method) {
  if (method === "gmail") return "Google OAuth";
  if (method === "dados") return "Dados institucionais";
  return "Senha";
}
