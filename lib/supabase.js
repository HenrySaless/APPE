import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const PORTAL_CONFIG = window.APPE_CONFIG || {};
const DEFAULT_RECOVERY_REDIRECT_PATH = "/update-password/";

function deriveSupabaseUrl() {
  if (PORTAL_CONFIG.supabaseUrl) {
    return String(PORTAL_CONFIG.supabaseUrl).trim();
  }

  const functionsBaseUrl = String(PORTAL_CONFIG.functionsBaseUrl || "").trim();
  if (functionsBaseUrl.includes("/functions/v1")) {
    return functionsBaseUrl.replace(/\/functions\/v1\/?$/, "");
  }

  throw new Error("Supabase URL nao configurada em window.APPE_CONFIG.");
}

export const supabaseUrl = deriveSupabaseUrl();
export const supabaseAnonKey = String(PORTAL_CONFIG.supabaseAnonKey || "").trim();

function derivePasswordRecoveryRedirectUrl() {
  if (PORTAL_CONFIG.passwordRecoveryRedirectUrl) {
    return String(PORTAL_CONFIG.passwordRecoveryRedirectUrl).trim();
  }

  const { origin, pathname } = window.location;
  const pathParts = pathname.split("/").filter(Boolean);
  const currentSection = pathParts[pathParts.length - 1] || "";
  const baseParts = currentSection.includes(".")
    ? pathParts.slice(0, -1)
    : pathParts.slice(0, -1);

  return new URL(
    `${baseParts.length ? `/${baseParts.join("/")}` : ""}${DEFAULT_RECOVERY_REDIRECT_PATH}`,
    origin,
  ).toString();
}

export const passwordRecoveryRedirectUrl = derivePasswordRecoveryRedirectUrl();

if (!supabaseAnonKey) {
  throw new Error("Supabase anon key nao configurada em window.APPE_CONFIG.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
    storageKey: "appe-supabase-auth",
  },
});
