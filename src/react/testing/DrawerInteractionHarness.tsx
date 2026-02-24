import { useState } from "react";
import { CitationDrawer } from "../CitationDrawer";
import type { SourceCitationGroup } from "../CitationDrawer.types";

/**
 * Test harness for CitationDrawer interaction tests (Playwright CT).
 * Manages open/close state so tests can exercise escape cascade,
 * page pill highlighting, and evidence click routing.
 */
export function DrawerInteractionHarness({
  groups,
  startOpen = true,
}: {
  groups: SourceCitationGroup[];
  startOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(startOpen);

  return (
    <div data-testid="drawer-harness">
      {!isOpen && (
        <button type="button" data-testid="reopen-drawer" onClick={() => setIsOpen(true)}>
          Reopen
        </button>
      )}
      <CitationDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        citationGroups={groups}
        title="Citations"
        position="bottom"
      />
    </div>
  );
}
