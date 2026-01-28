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
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    style={{ width: "100%", height: "100%" }}
  >
    <path d="M22.2,17.63,14,3.4h0a2.32,2.32,0,0,0-4,0L1.8,17.63a2.2,2.2,0,0,0,0,2.22A2.28,2.28,0,0,0,3.8,21h16.4a2.28,2.28,0,0,0,2-1.14A2.2,2.2,0,0,0,22.2,17.63ZM11.25,9.75a.75.75,0,0,1,1.5,0v3.75a.75.75,0,0,1-1.5,0Zm.75,8.25a1.13,1.13,0,1,1,1.13-1.13A1.13,1.13,0,0,1,12,18Z" />
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

/**
 * Link/chain icon for inline URL citations (Gemini-style)
 * Size is controlled by parent container - use size-3 or similar on wrapper
 */
export const LinkIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ width: "100%", height: "100%" }}
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

/**
 * External link icon for opening URLs
 * Size is controlled by parent container
 */
export const ExternalLinkIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ width: "100%", height: "100%" }}
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

/**
 * Close/X icon
 * Size is controlled by parent container
 */
export const CloseIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ width: "100%", height: "100%" }}
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
