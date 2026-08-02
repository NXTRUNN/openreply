function normalizeEmail(value: string): string | null {
  const normalizedCase = value.trim().toLowerCase();
  if (normalizedCase.normalize("NFKC") !== normalizedCase) return null;

  return normalizedCase || null;
}

export function getOwnerEmail(): string | null {
  const configured = process.env.OWNER_EMAIL;
  if (!configured) return null;

  return normalizeEmail(configured);
}

export function isOwnerEmail(candidate: string | null | undefined): boolean {
  const ownerEmail = getOwnerEmail();
  if (!ownerEmail || !candidate) return false;

  const normalizedCandidate = normalizeEmail(candidate);
  return normalizedCandidate !== null && normalizedCandidate === ownerEmail;
}
