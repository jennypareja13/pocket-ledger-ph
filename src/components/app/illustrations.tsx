type IllustrationProps = {
  className?: string;
};

export function Coin({ className }: IllustrationProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none" focusable="false">
      <circle cx="32" cy="32" r="23" fill="var(--brand-ice)" stroke="var(--brand-teal)" strokeWidth="3" />
      <circle cx="32" cy="32" r="17" stroke="var(--brand-ocean)" strokeWidth="2" />
      <path d="M36 22c-1.4-1.5-3-2.2-5.1-2.2-3.2 0-5.4 1.8-5.4 4.3 0 6.6 13 3.2 13 10 0 2.7-2.4 4.8-6.2 4.8-2.5 0-4.7-.9-6.5-2.7M32 16v32" stroke="var(--brand-deep)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function CoinStack({ className }: IllustrationProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 112 96" fill="none" focusable="false">
      <ellipse cx="55" cy="73" rx="35" ry="12" fill="var(--brand-ice)" stroke="var(--brand-teal)" strokeWidth="3" />
      <path d="M20 61v12c0 6.6 15.7 12 35 12s35-5.4 35-12V61" fill="var(--brand-aqua)" stroke="var(--brand-teal)" strokeWidth="3" />
      <ellipse cx="55" cy="61" rx="35" ry="12" fill="var(--brand-ice)" stroke="var(--brand-teal)" strokeWidth="3" />
      <path d="M30 42v10c0 5.5 11.2 10 25 10s25-4.5 25-10V42" fill="var(--brand-aqua)" stroke="var(--brand-ocean)" strokeWidth="3" />
      <ellipse cx="55" cy="42" rx="25" ry="10" fill="var(--brand-ice)" stroke="var(--brand-ocean)" strokeWidth="3" />
      <path d="M55 33v18M60 38c-.9-.9-2.1-1.4-3.7-1.4-2.2 0-3.8 1.2-3.8 3 0 4.5 9.2 2.2 9.2 6.8 0 1.9-1.7 3.3-4.4 3.3-1.8 0-3.3-.6-4.6-1.8" stroke="var(--brand-deep)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ className }: IllustrationProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 80 64" fill="none" focusable="false">
      <rect x="7" y="10" width="66" height="44" rx="9" fill="var(--brand-ice)" stroke="var(--brand-teal)" strokeWidth="3" />
      <path d="M8 23h64" stroke="var(--brand-ocean)" strokeWidth="6" />
      <path d="M17 42h19M17 48h12" stroke="var(--brand-teal)" strokeWidth="3" strokeLinecap="round" />
      <rect x="51" y="37" width="13" height="9" rx="2" fill="var(--brand-aqua)" />
    </svg>
  );
}

export function Vault({ className }: IllustrationProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 72 72" fill="none" focusable="false">
      <rect x="8" y="8" width="56" height="56" rx="13" fill="var(--brand-ice)" stroke="var(--brand-teal)" strokeWidth="3" />
      <circle cx="36" cy="36" r="17" fill="var(--brand-aqua)" stroke="var(--brand-ocean)" strokeWidth="3" />
      <circle cx="36" cy="36" r="7" fill="var(--brand-ice)" stroke="var(--brand-teal)" strokeWidth="3" />
      <path d="M36 19v5M36 48v5M19 36h5M48 36h5" stroke="var(--brand-teal)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Wallet({ className }: IllustrationProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 80 64" fill="none" focusable="false">
      <path d="M12 15h48a8 8 0 0 1 8 8v28a6 6 0 0 1-6 6H14a7 7 0 0 1-7-7V22a7 7 0 0 1 5-7Z" fill="var(--brand-ice)" stroke="var(--brand-teal)" strokeWidth="3" />
      <path d="M9 24h53" stroke="var(--brand-ocean)" strokeWidth="3" />
      <path d="M52 31h17v17H52a7 7 0 0 1 0-17Z" fill="var(--brand-aqua)" stroke="var(--brand-teal)" strokeWidth="3" />
      <circle cx="56" cy="39.5" r="2" fill="var(--brand-deep)" />
    </svg>
  );
}
