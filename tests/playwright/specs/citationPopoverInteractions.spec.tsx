import { expect, test } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../../src/react";
import type { Citation } from "../../../src/types/citation";
import type { Verification } from "../../../src/types/verification";

// =============================================================================
// TEST FIXTURES
// =============================================================================

const baseCitation: Citation = {
  citationNumber: 1,
  anchorText: "25% revenue growth",
  fullPhrase: "The company reported 25% revenue growth in Q4",
  pageNumber: 5,
  lineIds: [12, 13],
};

// Verification with search attempts to enable expandable details section
const verificationWithDetails: Verification = {
  status: "not_found",
  searchAttempts: [
    {
      method: "exact",
      success: false,
      searchPhrase: "25% revenue growth",
    },
    {
      method: "partial",
      success: false,
      searchPhrase: "revenue growth",
    },
  ],
};

// Valid 4x4 gray PNG for testing (not truncated)
const testImageBase64 = (() => {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#cccccc";
      ctx.fillRect(0, 0, 400, 50);
      return canvas.toDataURL("image/png");
    }
  }
  // Fallback: valid 1x1 gray PNG
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwYGBgYGAAi7Av7W3NgAAAAASUVORK5CYII=";
})();

const verifiedVerification: Verification = {
  status: "found",
  document: {
    verifiedPageNumber: 5,
    verificationImageSrc: testImageBase64,
    verificationImageDimensions: { width: 400, height: 50 },
  },
};

// Tall image to amplify summary -> expanded-keyhole geometry changes near viewport edges.
const tallImageBase64 = (() => {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 1600;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#dddddd";
      ctx.fillRect(0, 0, 800, 1600);
      return canvas.toDataURL("image/png");
    }
  }
  // Fallback: valid 1x1 gray PNG
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8cuXKfwYGBgYGAAi7Av7W3NgAAAAASUVORK5CYII=";
})();

const tallVerification: Verification = {
  status: "found",
  document: {
    verifiedPageNumber: 5,
    verificationImageSrc: tallImageBase64,
    verificationImageDimensions: { width: 800, height: 1600 },
  },
};

// =============================================================================
// BASIC POPOVER BEHAVIOR TESTS
// =============================================================================

test.describe("Citation Popover - Basic Behavior", () => {
  test("opens popover on citation click", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Popover should be visible (use role="dialog" for specificity)
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();
  });

  test("closes popover on Escape key", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Popover should be open
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Press Escape on the page (Radix listens to document-level events)
    await page.keyboard.press("Escape");

    // Wait for close animation to complete
    await page.waitForTimeout(500);

    // Popover should be closed
    const isVisible = await popover.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });

  test("closes popover on click outside", async ({ mount, page }) => {
    await mount(
      <div>
        <CitationComponent citation={baseCitation} verification={verifiedVerification} />
        <div data-testid="outside-area" style={{ padding: "100px" }}>
          Outside area
        </div>
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Popover should be open
    await expect(page.getByRole("dialog")).toBeVisible();

    // Click outside
    await page.locator('[data-testid="outside-area"]').click();

    // Popover should be closed (with a small delay for animation)
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 1000 });
  });

  test("shows verification image when available", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    // Image should be visible in popover (keyhole strip — other imgs are hidden by display:none)
    const popover = page.getByRole("dialog");
    const image = popover.locator("[data-dc-keyhole] img");
    await expect(image).toBeVisible();
  });
});

// =============================================================================
// CLICK-TO-CLOSE BEHAVIOR TESTS
// =============================================================================

