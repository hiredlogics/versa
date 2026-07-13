import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

type ClerkReturnError = {
  code: string;
  longMessage?: string;
  message: string;
};

type SignUpHookErrors = {
  fields: {
    emailAddress?: ClerkReturnError | null;
    firstName?: ClerkReturnError | null;
    lastName?: ClerkReturnError | null;
    password?: ClerkReturnError | null;
    code?: ClerkReturnError | null;
    captcha?: ClerkReturnError | null;
  };
  global?: ClerkReturnError[] | null;
};

const FRIENDLY: Record<string, string> = {
  form_identifier_exists: "An account with this email already exists. Try signing in instead.",
  form_password_pwned: "This password has appeared in a data breach. Please choose a different one.",
  form_password_length_too_short: "Password is too short for your workspace security settings.",
  form_password_no_uppercase: "Password must include at least one uppercase letter.",
  form_password_no_lowercase: "Password must include at least one lowercase letter.",
  form_password_no_number: "Password must include at least one number.",
  form_password_no_special_char: "Password must include at least one special character.",
  captcha_invalid: "Security check failed. Complete the check below and try again.",
  captcha_missing_token: "Security check is still loading. Wait a moment and try again.",
  form_code_incorrect: "That verification code is incorrect. Check your email and try again.",
  verification_expired: "That verification code expired. Request a new one and try again.",
  form_param_format_invalid: "Please check your details and try again.",
  client_state_invalid: "Your signup session expired. Please start again.",
  session_exists: "redirect",
};

function clerkErrorText(code: string | undefined, longMessage?: string, message?: string): string {
  if (code && FRIENDLY[code]) return FRIENDLY[code];
  return longMessage || message || "";
}

export function getClerkErrorMessage(error: unknown, fallback: string): string {
  if (!isClerkAPIResponseError(error)) return fallback;

  const first = error.errors[0];
  if (!first) return fallback;

  if (first.code === "session_exists") return "redirect";

  return clerkErrorText(first.code, first.longMessage, first.message) || fallback;
}

export function getClerkErrorFromReturn(error: ClerkReturnError | null | undefined, fallback: string): string {
  if (!error) return fallback;
  return clerkErrorText(error.code, error.longMessage, error.message) || fallback;
}

export function getClerkFieldErrors(error: unknown): Record<string, string> {
  if (!isClerkAPIResponseError(error)) return {};

  const fieldErrors: Record<string, string> = {};

  for (const err of error.errors) {
    const message = clerkErrorText(err.code, err.longMessage, err.message);
    if (!message) continue;

    const param = typeof err.meta?.paramName === "string" ? err.meta.paramName : undefined;

    if (param === "email_address" || err.code === "form_identifier_exists") {
      fieldErrors.email = message;
      continue;
    }

    if (param === "password" || err.code?.startsWith("form_password")) {
      fieldErrors.password = message;
      continue;
    }

    if (param === "code" || err.code?.startsWith("form_code") || err.code === "verification_expired") {
      fieldErrors.code = message;
      continue;
    }

    if (err.code?.startsWith("captcha")) {
      fieldErrors.captcha = message;
    }
  }

  return fieldErrors;
}

type SignInHookErrors = {
  fields: {
    identifier?: ClerkReturnError | null;
    password?: ClerkReturnError | null;
    code?: ClerkReturnError | null;
  };
  global?: ClerkReturnError[] | null;
};

export function getSignInHookFieldErrors(errors: SignInHookErrors | undefined): Record<string, string> {
  if (!errors) return {};

  const mapped: Record<string, string> = {};
  const fields = errors.fields;

  if (fields.identifier) {
    mapped.email = clerkErrorText(
      fields.identifier.code,
      fields.identifier.longMessage,
      fields.identifier.message
    );
  }
  if (fields.password) {
    mapped.password = clerkErrorText(
      fields.password.code,
      fields.password.longMessage,
      fields.password.message
    );
  }
  if (fields.code) {
    mapped.code = clerkErrorText(fields.code.code, fields.code.longMessage, fields.code.message);
  }

  return mapped;
}

export function getSignInHookGlobalError(errors: SignInHookErrors | undefined, fallback: string): string | null {
  const global = errors?.global?.[0];
  if (!global) return null;
  return clerkErrorText(global.code, global.longMessage, global.message) || fallback;
}

export function getSignUpHookFieldErrors(errors: SignUpHookErrors | undefined): Record<string, string> {
  if (!errors) return {};

  const mapped: Record<string, string> = {};
  const fields = errors.fields;

  if (fields.emailAddress) {
    mapped.email = clerkErrorText(
      fields.emailAddress.code,
      fields.emailAddress.longMessage,
      fields.emailAddress.message
    );
  }
  if (fields.firstName) {
    mapped.firstName = clerkErrorText(
      fields.firstName.code,
      fields.firstName.longMessage,
      fields.firstName.message
    );
  }
  if (fields.lastName) {
    mapped.lastName = clerkErrorText(
      fields.lastName.code,
      fields.lastName.longMessage,
      fields.lastName.message
    );
  }
  if (fields.password) {
    mapped.password = clerkErrorText(
      fields.password.code,
      fields.password.longMessage,
      fields.password.message
    );
  }
  if (fields.code) {
    mapped.code = clerkErrorText(fields.code.code, fields.code.longMessage, fields.code.message);
  }
  if (fields.captcha) {
    mapped.captcha = clerkErrorText(
      fields.captcha.code,
      fields.captcha.longMessage,
      fields.captcha.message
    );
  }

  return mapped;
}

export function getSignUpHookGlobalError(errors: SignUpHookErrors | undefined, fallback: string): string | null {
  const global = errors?.global?.[0];
  if (!global) return null;
  return clerkErrorText(global.code, global.longMessage, global.message) || fallback;
}
