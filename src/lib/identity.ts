function stripDiacritics(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeHandle(value: string) {
  const normalized = stripDiacritics(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  if (!normalized) {
    throw new Error("Invalid handle");
  }

  return normalized;
}

export function normalizeLoginIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function buildAuthAliasEmail(identifier: string, aliasDomain: string) {
  const handle = normalizeHandle(identifier);
  return `${handle}@${aliasDomain}`;
}
