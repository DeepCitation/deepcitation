import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { EVIDENCE_LIST_COLLAPSE_TOTAL_MS, EVIDENCE_LIST_EXPAND_STEP_MS } from "../constants.js";
import {
  resolveEvidenceListOpacity,
  resolveEvidenceListPaddingTop,
  resolveEvidenceListRevealRatio,
  resolveEvidenceListTransform,
  resolveEvidenceListTransition,
  searchLogAnimReducer,
} from "./searchLogAnimation.js";

export function useSearchLogAnimation({
  prefersReducedMotion,
  showSearchLog,
}: {
  prefersReducedMotion: boolean;
  showSearchLog: boolean;
}): {
  isSearchLogMounted: boolean;
  searchLogMotionStyle: React.CSSProperties;
  searchLogViewportRef: React.RefObject<HTMLDivElement | null>;
} {
  const [searchLogAnim, dispatchSearchLog] = useReducer(searchLogAnimReducer, {
    mounted: false,
    stage: "idle",
  });
  const isSearchLogMounted = searchLogAnim.mounted;
  const searchLogStage = searchLogAnim.stage;
  const searchLogMountedRef = useRef(isSearchLogMounted);
  const searchLogEnterRafRef = useRef<number>(0);
  const searchLogExitRafRef = useRef<number>(0);
  const searchLogSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchLogExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    searchLogMountedRef.current = isSearchLogMounted;
  }, [isSearchLogMounted]);

  // Search-log enter/exit animation sequence. Uses dispatchSearchLog (single dispatch)
  // instead of multiple setState calls to satisfy the React Compiler.
  useEffect(() => {
    const clearScheduled = () => {
      cancelAnimationFrame(searchLogEnterRafRef.current);
      searchLogEnterRafRef.current = 0;
      cancelAnimationFrame(searchLogExitRafRef.current);
      searchLogExitRafRef.current = 0;
      if (searchLogSettleTimerRef.current) {
        clearTimeout(searchLogSettleTimerRef.current);
        searchLogSettleTimerRef.current = null;
      }
      if (searchLogExitTimerRef.current) {
        clearTimeout(searchLogExitTimerRef.current);
        searchLogExitTimerRef.current = null;
      }
    };

    clearScheduled();

    if (prefersReducedMotion) {
      dispatchSearchLog({ type: "instant", show: showSearchLog });
    } else if (showSearchLog) {
      dispatchSearchLog({ type: "enter" });
      // Two RAFs guarantee a painted frame at enter-a before we begin the 95% reveal.
      searchLogEnterRafRef.current = requestAnimationFrame(() => {
        searchLogEnterRafRef.current = requestAnimationFrame(() => {
          dispatchSearchLog({ type: "stage", stage: "enter-b" });
          searchLogSettleTimerRef.current = setTimeout(() => {
            dispatchSearchLog({ type: "stage", stage: "steady" });
            searchLogSettleTimerRef.current = null;
          }, EVIDENCE_LIST_EXPAND_STEP_MS);
        });
      });
    } else if (!searchLogMountedRef.current) {
      dispatchSearchLog({ type: "stage", stage: "idle" });
    } else {
      dispatchSearchLog({ type: "stage", stage: "exit-a" });
      // Match expand behavior: force one painted 70% frame before collapsing to 0%.
      searchLogExitRafRef.current = requestAnimationFrame(() => {
        searchLogExitRafRef.current = requestAnimationFrame(() => {
          dispatchSearchLog({ type: "stage", stage: "exit-b" });
        });
      });
      searchLogExitTimerRef.current = setTimeout(() => {
        dispatchSearchLog({ type: "unmount" });
        searchLogExitTimerRef.current = null;
      }, EVIDENCE_LIST_COLLAPSE_TOTAL_MS);
    }

    return () => {
      cancelAnimationFrame(searchLogEnterRafRef.current);
      searchLogEnterRafRef.current = 0;
      cancelAnimationFrame(searchLogExitRafRef.current);
      searchLogExitRafRef.current = 0;
      if (searchLogSettleTimerRef.current) {
        clearTimeout(searchLogSettleTimerRef.current);
        searchLogSettleTimerRef.current = null;
      }
      if (searchLogExitTimerRef.current) {
        clearTimeout(searchLogExitTimerRef.current);
        searchLogExitTimerRef.current = null;
      }
    };
  }, [showSearchLog, prefersReducedMotion]);

  const searchLogViewportRef = useRef<HTMLDivElement>(null);
  const [searchLogContentHeight, setSearchLogContentHeight] = useState(0);
  useLayoutEffect(() => {
    if (!isSearchLogMounted) return;
    const viewport = searchLogViewportRef.current;
    if (!viewport) return;

    const resolvedMaxHeight = Number.parseFloat(window.getComputedStyle(viewport).maxHeight);
    const maxHeightLimit = Number.isFinite(resolvedMaxHeight) ? resolvedMaxHeight : viewport.scrollHeight;
    const nextHeight = Math.max(0, Math.min(viewport.scrollHeight, maxHeightLimit));
    setSearchLogContentHeight(prev => (Math.abs(prev - nextHeight) > 0.5 ? nextHeight : prev));
  }, [isSearchLogMounted]);

  const searchLogMotionStyle = useMemo<React.CSSProperties>(() => {
    const revealRatio = resolveEvidenceListRevealRatio(searchLogStage);
    const revealHeightPx = Math.round(searchLogContentHeight * revealRatio);
    if (prefersReducedMotion) {
      return {
        display: "block",
        overflow: "hidden",
        maxHeight: `${Math.max(0, revealHeightPx)}px`,
        opacity: showSearchLog ? 1 : 0,
        paddingTop: "0px",
        transform: "translate3d(0, 0, 0)",
        transition: "none",
      };
    }
    return {
      display: "block",
      overflow: "hidden",
      maxHeight: `${Math.max(0, revealHeightPx)}px`,
      opacity: resolveEvidenceListOpacity(searchLogStage),
      paddingTop: resolveEvidenceListPaddingTop(searchLogStage),
      transform: resolveEvidenceListTransform(searchLogStage),
      transition: resolveEvidenceListTransition(searchLogStage),
      willChange: searchLogStage === "steady" ? undefined : "transform, padding-top, max-height, opacity",
    };
  }, [searchLogContentHeight, searchLogStage, prefersReducedMotion, showSearchLog]);

  return {
    isSearchLogMounted,
    searchLogMotionStyle,
    searchLogViewportRef,
  };
}
