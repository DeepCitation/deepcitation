import { useCallback, useMemo, useReducer } from "react";
import type { Verification } from "../../types/verification.js";
import { projectKeyholeDisplayedWidth } from "../constants.js";
import { getSummaryPopoverWidth } from "../expandedWidthPolicy.js";

type PopoverViewState = "summary" | "expanded-keyhole" | "expanded-page";
type ExpandedImageMeasurementInput = { src?: string; dimensions?: { width?: number | null } | null } | null;

type PopoverImageMeasurementsState = {
  keyholeDisplayedWidth: number | null;
  pageNaturalWidthMeasured: number | null;
  expandedPageShell: { width: number; src: string } | null;
  keyholeImageNatural: { src: string; width: number } | null;
  keyholeInitialScroll: { left: number; top: number } | null;
};

type PopoverImageMeasurementsAction =
  | { type: "keyhole-displayed-width"; width: number | null }
  | { type: "page-natural-width"; width: number }
  | { type: "expanded-page-shell"; width: number; src: string }
  | { type: "keyhole-natural-width"; width: number; src: string }
  | { type: "keyhole-scroll"; left: number; top: number };

function createPopoverImageMeasurementsState(keyholeDisplayedWidth: number | null): PopoverImageMeasurementsState {
  return {
    keyholeDisplayedWidth,
    pageNaturalWidthMeasured: null,
    expandedPageShell: null,
    keyholeImageNatural: null,
    keyholeInitialScroll: null,
  };
}

function popoverImageMeasurementsReducer(
  state: PopoverImageMeasurementsState,
  action: PopoverImageMeasurementsAction,
): PopoverImageMeasurementsState {
  switch (action.type) {
    case "keyhole-displayed-width":
      return state.keyholeDisplayedWidth === action.width ? state : { ...state, keyholeDisplayedWidth: action.width };
    case "page-natural-width":
      return state.pageNaturalWidthMeasured === action.width
        ? state
        : { ...state, pageNaturalWidthMeasured: action.width };
    case "expanded-page-shell":
      return state.expandedPageShell
        ? state
        : { ...state, expandedPageShell: { width: action.width, src: action.src } };
    case "keyhole-natural-width":
      return state.keyholeImageNatural?.src === action.src && state.keyholeImageNatural.width === action.width
        ? state
        : { ...state, keyholeImageNatural: { src: action.src, width: action.width } };
    case "keyhole-scroll":
      return state.keyholeInitialScroll?.left === action.left && state.keyholeInitialScroll.top === action.top
        ? state
        : { ...state, keyholeInitialScroll: { left: action.left, top: action.top } };
  }
}

export function usePopoverImageMeasurements({
  evidenceSrc,
  expandedImage,
  verification,
  viewState,
}: {
  evidenceSrc: string | null | undefined;
  expandedImage: ExpandedImageMeasurementInput;
  verification: Verification | null;
  viewState: PopoverViewState;
}) {
  const [imageMeasurements, dispatchImageMeasurements] = useReducer(
    popoverImageMeasurementsReducer,
    projectKeyholeDisplayedWidth(verification?.evidence?.dimensions),
    createPopoverImageMeasurementsState,
  );
  const {
    expandedPageShell,
    keyholeDisplayedWidth,
    keyholeImageNatural,
    keyholeInitialScroll,
    pageNaturalWidthMeasured,
  } = imageMeasurements;

  const handleKeyholeDisplayedWidthChange = useCallback((width: number | null) => {
    dispatchImageMeasurements({ type: "keyhole-displayed-width", width });
  }, []);

  const summaryWidth = useMemo(() => getSummaryPopoverWidth(keyholeDisplayedWidth), [keyholeDisplayedWidth]);
  const keyholeNaturalWidthSeed = useMemo(() => {
    const width = verification?.evidence?.dimensions?.width;
    return typeof width === "number" && Number.isFinite(width) && width > 0 ? width : null;
  }, [verification?.evidence?.dimensions?.width]);
  const pageNaturalWidthSeed = useMemo(() => {
    const width = expandedImage?.dimensions?.width;
    return typeof width === "number" && Number.isFinite(width) && width > 0 ? width : null;
  }, [expandedImage?.dimensions?.width]);

  const pageNaturalWidth = pageNaturalWidthMeasured ?? pageNaturalWidthSeed;
  const expandedPageShellWidth =
    viewState === "expanded-page" && expandedPageShell?.src === expandedImage?.src
      ? (expandedPageShell?.width ?? null)
      : null;

  const handlePageImageLoad = useCallback(
    (width: number, _height: number) => {
      if (!Number.isFinite(width) || width <= 0) return;
      if (viewState !== "expanded-page") {
        dispatchImageMeasurements({ type: "page-natural-width", width });
      }
      if (expandedImage?.src) {
        dispatchImageMeasurements({ type: "expanded-page-shell", width, src: expandedImage.src });
      }
    },
    [viewState, expandedImage],
  );

  const keyholeImageNaturalWidth =
    evidenceSrc && keyholeImageNatural?.src === evidenceSrc ? keyholeImageNatural.width : null;

  const expandedNaturalWidth = useMemo(() => {
    if (viewState === "expanded-page") {
      return expandedPageShellWidth ?? pageNaturalWidth ?? keyholeImageNaturalWidth ?? keyholeNaturalWidthSeed;
    }
    if (viewState === "expanded-keyhole") return keyholeImageNaturalWidth ?? keyholeNaturalWidthSeed;
    return null;
  }, [viewState, expandedPageShellWidth, pageNaturalWidth, keyholeImageNaturalWidth, keyholeNaturalWidthSeed]);

  const handleKeyholeImageLoad = useCallback(
    (width: number, _height: number) => {
      if (!evidenceSrc || !Number.isFinite(width) || width <= 0) return;
      dispatchImageMeasurements({ type: "keyhole-natural-width", width, src: evidenceSrc });
    },
    [evidenceSrc],
  );

  const handleKeyholeScrollCapture = useCallback((left: number, top: number) => {
    dispatchImageMeasurements({ type: "keyhole-scroll", left, top });
  }, []);

  const recordKeyholeNaturalWidth = useCallback((width: number, src: string) => {
    dispatchImageMeasurements({ type: "keyhole-natural-width", width, src });
  }, []);

  const lockExpandedPageShell = useCallback((width: number, src: string) => {
    dispatchImageMeasurements({ type: "expanded-page-shell", width, src });
  }, []);

  return {
    expandedNaturalWidth,
    expandedPageShellWidth,
    handleKeyholeDisplayedWidthChange,
    handleKeyholeImageLoad,
    handleKeyholeScrollCapture,
    handlePageImageLoad,
    keyholeImageNaturalWidth,
    keyholeInitialScroll,
    keyholeNaturalWidthSeed,
    lockExpandedPageShell,
    pageNaturalWidth,
    recordKeyholeNaturalWidth,
    summaryWidth,
  };
}
