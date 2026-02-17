/**
 * Computes the initial scrollLeft position for the keyhole strip image.
 * Centers the view on the highlight region when bounding box data is available.
 *
 * @param imageNaturalWidth - The natural (unscaled) width of the image in pixels
 * @param containerWidth - The rendered width of the strip container in pixels
 * @param highlightBox - Bounding box of the matched text (in image pixel coordinates)
 * @returns scrollLeft value and which edges should fade
 */
export function computeKeyholeOffset(
  imageNaturalWidth: number,
  containerWidth: number,
  highlightBox?: { x: number; width: number } | null,
): { scrollLeft: number; fadeLeft: boolean; fadeRight: boolean } {
  // Image fits within container — no scrolling, no fades
  if (imageNaturalWidth <= containerWidth) {
    return { scrollLeft: 0, fadeLeft: false, fadeRight: false };
  }

  const maxScroll = imageNaturalWidth - containerWidth;

  // No highlight data — center the image
  if (!highlightBox) {
    const scrollLeft = Math.max(0, maxScroll / 2);
    return {
      scrollLeft,
      fadeLeft: scrollLeft > 2,
      fadeRight: scrollLeft + containerWidth < imageNaturalWidth - 2,
    };
  }

  const highlightCenterX = highlightBox.x + highlightBox.width / 2;
  const highlightLeft = highlightBox.x;
  const highlightRight = highlightBox.x + highlightBox.width;

  let scrollLeft: number;

  // Smart alignment based on highlight position within the image
  if (highlightLeft < imageNaturalWidth * 0.15) {
    // Match near start of line → align left
    scrollLeft = 0;
  } else if (highlightRight > imageNaturalWidth * 0.85) {
    // Match near end of line → align right
    scrollLeft = maxScroll;
  } else {
    // Match in middle → center on highlight
    scrollLeft = highlightCenterX - containerWidth / 2;
  }

  // Clamp to valid range
  scrollLeft = Math.max(0, Math.min(scrollLeft, maxScroll));

  return {
    scrollLeft,
    fadeLeft: scrollLeft > 2,
    fadeRight: scrollLeft + containerWidth < imageNaturalWidth - 2,
  };
}
