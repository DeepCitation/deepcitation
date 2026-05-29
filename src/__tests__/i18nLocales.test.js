import { describe, expect, it } from "bun:test";
import { defaultMessages } from "../react/i18n";
import { esMessages, esOverrides } from "../react/locales/es";
import { frMessages, frOverrides } from "../react/locales/fr";
import { viMessages, viOverrides } from "../react/locales/vi";
describe("locale message dictionaries", () => {
    const defaultKeys = Object.keys(defaultMessages).sort();
    const locales = [
        ["fr", frMessages],
        ["es", esMessages],
        ["vi", viMessages],
    ];
    it("keeps locale keys in sync with defaultMessages", () => {
        // Check the *Overrides objects (no spread) so the test is non-trivially true.
        // If a locale is missing a key, the overrides won't cover it and the test fails.
        const overrides = [
            ["fr", frOverrides],
            ["es", esOverrides],
            ["vi", viOverrides],
        ];
        for (const [, overridesObj] of overrides) {
            expect(Object.keys(overridesObj).sort()).toEqual(defaultKeys);
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
        expect(frMessages["status.verified"]).toBe("DeepCitation Vérifié");
        expect(esMessages["status.verified"]).toBe("DeepCitation Verificado");
        expect(viMessages["status.verified"]).toBe("DeepCitation Đã xác minh");
    });
});
