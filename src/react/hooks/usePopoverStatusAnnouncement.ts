import { useEffect, useRef } from "react";
import type { TranslateFunction } from "../i18n.js";

export function usePopoverStatusAnnouncement({
  isMiss,
  isPartialMatch,
  isPending,
  isVerified,
  t,
}: {
  isMiss: boolean;
  isPartialMatch: boolean;
  isPending: boolean;
  isVerified: boolean;
  t: TranslateFunction;
}) {
  const prevIsPendingRef = useRef(isPending);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = liveRegionRef.current;
    if (!el) return;
    if (prevIsPendingRef.current && !isPending) {
      if (isVerified && !isPartialMatch && !isMiss) {
        el.textContent = t("aria.announcement.verifiedExact");
      } else if (isMiss) {
        el.textContent = t("aria.announcement.notFound");
      } else if (isPartialMatch) {
        el.textContent = t("aria.announcement.partial");
      }
    } else if (!prevIsPendingRef.current && isPending) {
      el.textContent = "";
    }
    prevIsPendingRef.current = isPending;
  }, [isPending, isVerified, isPartialMatch, isMiss, t]);

  return liveRegionRef;
}
