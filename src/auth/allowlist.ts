/**
 * Parses the comma-separated ALLOWED_USER_IDS value. Blank entries and
 * surrounding whitespace are dropped, so an unset or empty value yields an
 * empty list.
 */
export function parseAllowedUserIds(raw: string | undefined | null): string[] {
  if (raw === undefined || raw === null) {
    return [];
  }

  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Fails closed: an empty allowlist admits no one.
 */
export function isUserAllowed(
  userId: string,
  allowedUserIds: readonly string[]
): boolean {
  if (userId.length === 0) {
    return false;
  }

  return allowedUserIds.includes(userId);
}
