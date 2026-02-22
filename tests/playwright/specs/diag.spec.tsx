import { expect, test } from "@playwright/experimental-ct-react";
import { CitationComponent } from "../../../src/react/CitationComponent";

const baseCitation = {
  citationNumber: 1,
  anchorText: "Functional status",
  fullPhrase: "Functional status: He is at baseline",
  pageNumber: 5,
};

const tallImageBase64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAyAAAAZAAQAAAACpxxs4AAACPklEQVR42u3NMQEAAAwCIPuX1hZ7BgVID0QikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUQikUgkEolEIpFIJBKJRCKRSCQSiUTyNRnb9LNzJVTWGwAAAABJRU5ErkJggg==";

const verification = {
  status: "found" as const,
  verifiedMatchSnippet: "Functional status: He is at baseline",
  document: { verifiedPageNumber: 5, verificationImageSrc: tallImageBase64 },
  pages: [{ pageNumber: 5, dimensions: { width: 800, height: 1600 }, source: tallImageBase64, isMatchPage: true }],
};

test("diagnostic: dump expanded-page layout values", async ({ mount, page }) => {
  await mount(
    <div style={{ paddingTop: "300px", paddingLeft: "100px" }}>
      <CitationComponent citation={baseCitation} verification={verification} />
    </div>,
  );

  const citation = page.locator("[data-citation-id]");
  await citation.click();
  const popover = page.locator("[data-radix-popper-content-wrapper]");
  await expect(popover).toBeVisible();

  // Get BEFORE values
  const beforeBox = await popover.boundingBox();
  console.log("BEFORE expand - wrapper box:", JSON.stringify(beforeBox));

  const expandButton = popover.getByLabel(/Expand to full page/);
  await expandButton.click();
  const expandedView = popover.locator("[data-dc-inline-expanded]");
  await expect(expandedView).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(500);

  // Dump everything
  const data = await page.evaluate(() => {
    const wrapper = document.querySelector("[data-radix-popper-content-wrapper]") as HTMLElement;
    const content = wrapper?.firstElementChild as HTMLElement;
    const wrapperCS = wrapper ? getComputedStyle(wrapper) : null;
    const contentCS = content ? getComputedStyle(content) : null;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      wrapper: {
        rect: wrapper?.getBoundingClientRect(),
        position: wrapperCS?.position,
        top: wrapperCS?.top,
        left: wrapperCS?.left,
        height: wrapperCS?.height,
        maxHeight: wrapperCS?.maxHeight,
        transform: wrapperCS?.transform,
      },
      content: {
        rect: content?.getBoundingClientRect(),
        height: contentCS?.height,
        maxHeight: contentCS?.maxHeight,
        overflow: contentCS?.overflowY,
      },
      cssVars: {
        availableHeight: wrapper?.style.getPropertyValue("--radix-popper-available-height"),
        availableWidth: wrapper?.style.getPropertyValue("--radix-popper-available-width"),
      },
    };
  });
  console.log("AFTER expand:", JSON.stringify(data, null, 2));

  // Force fail to see output
  expect(true, JSON.stringify(data, null, 2)).toBe(false);
});
