export interface Publisher {
  identity: string;
  label: string;
  addedAt: bigint;
}

/** Check if an identity hex string is in the authorized_publishers list. */
export function checkAuth(identityHex: string, publishers: Publisher[]): boolean {
  return publishers.some(p => p.identity === identityHex);
}

/**
 * Guard for mutating tools. Returns null if authorized, or an error message string if not.
 * The error message includes the identity so the user can share it for authorization.
 */
export function requireAuth(identityHex: string, isAuthorized: boolean): string | null {
  if (isAuthorized) return null;
  return `Identity ${identityHex} is not authorized to perform this action. ` +
    `Ask an existing authorized publisher to run the authorize_publisher tool ` +
    `with your identity hex string.`;
}
