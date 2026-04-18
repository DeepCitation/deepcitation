/**
 * Manages the CitationDrawer's 3-level navigation state machine:
 *   Level 1 — drawer open
 *   Level 2 — accordion item expanded
 *   Level 3 — inline header image open (full-page)
 *
 * Escape key steps back through these levels.
 * All refs, state, and the escape listener are fully encapsulated here.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Verification } from "../../types/verification.js";

export interface HeaderInlineState {
  citationKey: string;
  src: string;
  verification?: Verification | null;
  renderScale?: { x: number; y: number } | null;
  pageNumber?: number | null;
}

export interface DrawerNavContext {
  expandedCitationKey: string | null;
  onItemExpand: (key: string | null) => void;
  onInlineExpand: (
    key: string,
    src: string,
    verification?: Verification | null,
    renderScale?: { x: number; y: number } | null,
    pageNumber?: number | null,
  ) => void;
  isFullPage: boolean;
}

export interface DrawerNavigationReturn {
  expandedCitationKey: string | null;
  headerInline: HeaderInlineState | null;
  activeIndicatorKey: string | null;
  isFullPage: boolean;
  activePage: number | null;
  setActiveIndicatorKey: (key: string | null) => void;
  onInlineExpand: (
    key: string,
    src: string,
    verification?: Verification | null,
    renderScale?: { x: number; y: number } | null,
    pageNumber?: number | null,
  ) => void;
  closeInline: () => void;
  onManualExpand: () => void;
  onItemExpand: (key: string | null) => void;
  handlePageDeactivate: () => void;
  navCtxValue: DrawerNavContext;
}

export function useDrawerNavigation({
  isBottomSheet,
  keyToPage,
  onClose,
}: {
  isBottomSheet: boolean;
  keyToPage: Map<string, number>;
  onClose: () => void;
}): DrawerNavigationReturn {
  const [expandedCitationKey, setExpandedCitationKey] = useState<string | null>(null);
  const [headerInline, setHeaderInline] = useState<HeaderInlineState | null>(null);
  const [manualFullPage, setManualFullPage] = useState(false);
  const [activeIndicatorKey, setActiveIndicatorKey] = useState<string | null>(null);

  // Refs for stale-closure safety in the escape listener — registered once
  const expandedKeyRef = useRef(expandedCitationKey);
  const headerInlineRef = useRef(headerInline);
  useLayoutEffect(() => {
    expandedKeyRef.current = expandedCitationKey;
  }, [expandedCitationKey]);
  useLayoutEffect(() => {
    headerInlineRef.current = headerInline;
  }, [headerInline]);

  // onClose identity changes don't re-register the listener
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const isFullPage = isBottomSheet && (headerInline !== null || manualFullPage);

  const activePage = headerInline ? (headerInline.pageNumber ?? keyToPage.get(headerInline.citationKey) ?? null) : null;

  const onItemExpand = useCallback((key: string | null) => {
    setExpandedCitationKey(key);
  }, []);

  // Bundles the triple-reset that every level-3 → lower transition requires
  const closeInline = useCallback(() => {
    setHeaderInline(null);
    setActiveIndicatorKey(null);
    setManualFullPage(false);
  }, []);

  const onInlineExpand = useCallback(
    (
      key: string,
      src: string,
      verification?: Verification | null,
      renderScale?: { x: number; y: number } | null,
      pageNumber?: number | null,
    ) => {
      const normalizedPage = Number(pageNumber);
      setHeaderInline({
        citationKey: key,
        src,
        verification,
        renderScale,
        pageNumber: Number.isFinite(normalizedPage) && normalizedPage > 0 ? normalizedPage : null,
      });
      setActiveIndicatorKey(null);
    },
    [],
  );

  const handlePageDeactivate = useCallback(() => {
    closeInline();
  }, [closeInline]);

  const onManualExpand = useCallback(() => {
    setManualFullPage(true);
  }, []);

  // Escape key: step back through navigation levels
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (headerInlineRef.current !== null) {
        setHeaderInline(null);
        setActiveIndicatorKey(null);
        setManualFullPage(false);
      } else if (expandedKeyRef.current !== null) {
        setExpandedCitationKey(null);
      } else {
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []); // registered once; all state reads go through refs

  const navCtxValue = useMemo<DrawerNavContext>(
    () => ({ expandedCitationKey, onItemExpand, onInlineExpand, isFullPage }),
    [expandedCitationKey, onItemExpand, onInlineExpand, isFullPage],
  );

  return {
    expandedCitationKey,
    headerInline,
    activeIndicatorKey,
    isFullPage,
    activePage,
    setActiveIndicatorKey,
    onInlineExpand,
    closeInline,
    onManualExpand,
    onItemExpand,
    handlePageDeactivate,
    navCtxValue,
  };
}
