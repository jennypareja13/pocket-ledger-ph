export function buildPasswordResetRedirect(origin: string): string {
  const parsed = new URL(origin);
  if (
    parsed.protocol !== "https:" &&
    parsed.hostname !== "localhost" &&
    parsed.hostname !== "127.0.0.1"
  ) {
    throw new Error("Password reset requires a secure origin.");
  }
  return new URL("/reset-password", parsed.origin).toString();
}
