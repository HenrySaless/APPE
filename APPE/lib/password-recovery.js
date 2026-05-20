import { callPortalAuth } from "./portal-auth.js";
import { supabase } from "./supabase.js";

export const MIN_PASSWORD_LENGTH = 6;
export const GENERIC_RECOVERY_SUCCESS_MESSAGE = "Se o email existir, enviamos instrucoes de recuperacao.";

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
    const message = String(error?.message || "");
    if (message === "Acao invalida.") {
      throw new Error("A Edge Function portal-auth publicada ainda nao foi atualizada com o fluxo de recuperacao de senha.");
    }

    if (message === "UNAUTHORIZED_NO_AUTH_HEADER" || message.includes("Missing authorization header")) {
      throw new Error("A chamada para a Edge Function foi rejeitada por autenticacao. Atualize os arquivos do frontend com a correcao mais recente.");
    }

    if (message.includes("PASSWORD_RECOVERY_REDIRECT_URL")) {
      throw new Error("A Edge Function nao recebeu a URL de redirecionamento de recuperacao. Configure PASSWORD_RECOVERY_REDIRECT_URL ou SITE_URL nos segredos do Supabase.");
    }

    if (message.includes("Falha ao enviar email de recuperacao via brevo")) {
      throw new Error("O Brevo recusou ou nao entregou o email de recuperacao. Revise BREVO_API_KEY, PORTAL_SENDER_EMAIL e a verificacao do remetente no Brevo.");
    }

    if (message.includes("Falha ao enviar email de recuperacao via resend")) {
      throw new Error("O provedor alternativo de email falhou ao enviar a recuperacao. Revise a configuracao do provedor nas secrets do Supabase.");
    }

    throw error;
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
  const explicitError = getRecoveryErrorMessage();
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

export async function updateRecoveredPassword(newPassword) {
  const password = String(newPassword || "").trim();
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha deve ter no minimo ${MIN_PASSWORD_LENGTH} caracteres.`);
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
}
