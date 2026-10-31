import { APP_NAME } from "@/lib/config";

export function VaultLogo({ wordmark = true }: { wordmark?: boolean }) {
  return <span className="inline-flex shrink-0 items-center gap-2 text-foreground">
    <svg viewBox="0 0 64 64" className="size-10 shrink-0" role="img" aria-label={`${APP_NAME} logo`}>
      <rect x="12" y="7" width="35" height="42" rx="4" fill="var(--brand-aqua)" stroke="var(--brand-deep)" strokeWidth="3" />
      <path d="M20 16h20M20 23h20M20 30h15" stroke="var(--brand-teal)" strokeWidth="3" strokeLinecap="round" />
      <path d="M7 29a5 5 0 0 1 5-5h39v31H12a5 5 0 0 1-5-5Z" fill="var(--brand-teal)" stroke="var(--brand-deep)" strokeWidth="3" />
      <rect x="38" y="33" width="20" height="14" rx="4" fill="var(--brand-ocean)" stroke="var(--brand-deep)" strokeWidth="3" />
      <circle cx="47" cy="40" r="4" fill="var(--brand-ice)" />
    </svg>
    {wordmark && <span className="text-lg font-bold">{APP_NAME}</span>}
  </span>;
}