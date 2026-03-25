/** Context shared across all tool handlers. */
export interface ServerContext {
  isAuthorized: boolean;
  identityHex: string | null;
  syncWarnings: string[];
  firstToolCall: boolean;
}
