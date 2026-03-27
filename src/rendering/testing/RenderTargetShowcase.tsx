import type React from "react";
import { TerminalPreview } from "./TerminalPreview.js";

// =============================================================================
// SHOWCASE HELPER COMPONENTS
// =============================================================================

interface ShowcaseSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  "data-testid"?: string;
}

function ShowcaseSection({ title, description, children, "data-testid": testId }: ShowcaseSectionProps) {
  return (
    <section className="mb-10" data-testid={testId}>
      <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">{title}</h2>
      {description && <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{description}</p>}
      {children}
    </section>
  );
}

// =============================================================================
// RENDER TARGET SHOWCASE
// =============================================================================

export function RenderTargetShowcase() {
  return (
    <div className="p-6 bg-white dark:bg-gray-900 min-h-screen" data-testid="render-target-showcase">
      <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Render Target Visual Showcase</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Visual reference for Terminal render target</p>

      <ShowcaseSection
        title="1. Terminal / CLI"
        description="ANSI-colored output for CLI tools, logs, and developer tooling. Box-drawing characters for structure. No images."
        data-testid="terminal-section"
      >
        <TerminalPreview />
      </ShowcaseSection>
    </div>
  );
}
