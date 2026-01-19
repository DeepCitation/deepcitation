/**
 * DeepCitation icon SVG (no dependencies)
 * Default size is 1em (inherits font size). Use className to override.
 */
export const DeepCitationIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    shapeRendering="crispEdges"
    className={className}
    width="1em"
    height="1em"
  >
    <path d="M7 3 L3 3 L3 21 L7 21" />
    <path d="M17 3 L21 3 L21 21 L17 21" />
  </svg>
);

/**
 * Check icon SVG (no dependencies)
 * Size is controlled by parent container - use size-2 or similar on wrapper
 */
export const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ width: "100%", height: "100%" }}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * Warning icon SVG (no dependencies)
 * Size is controlled by parent container - use size-2 or similar on wrapper
 */
export const WarningIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 256 256"
    fill="currentColor"
    aria-hidden="true"
    style={{ width: "100%", height: "100%" }}
  >
    <path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z" />
  </svg>
);

/**
 * Spinner component for loading/pending state
 * Size is controlled by parent container - use size-2 or similar on wrapper
 * Animation (animate-spin) should be applied to the wrapper
 */
export const SpinnerIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    style={{ width: "100%", height: "100%" }}
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
      style={{ opacity: 0.25 }}
    />
    <path
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      style={{ opacity: 0.75 }}
    />
  </svg>
);
