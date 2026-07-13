export function configuredAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS?.trim() || process.env.ADMIN_EMAIL?.trim() || "";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isConfiguredAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return configuredAdminEmails().includes(normalized);
}

export function isStaticAdminAuthConfigured(): boolean {
  const password = process.env.ADMIN_PASSWORD?.trim();
  return Boolean(password && configuredAdminEmails().length > 0);
}

export function verifyAdminCredentials(email: string, password: string): boolean {
  const configuredPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!configuredPassword) return false;

  const normalizedEmail = email.trim().toLowerCase();
  const allowedEmails = configuredAdminEmails();
  if (!allowedEmails.includes(normalizedEmail)) return false;

  return password === configuredPassword;
}
