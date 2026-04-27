import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { PagePicker } from "../react/PagePicker";

afterEach(() => {
  cleanup();
});

describe("PagePicker", () => {
  it("renders descriptive pills for active and neighbor pages, dots for distant pages (expanded state)", () => {
    const onPageClick = jest.fn<(page: number) => void>();
    const { getAllByRole } = render(
      <PagePicker
        pages={[1, 2, 3, 4, 5, 6]}
        activePage={3}
        onPageClick={onPageClick}
        colorScheme="green"
        isExpanded={true}
      />,
    );

    // Active pill (p.3): button with X close treatment
    const closeButtons = getAllByRole("button").filter(
      btn => btn.getAttribute("aria-label")?.includes("Close") && btn.getAttribute("aria-label")?.includes("3"),
    );
    expect(closeButtons).toHaveLength(1);

    // Neighbor pills (p.2, p.4): buttons with chevron / expand aria-label
    const neighborButtons = getAllByRole("button").filter(btn => {
      const label = btn.getAttribute("aria-label") ?? "";
      return (
        (label.includes("Expand") || label.includes("page 2") || label.includes("page 4")) && !label.includes("Close")
      );
    });
    expect(neighborButtons.length).toBeGreaterThanOrEqual(2);

    // Dots (p.1, p.5, p.6): small dot buttons with aria-label "Go to page N"
    const dotButtons = getAllByRole("button").filter(
      btn => btn.getAttribute("aria-label")?.startsWith("Go to page") || btn.className.includes("rounded-full"),
    );
    expect(dotButtons.length).toBeGreaterThanOrEqual(3);
  });

  it("active pill shows chevron (expand) label when not in expanded state", () => {
    const onPageClick = jest.fn<(page: number) => void>();
    const { getAllByRole } = render(
      <PagePicker
        pages={[1, 2, 3, 4, 5, 6]}
        activePage={3}
        onPageClick={onPageClick}
        colorScheme="green"
        isExpanded={false}
      />,
    );

    // In non-expanded state the active pill should offer "Expand", not "Close"
    const expandButtons = getAllByRole("button").filter(btn => btn.getAttribute("aria-label")?.includes("full page 3"));
    expect(expandButtons).toHaveLength(1);

    const closeButtons = getAllByRole("button").filter(
      btn => btn.getAttribute("aria-label")?.includes("Close") && btn.getAttribute("aria-label")?.includes("3"),
    );
    expect(closeButtons).toHaveLength(0);
  });

  it("fires onPageClick with the correct page when a neighbor pill is clicked", () => {
    const onPageClick = jest.fn<(page: number) => void>();
    const { getAllByRole } = render(
      <PagePicker
        pages={[1, 2, 3, 4, 5, 6]}
        activePage={3}
        onPageClick={onPageClick}
        colorScheme="green"
        isExpanded={true}
      />,
    );

    // Neighbor p.4 pill — has "Expand to full page 4" aria-label
    const neighbor4 = getAllByRole("button").find(btn => btn.getAttribute("aria-label")?.includes("4"));
    expect(neighbor4).toBeTruthy();
    if (neighbor4) fireEvent.click(neighbor4);

    const calls = (onPageClick as jest.MockedFunction<(page: number) => void>).mock.calls;
    expect(calls.some(([page]) => page === 4)).toBe(true);
  });

  it("fires onPageClick with the correct page when a dot is clicked", () => {
    const onPageClick = jest.fn<(page: number) => void>();
    const { getAllByRole } = render(
      <PagePicker
        pages={[1, 2, 3, 4, 5, 6]}
        activePage={3}
        onPageClick={onPageClick}
        colorScheme="green"
        isExpanded={true}
      />,
    );

    const dot1 = getAllByRole("button").find(btn => btn.getAttribute("aria-label") === "Go to page 1");
    expect(dot1).toBeTruthy();
    if (dot1) fireEvent.click(dot1);

    const calls = (onPageClick as jest.MockedFunction<(page: number) => void>).mock.calls;
    expect(calls.some(([page]) => page === 1)).toBe(true);
  });

  it("two-page input renders two descriptive pills with no dots", () => {
    const onPageClick = jest.fn<(page: number) => void>();
    const { getAllByRole } = render(
      <PagePicker pages={[2, 3]} activePage={2} onPageClick={onPageClick} colorScheme="amber" isExpanded={true} />,
    );

    const allButtons = getAllByRole("button");
    // Both pages are active or neighbor — no dots
    const dotButtons = allButtons.filter(btn => btn.className.includes("rounded-full"));
    expect(dotButtons).toHaveLength(0);

    // Should have exactly two buttons total (one active, one neighbor)
    expect(allButtons).toHaveLength(2);
  });
});
