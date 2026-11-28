const URL_QUERY_VALUE = /([?&][^=&#\s]+)=([^&#\s]*)/g;
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const LONG_DIGIT_RUN = /\d{6,}/g;

export function redactSensitiveErrorText(value: string): string {
  return value
    .replace(URL_QUERY_VALUE, "$1=[REDACTED]")
    .replace(EMAIL_ADDRESS, "[REDACTED]")
    .replace(LONG_DIGIT_RUN, "[REDACTED]");
}
