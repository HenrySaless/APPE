import { callPortalAuth } from "./portal-auth.js";
import { supabase } from "./supabase.js";

export const MIN_PASSWORD_LENGTH = 6;
export const GENERIC_RECOVERY_SUCCESS_MESSAGE = "Se o email existir, enviamos instrucoes de recuperacao.";
const RECOVERY_TOKEN_STORAGE_KEY = "appe-password-recovery-token";

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function validatePasswordReset(password, confirmPassword) {
  const nextPassword = String(password || "").trim();
  const nextConfirmPassword = String(confirmPassword || "").trim();

  if (nextPassword.length < MIN_PASSWORD_LENGTH) {
    return `A senha deve ter no minimo ${MIN_PASSWORD_LENGTH} caracteres.`;
  }

  if (nextPassword !== nextConfirmPassword) {
    return "As senhas nao coincidem.";
  }

  return null;
}

export async function requestPasswordRecovery(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!validateEmail(normalizedEmail)) {
    throw new Error("Informe um email valido.");
  }

  try {
    await callPortalAuth({
      action: "prepare_password_recovery",
      email: normalizedEmail,
    });
  } catch (error) {
    console.error("Falha ao solicitar recuperacao de senha:", error);
    throw new Error("Nao foi possivel enviar o link agora. Tente novamente mais tarde.");
  }

  return {
    message: GENERIC_RECOVERY_SUCCESS_MESSAGE,
  };
}

function readAuthParams() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const params = new URLSearchParams();

  for (const [key, value] of searchParams.entries()) {
    params.set(key, value);
  }

  for (const [key, value] of hashParams.entries()) {
    params.set(key, value);
  }

  return params;
}

export function readRecoveryToken() {
  return readAuthParams().get("token") || "";
}

function storeRecoveryToken(token) {
  const normalizedToken = String(token || "").trim();
  if (!window.sessionStorage) return;

  if (normalizedToken) {
    window.sessionStorage.setItem(RECOVERY_TOKEN_STORAGE_KEY, normalizedToken);
  } else {
    window.sessionStorage.removeItem(RECOVERY_TOKEN_STORAGE_KEY);
  }
}

function readStoredRecoveryToken() {
  if (!window.sessionStorage) return "";
  return String(window.sessionStorage.getItem(RECOVERY_TOKEN_STORAGE_KEY) || "").trim();
}

function getRecoveryErrorMessage() {
  const params = readAuthParams();
  const description = params.get("error_description") || params.get("error");
  if (!description) return "";

  const normalized = decodeURIComponent(description).toLowerCase();
  if (normalized.includes("expired") || normalized.includes("invalid")) {
    return "O link de recuperacao expirou ou nao e mais valido. Solicite um novo email.";
  }

  return "Nao foi possivel validar o link de recuperacao. Solicite um novo email.";
}

function clearRecoveryUrl() {
  if (!window.history?.replaceState) return;

  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = "";
  cleanUrl.hash = "";
  window.history.replaceState({}, document.title, cleanUrl.pathname);
}

function hasRecoveryMarkers() {
  const params = readAuthParams();
  return [
    params.get("type") === "recovery",
    params.has("access_token"),
    params.has("refresh_token"),
    params.has("code"),
  ].some(Boolean);
}

export async function waitForRecoverySession() {
  const token = readRecoveryToken();
  const explicitError = getRecoveryErrorMessage();
  clearRecoveryUrl();

  if (token) {
    try {
      storeRecoveryToken(token);
      await callPortalAuth({
        action: "verify_password_reset_token",
        token,
      });

      return { ok: true, token };
    } catch (error) {
      return {
        ok: false,
        message: error.message || "O link de recuperacao expirou ou nao e mais valido. Solicite um novo email.",
      };
    }
  }

  if (explicitError) {
    return { ok: false, message: explicitError };
  }

  return await new Promise((resolve) => {
    let settled = false;
    let timerId = null;
    const cleanup = (subscription) => {
      if (timerId) {
        window.clearTimeout(timerId);
      }

      subscription?.unsubscribe();
    };

    const finish = (result, subscription) => {
      if (settled) return;
      settled = true;
      cleanup(subscription);
      resolve(result);
    };

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session?.access_token) {
        finish({ ok: true, session }, data.subscription);
      }
    });

    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (sessionData.session && hasRecoveryMarkers()) {
        finish({ ok: true, session: sessionData.session }, data.subscription);
        return;
      }

      timerId = window.setTimeout(() => {
        finish({
          ok: false,
          message: "O link de recuperacao expirou ou nao e mais valido. Solicite um novo email.",
        }, data.subscription);
      }, 1600);
    }).catch(() => {
      finish({
        ok: false,
        message: "Nao foi possivel validar o link de recuperacao agora. Tente novamente.",
      }, data.subscription);
    });
  });
}

export async function updateRecoveredPassword(newPassword, recoveryToken = readRecoveryToken()) {
  const password = String(newPassword || "").trim();
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha deve ter no minimo ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  const token = String(recoveryToken || readStoredRecoveryToken() || "").trim();
  if (token) {
    await callPortalAuth({
      action: "reset_password_with_token",
      token,
      password,
    });
    storeRecoveryToken("");
    return;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error("Sua sessao de recuperacao nao e valida. Solicite um novo link.");
  }

  await callPortalAuth(
    {
      action: "sync_recovery_password",
      password,
    },
    { authToken: sessionData.session.access_token },
  );

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    throw new Error("Nao foi possivel atualizar a senha. Tente novamente com o mesmo link.");
  }

  await supabase.auth.signOut();
  storeRecoveryToken("");
}
