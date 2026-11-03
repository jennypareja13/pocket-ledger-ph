import { APP_NAME } from "@/lib/config";

/** Vector recreation of the PocketVault "Protected Layers" emblem. */
export function VaultMark({ className = "size-10 shrink-0" }: { className?: string }) {
  return (
    <svg
      viewBox="160 100 960 1000"
      className={className}
      role="img"
      aria-label={`${APP_NAME} logo`}
    >
      <path
        d="M638 165 1045 395V775L638 1030 235 775V395Z"
        fill="var(--brand-deep)"
        stroke="var(--brand-deep)"
        strokeWidth="60"
        strokeLinejoin="round"
      />
      <path
        d="M330 470Q330 440 360 420L590 300Q635 280 680 300L775 355 440 500Q385 530 385 590V780Q390 840 430 900L360 830Q320 790 320 740Z"
        fill="var(--brand-ice)"
      />
      <path
        d="M450 580Q450 535 510 520L760 395Q800 380 840 400L920 450 590 590Q540 615 538 680V940Q540 975 555 1000L500 960Q450 910 450 840Z"
        fill="var(--brand-aqua)"
      />
      <path
        d="M600 690Q600 640 650 615L920 490Q980 470 1025 550L740 685Q685 715 685 770V990Q660 1030 630 1030Q600 1020 598 980Z"
        fill="var(--brand-ice)"
      />
      <path
        d="M685 770Q685 715 740 685L1025 550V740Q1020 800 960 830L685 995Z"
        fill="var(--brand-teal)"
      />
    </svg>
  );
}

export function VaultLogo({ wordmark = true }: { wordmark?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-foreground">
      <VaultMark />
      {wordmark && <span className="text-lg font-bold">{APP_NAME}</span>}
    </span>
  );
}
