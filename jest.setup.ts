import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

// Polyfill TextEncoder/TextDecoder for jsdom environment (needed by sha.ts)
if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Polyfill ResizeObserver for jsdom (used by usePopoverAlignOffset, InlineExpandedImage)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

// Polyfill fetch for jsdom
if (typeof globalThis.fetch === "undefined") {
  (globalThis as any).fetch = () => Promise.reject(new Error("fetch not available in test"));
}

// Suppress false-positive act() warnings from the custom popover components.
// The custom popover (Popover.tsx + PopoverPrimitives.tsx) triggers internal state updates
// through event handlers (position recomputation, ResizeObserver callbacks) that React
// Testing Library doesn't automatically wrap in act(). Tests are correctly structured;
// these are noise from async internal updates, not test logic errors.
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("An update to") &&
      args[0].includes("inside a test was not wrapped in act")
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