test.describe("Citation Popover - Click-to-Close Behavior", () => {
  test("expanding evidence tray does not dismiss popover", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");

    // Open popover
    await citation.click();
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Click the evidence tray's "Expand to full page" button inside the popover.
    // Use exact match to avoid ambiguity with the page pill ("Expand to full page 5").
    const expandButton = popover.getByRole("button", { name: "Expand to full page", exact: true });
    await expect(expandButton).toBeVisible();
    await expandButton.dispatchEvent("click");

    // Popover should STILL be visible after expansion
    await expect(popover).toBeVisible();

    // Wait a moment — popover stays open because it's click-to-close, not hover-to-close
    await page.waitForTimeout(500);
    await expect(popover).toBeVisible();
  });

  test("popover remains open after multiple evidence tray clicks", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");

    // Open popover
    await citation.click();
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Click evidence tray to expand — verifying the popover survives the transition.
    const expandButton = popover.getByRole("button", { name: "Expand to full page", exact: true });
    await expect(expandButton).toBeVisible();
    await expandButton.dispatchEvent("click");
    await page.waitForTimeout(100);

    // Popover should still be visible in expanded-keyhole state
    await expect(popover).toBeVisible();

    // Click the page pill to switch to expanded-page view (another internal transition)
    const pagePill = popover.getByRole("button", { name: /full page/i }).first();
    if (await pagePill.isVisible()) {
      await pagePill.dispatchEvent("click");
      await page.waitForTimeout(100);
    }

    // Popover should still be open after internal view transitions
    await expect(popover).toBeVisible();
  });

  test("popover stays open when mouse moves away (click-to-close model)", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");

    // Open popover via click
    await citation.click();
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Move mouse away — popover should NOT close (click-to-close, not hover-to-close)
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await expect(popover).toBeVisible();
  });

  test("popover closes on second click of the same citation", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");

    // First click opens
    await citation.click();
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Second click closes
    await citation.click();
    await expect(popover).not.toBeVisible({ timeout: 1000 });
  });

  test("bottom-edge keyhole expand should not oscillate vertically", async ({ mount, page }) => {
    await mount(
      <div style={{ paddingTop: "430px", paddingLeft: "80px" }}>
        <CitationComponent citation={baseCitation} verification={tallVerification} />
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();
    const initialRect = await popover.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, width: rect.width };
    });

    const expandButton = popover.getByRole("button", { name: "Expand to full page", exact: true });
    await expect(expandButton).toBeVisible();
    await expandButton.dispatchEvent("click");

    const samples = await page.evaluate(async () => {
      const dialog = document.querySelector("[role='dialog']") as HTMLElement | null;
      if (!dialog) return { top: [], guardDy: [], left: [], width: [], inlineOpacity: [] };
      const top: number[] = [];
      const guardDy: number[] = [];
      const left: number[] = [];
      const width: number[] = [];
      const inlineOpacity: number[] = [];
      const start = performance.now();
      await new Promise<void>(resolve => {
        const tick = () => {
          const rect = dialog.getBoundingClientRect();
          top.push(rect.top);
          left.push(rect.left);
          width.push(rect.width);
          const nums = dialog.style.translate.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
          guardDy.push(nums[1] ?? 0);
          const inlineFrame = dialog.querySelector("[data-dc-inline-expanded] > div") as HTMLElement | null;
          const opacity = inlineFrame ? Number.parseFloat(getComputedStyle(inlineFrame).opacity) : 1;
          inlineOpacity.push(Number.isFinite(opacity) ? opacity : 1);
          if (performance.now() - start >= 450) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return { top, guardDy, left, width, inlineOpacity };
    });

    const deltas = samples.top.slice(1).map((value, index) => value - samples.top[index]);
    const significantDeltas = deltas.filter(delta => Math.abs(delta) >= 1.5);
    const guardActiveFrameCount = samples.guardDy.filter(dy => Math.abs(dy) >= 0.5).length;

    let previousSign = 0;
    let reversals = 0;
    for (const delta of significantDeltas) {
      const sign = delta > 0 ? 1 : -1;
      if (previousSign !== 0 && sign !== previousSign) reversals += 1;
      previousSign = sign;
    }

    const sameWidthLeftTeleports = samples.left.filter((value, index) => {
      const widthDiff = Math.abs((samples.width[index] ?? 0) - initialRect.width);
      return widthDiff <= 2 && value < initialRect.left - 24;
    }).length;
    const minInlineOpacity = samples.inlineOpacity.length > 0 ? Math.min(...samples.inlineOpacity) : 1;

    // Ensure this scenario actually hits viewport guard correction while expanding.
    expect(guardActiveFrameCount).toBeGreaterThan(0);
    // Allow a single direction change (settle) but prevent repeated up/down oscillation.
    expect(reversals).toBeLessThanOrEqual(1);
    // Prevent a "same-width teleport left" frame before width expansion starts.
    expect(sameWidthLeftTeleports).toBe(0);
    // Expanded keyhole content should not fade to near-blank during entry.
    expect(minInlineOpacity).toBeGreaterThan(0.8);
  });

  test("center keyhole click should not left-snap at same width or spike quote gap", async ({ mount, page }) => {
    await mount(
      <div style={{ paddingTop: "80px", paddingLeft: "220px" }}>
        <CitationComponent citation={baseCitation} verification={tallVerification} />
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();
    const initialRect = await popover.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, width: rect.width };
    });

    const keyholeImage = popover.locator("[data-dc-keyhole] img");
    await expect(keyholeImage).toBeVisible();
    await keyholeImage.click();

    const samples = await page.evaluate(async () => {
      const dialog = document.querySelector("[role='dialog']") as HTMLElement | null;
      if (!dialog) return { left: [], width: [], quoteGap: [] };
      const left: number[] = [];
      const width: number[] = [];
      const quoteGap: number[] = [];
      const start = performance.now();
      await new Promise<void>(resolve => {
        const tick = () => {
          const rect = dialog.getBoundingClientRect();
          left.push(rect.left);
          width.push(rect.width);

          const quoteEl = Array.from(dialog.querySelectorAll("div")).find(el =>
            el.textContent?.includes("The company reported 25% revenue growth in Q4"),
          ) as HTMLElement | undefined;
          const keyhole = dialog.querySelector("[data-dc-inline-expanded]") as HTMLElement | null;
          if (quoteEl && keyhole) {
            const quoteBottom = quoteEl.getBoundingClientRect().bottom;
            const keyholeTop = keyhole.getBoundingClientRect().top;
            quoteGap.push(keyholeTop - quoteBottom);
          } else {
            quoteGap.push(0);
          }

          if (performance.now() - start >= 900) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return { left, width, quoteGap };
    });

    const sameWidthLeftTeleports = samples.left.filter((value, index) => {
      const widthDiff = Math.abs((samples.width[index] ?? 0) - initialRect.width);
      return widthDiff <= 2 && value < initialRect.left - 24;
    }).length;
    const finalGap = samples.quoteGap[samples.quoteGap.length - 1] ?? 0;
    const maxGap = samples.quoteGap.length > 0 ? Math.max(...samples.quoteGap) : finalGap;

    expect(sameWidthLeftTeleports).toBe(0);
    expect(maxGap - finalGap).toBeLessThanOrEqual(20);
  });

  test("expanded-page roundtrip should not left-snap or show transient right gap", async ({ mount, page }) => {
    await mount(
      <div style={{ paddingTop: "120px", paddingLeft: "120px" }}>
        <CitationComponent citation={baseCitation} verification={tallVerification} />
      </div>,
    );

    const citation = page.locator("[data-citation-id]");
    await citation.click();

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    const expandButton = popover.getByRole("button", { name: "Expand to full page", exact: true });
    await expect(expandButton).toBeVisible();
    await expandButton.dispatchEvent("click");

    const toPageButton = popover.getByRole("button", { name: /Expand to full page/i }).first();
    await expect(toPageButton).toBeVisible();

    // keyhole -> expanded-page
    await toPageButton.dispatchEvent("click");
    const pageExpandSamples = await page.evaluate(async () => {
      const dialog = document.querySelector("[role='dialog']") as HTMLElement | null;
      if (!dialog) return { inlineOpacity: [] as number[] };
      const inlineOpacity: number[] = [];
      const start = performance.now();
      await new Promise<void>(resolve => {
        const tick = () => {
          const visibleInline = Array.from(dialog.querySelectorAll("[data-dc-inline-expanded]")).find(
            el => (el as HTMLElement).offsetParent !== null,
          ) as HTMLElement | undefined;
          if (visibleInline) {
            const frame = visibleInline.querySelector(":scope > div") as HTMLElement | null;
            const opacity = frame ? Number.parseFloat(getComputedStyle(frame).opacity) : 1;
            inlineOpacity.push(Number.isFinite(opacity) ? opacity : 1);
          }
          if (performance.now() - start >= 420) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return { inlineOpacity };
    });
    const minPageExpandOpacity =
      pageExpandSamples.inlineOpacity.length > 0 ? Math.min(...pageExpandSamples.inlineOpacity) : 1;

    // expanded-page -> keyhole
    const backToKeyholeButton = popover.getByRole("button", { name: /Close (page|image)/i }).first();
    await expect(backToKeyholeButton).toBeVisible();
    await backToKeyholeButton.dispatchEvent("click");
    const pageCollapseSamples = await page.evaluate(async () => {
      const dialog = document.querySelector("[role='dialog']") as HTMLElement | null;
      if (!dialog) return { maxTransitionSeconds: 0 };

      const parseMaxTransitionSeconds = (value: string): number => {
        const durations = value
          .split(",")
          .map(part => part.trim())
          .map(part => {
            if (part.endsWith("ms")) return Number.parseFloat(part) / 1000;
            if (part.endsWith("s")) return Number.parseFloat(part);
            return 0;
          })
          .filter(n => Number.isFinite(n));
        return durations.length > 0 ? Math.max(...durations) : 0;
      };

      let maxTransitionSeconds = 0;
      const start = performance.now();
      await new Promise<void>(resolve => {
        const tick = () => {
          const visibleInline = Array.from(dialog.querySelectorAll("[data-dc-inline-expanded]")).find(
            el => (el as HTMLElement).offsetParent !== null,
          ) as HTMLElement | undefined;
          if (visibleInline) {
            const frame = visibleInline.querySelector(":scope > div") as HTMLElement | null;
            if (frame) {
              const style = getComputedStyle(frame);
              const duration = parseMaxTransitionSeconds(style.transitionDuration);
              if (duration > maxTransitionSeconds) maxTransitionSeconds = duration;
            }
          }
          if (performance.now() - start >= 260) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      return { maxTransitionSeconds };
    });
    const toPageButtonAfterCollapse = popover.getByRole("button", { name: /Expand to full page/i }).first();
    await expect(toPageButtonAfterCollapse).toBeVisible();

    expect(minPageExpandOpacity).toBeGreaterThan(0.8);
    expect(pageCollapseSamples.maxTransitionSeconds).toBeLessThanOrEqual(0.12);
  });
});

// =============================================================================
// HOVER TRANSITIONS TESTS
// =============================================================================

test.describe("Citation Popover - Hover Transitions", () => {
  test("highlights citation on mouse enter", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} variant="linter" />);

    const citation = page.locator("[data-citation-id]");

    // Verify citation is visible
    await expect(citation).toBeVisible();

    // Hover over citation - this test verifies hover doesn't crash, not color changes
    // (color changes are difficult to test reliably in component tests)
    await citation.hover();
    await page.waitForTimeout(100);

    // Citation should still be visible after hover
    await expect(citation).toBeVisible();
  });

  test("clears highlight when mouse leaves before click", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} variant="linter" />);

    const citation = page.locator("[data-citation-id]");

    // Hover
    await citation.hover();
    await page.waitForTimeout(100);

    // Move away without clicking
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);

    // Popover should not be visible
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("popover stays open when mouse leaves popover content", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");

    // Open popover via click
    await citation.click();
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Move mouse into popover content
    await popover.hover();
    await page.waitForTimeout(100);
    await expect(popover).toBeVisible();

    // Move mouse away — popover should NOT close (click-to-close model)
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await expect(popover).toBeVisible();
  });
});

