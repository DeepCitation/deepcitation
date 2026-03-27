/**
 * Re-exports formatCaptureDate from its canonical location in utils/dateUtils.
 * The function is a pure date formatter with no React dependency.
 *
 * Import from here for backward compatibility within the react subpath,
 * or directly from `../utils/dateUtils.js` in non-React code.
 */
export { formatCaptureDate } from "../utils/dateUtils.js";
