import type { SupportingFact } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { getChildCitationKey } from "../utils/citationKey.js";
import { childCitationFromFact } from "../utils/supportingFactExpansion.js";
import { CitationComponent } from "./Citation.js";
import { useTranslation } from "./i18n.js";
import type { BaseCitationProps } from "./types.js";

export function SupportingFactsPills({
  parentCitation,
  parentKey,
  supportingFacts,
  supportingFactVerifications,
  parentCitationInstanceId,
}: {
  parentCitation: BaseCitationProps["citation"];
  parentKey: string;
  supportingFacts: SupportingFact[];
  supportingFactVerifications?: (Verification | undefined)[];
  parentCitationInstanceId?: string;
}) {
  const t = useTranslation();

  return (
    <div className="dc-supporting-facts px-3 pb-2" role="region" aria-label={t("popover.supportingFacts")}>
      <div className="text-[11px] font-medium text-dc-subtle-foreground mb-1.5">{t("popover.supportingFacts")}</div>
      <div className="flex flex-wrap gap-1.5">
        {supportingFacts.map(fact => (
          <CitationComponent
            key={getChildCitationKey(parentKey, fact.childIndex)}
            citation={childCitationFromFact(fact, parentCitation)}
            verification={supportingFactVerifications?.[fact.childIndex] ?? null}
            variant="chip"
            indicatorVariant="dot"
            popoverPortalToBody
            popoverPosition="bottom"
            parentInstanceId={parentCitationInstanceId}
          />
        ))}
      </div>
    </div>
  );
}
