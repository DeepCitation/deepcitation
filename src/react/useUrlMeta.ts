/**
 * URL Metadata Hook
 *
 * This module contains the useUrlMeta hook for creating URL citation metadata.
 * It is separated from the component file to comply with Fast Refresh rules.
 */

import { useMemo } from "react";
import type { UrlCitationMeta, UrlFetchStatus } from "./types.js";
import { extractDomain } from "./urlUtils.js";

/**
 * Hook to parse URL and create UrlCitationMeta.
 */
export function useUrlMeta(
  url: string,
  fetchStatus: UrlFetchStatus = "unknown",
  additionalMeta?: Partial<UrlCitationMeta>,
): UrlCitationMeta {
  return useMemo(
    () => ({
      url,
      domain: extractDomain(url),
      fetchStatus,
      ...additionalMeta,
    }),
    [url, fetchStatus, additionalMeta],
  );
}
