/**
 * The ZariZari mark (spec 11.5): a storefront under a striped awning, drawn in the current text colour, so
 * `text-accent` paints it in the theme's blue. public/logo.svg and public/favicon.svg are the same drawing.
 */
export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="currentColor" aria-hidden className={className}>
      <rect x="6" y="7" width="52" height="7" rx="3.5" />
      <path d="M8 14h12v7a6 6 0 0 1-12 0z" />
      <path d="M20 14h12v7a6 6 0 0 1-12 0z" opacity=".45" />
      <path d="M32 14h12v7a6 6 0 0 1-12 0z" />
      <path d="M44 14h12v7a6 6 0 0 1-12 0z" opacity=".45" />
      <rect x="12" y="31" width="40" height="26" rx="3" opacity=".3" />
      <rect x="17" y="36" width="17" height="11" rx="2" />
      <rect x="39" y="36" width="9" height="21" rx="2" />
    </svg>
  );
}
