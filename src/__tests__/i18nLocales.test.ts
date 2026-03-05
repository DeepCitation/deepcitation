import { describe, expect, it } from "@jest/globals";
import { defaultMessages } from "../react/i18n";
import { esMessages } from "../react/locales/es";
import { frMessages } from "../react/locales/fr";
import { viMessages } from "../react/locales/vi";

describe("locale message dictionaries", () => {
  const defaultKeys = Object.keys(defaultMessages).sort();
  const locales = [
    ["fr", frMessages],
    ["es", esMessages],
    ["vi", viMessages],
  ] as const;

  it("keeps locale keys in sync with defaultMessages", () => {
    for (const [, messages] of locales) {
      expect(Object.keys(messages).sort()).toEqual(defaultKeys);
    }
  });

  it("ensures all locale values are non-empty strings", () => {
    for (const [, messages] of locales) {
      for (const value of Object.values(messages)) {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it("overrides a core status label for each locale", () => {
    expect(frMessages["status.verified"]).toBe("Verifie");
    expect(esMessages["status.verified"]).toBe("Verificado");
    expect(viMessages["status.verified"]).toBe("Da xac minh");
  });
});
