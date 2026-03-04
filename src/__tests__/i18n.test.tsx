import { afterEach, describe, expect, it } from "@jest/globals";
import { cleanup, render, screen } from "@testing-library/react";
import {
  createTranslator,
  DeepCitationI18nProvider,
  defaultMessages,
  defaultTranslator,
  type MessageKey,
  tPlural,
  useTranslation,
} from "../react/i18n";

// =============================================================================
// createTranslator
// =============================================================================

describe("createTranslator", () => {
  it("returns default English messages when no overrides provided", () => {
    const t = createTranslator();
    expect(t("status.verified")).toBe("Verified");
    expect(t("status.notFound")).toBe("Not Found");
  });

  it("overrides specific messages while falling back to defaults", () => {
    const t = createTranslator({ "status.verified": "Vérifié" });
    expect(t("status.verified")).toBe("Vérifié");
    expect(t("status.notFound")).toBe("Not Found"); // fallback
  });

  it("interpolates {placeholder} values", () => {
    const t = createTranslator();
    expect(t("message.foundOnOtherPage", { actualPage: 5, expectedPage: 3 })).toBe(
      "Found on p.\u202f5 (expected p.\u202f3)",
    );
  });

  it("leaves unmatched placeholders as-is", () => {
    const t = createTranslator();
    // location.page has {pageNumber} — omit the value
    expect(t("location.page")).toBe("p.\u202f{pageNumber}");
  });

  it("handles null/undefined interpolation values gracefully", () => {
    const t = createTranslator({
      "misc.warning": "Value: {val}",
    });
    // Pass an object where val is not present — placeholder stays
    expect(t("misc.warning", {})).toBe("Value: {val}");
  });

  it("converts numeric interpolation values to strings", () => {
    const t = createTranslator();
    expect(t("citation.fallback", { number: 42 })).toBe("Citation 42");
  });

  it("returns template without replacement when no values passed", () => {
    const t = createTranslator();
    expect(t("citation.fallback")).toBe("Citation {number}");
  });

  it("is a no-op when values are passed but template has no placeholders", () => {
    const t = createTranslator();
    expect(t("status.verified", { foo: "bar" })).toBe("Verified");
  });
});

// =============================================================================
// defaultTranslator singleton
// =============================================================================

describe("defaultTranslator", () => {
  it("is a pre-built translator using default messages", () => {
    expect(defaultTranslator("status.verified")).toBe("Verified");
    expect(defaultTranslator("status.verifying")).toBe("Verifying\u2026");
  });
});

// =============================================================================
// tPlural
// =============================================================================

describe("tPlural", () => {
  const t = createTranslator();

  it("selects _one suffix for count === 1", () => {
    expect(tPlural(t, "outcome.scanComplete", 1, { count: 1 })).toBe("Scan complete \u00b7 1 search");
  });

  it("selects _other suffix for count > 1", () => {
    expect(tPlural(t, "outcome.scanComplete", 4, { count: 4 })).toBe("Scan complete \u00b7 4 searches");
  });

  it("selects _other suffix for count === 0", () => {
    expect(tPlural(t, "outcome.scanComplete", 0, { count: 0 })).toBe("Scan complete \u00b7 0 searches");
  });

  it("works with custom translations", () => {
    const tFr = createTranslator({
      "outcome.scanComplete_one": "Analyse terminée \u00b7 {count} recherche",
      "outcome.scanComplete_other": "Analyse terminée \u00b7 {count} recherches",
    });
    expect(tPlural(tFr, "outcome.scanComplete", 1, { count: 1 })).toBe("Analyse terminée \u00b7 1 recherche");
    expect(tPlural(tFr, "outcome.scanComplete", 3, { count: 3 })).toBe("Analyse terminée \u00b7 3 recherches");
  });
});

// =============================================================================
// defaultMessages completeness
// =============================================================================

describe("defaultMessages", () => {
  it("has all plural pairs (_one has matching _other and vice versa)", () => {
    const keys = Object.keys(defaultMessages) as MessageKey[];
    const oneKeys = keys.filter(k => k.endsWith("_one"));
    for (const oneKey of oneKeys) {
      const otherKey = oneKey.replace(/_one$/, "_other");
      expect(keys).toContain(otherKey);
    }
    const otherKeys = keys.filter(k => k.endsWith("_other"));
    for (const otherKey of otherKeys) {
      const oneKey = otherKey.replace(/_other$/, "_one");
      expect(keys).toContain(oneKey);
    }
  });

  it("has no empty string values", () => {
    for (const [, value] of Object.entries(defaultMessages)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// DeepCitationI18nProvider + useTranslation
// =============================================================================

function TestConsumer({ msgKey, values }: { msgKey: MessageKey; values?: Record<string, string | number> }) {
  const t = useTranslation();
  return <span data-testid="output">{t(msgKey, values)}</span>;
}

describe("DeepCitationI18nProvider", () => {
  afterEach(cleanup);

  it("provides default translations when no provider is present", () => {
    render(<TestConsumer msgKey="status.verified" />);
    expect(screen.getByTestId("output").textContent).toBe("Verified");
  });

  it("provides custom translations via provider", () => {
    const messages = { "status.verified": "Vérifié" } as const;
    render(
      <DeepCitationI18nProvider messages={messages}>
        <TestConsumer msgKey="status.verified" />
      </DeepCitationI18nProvider>,
    );
    expect(screen.getByTestId("output").textContent).toBe("Vérifié");
  });

  it("falls back to defaults for non-overridden keys", () => {
    render(
      <DeepCitationI18nProvider messages={{ "status.verified": "Custom" }}>
        <TestConsumer msgKey="status.notFound" />
      </DeepCitationI18nProvider>,
    );
    expect(screen.getByTestId("output").textContent).toBe("Not Found");
  });

  it("supports interpolation through the provider", () => {
    render(
      <DeepCitationI18nProvider messages={{}}>
        <TestConsumer msgKey="citation.fallback" values={{ number: 7 }} />
      </DeepCitationI18nProvider>,
    );
    expect(screen.getByTestId("output").textContent).toBe("Citation 7");
  });
});