// =============================================================================
// MOBILE/TOUCH BEHAVIOR TESTS
// =============================================================================

test.describe("Citation Popover - Mobile/Touch Behavior", () => {
  // Configure mobile viewport with touch support
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
  });

  test("first tap opens popover", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verificationWithDetails} />);

    const citation = page.locator("[data-citation-id]");

    // First tap
    await citation.tap();

    // Popover should be visible
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();
  });

  test("tap on evidence tray expands to full page", async ({ mount, page }) => {
    await mount(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);

    const citation = page.locator("[data-citation-id]");

    // First tap to open
    await citation.tap();
    await page.waitForTimeout(100);

    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Tap the evidence tray to expand to full page view.
    // Use exact match to avoid ambiguity with the page pill ("Expand to full page 5").
    const expandButton = popover.getByRole("button", { name: "Expand to full page", exact: true });
    await expandButton.tap();

    // Popover should still be visible and transitioned to expanded view —
    // the keyhole image should be replaced by the expanded inline image.
    await expect(popover).toBeVisible();
    await expect(popover.locator("[data-dc-keyhole]")).not.toBeVisible();
  });

  test("tap outside closes popover", async ({ mount, page }) => {
    await mount(
      <div style={{ width: "375px", height: "667px", position: "relative" }}>
        <div style={{ padding: "20px" }}>
          <CitationComponent citation={baseCitation} verification={verifiedVerification} />
        </div>
      </div>,
    );

    const citation = page.locator("[data-citation-id]");

    // Open popover with tap
    await citation.tap();
    const popover = page.getByRole("dialog");
    await expect(popover).toBeVisible();

    // Wait for popover to fully open
    await page.waitForTimeout(300);

    // Full tap gesture outside: touchstart + touchend (no touchmove = finger didn't move).
    // The dismiss handler requires the complete tap sequence, not just touchstart.
    await page.evaluate(() => {
      const touch = new Touch({
        identifier: 0,
        target: document.body,
        clientX: 10,
        clientY: 10,
      });
      document.body.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [touch],
          targetTouches: [touch],
          changedTouches: [touch],
        }),
      );
      document.body.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [touch],
        }),
      );
    });

    // Wait for close animation
    await page.waitForTimeout(300);

    // Popover should close
    const isVisible = await popover.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });
});
