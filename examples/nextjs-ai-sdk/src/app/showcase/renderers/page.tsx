"use client";

import { renderCitationsForSlack } from "deepcitation/slack";
import { renderCitationsForGitHub } from "deepcitation/github";
import { renderCitationsAsHtml } from "deepcitation/html";
import { renderCitationsForTerminal } from "deepcitation/terminal";
import { useMemo, useReducer } from "react";
import {
  SAMPLE_LLM_OUTPUT,
  SAMPLE_VERIFICATIONS,
  PROOF_BASE_URL,
  SLACK_VARIANTS,
  GITHUB_VARIANTS,
  HTML_VARIANTS,
  TERMINAL_VARIANTS,
} from "./constants";

type ActiveRenderer = "slack" | "github" | "html" | "terminal";

type ShowcaseState = {
  includeSources: boolean;
  slackVariant: (typeof SLACK_VARIANTS)[number];
  githubVariant: (typeof GITHUB_VARIANTS)[number];
  htmlVariant: (typeof HTML_VARIANTS)[number];
  terminalVariant: (typeof TERMINAL_VARIANTS)[number];
  activeTab: ActiveRenderer;
};

type ShowcaseAction =
  | { type: "SET_INCLUDE_SOURCES"; value: boolean }
  | { type: "SET_VARIANT"; key: "slackVariant" | "githubVariant" | "htmlVariant" | "terminalVariant"; value: string }
  | { type: "SET_ACTIVE_TAB"; value: ActiveRenderer };

function showcaseReducer(state: ShowcaseState, action: ShowcaseAction): ShowcaseState {
  switch (action.type) {
    case "SET_INCLUDE_SOURCES":
      return { ...state, includeSources: action.value };
    case "SET_VARIANT":
      return { ...state, [action.key]: action.value };
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.value };
  }
}

const initialState: ShowcaseState = {
  includeSources: true,
  slackVariant: SLACK_VARIANTS[0],
  githubVariant: GITHUB_VARIANTS[0],
  htmlVariant: HTML_VARIANTS[0],
  terminalVariant: TERMINAL_VARIANTS[0],
  activeTab: "slack",
};

export default function RenderersShowcasePage() {
  const [state, dispatch] = useReducer(showcaseReducer, initialState);
  const { includeSources, slackVariant, githubVariant, htmlVariant, terminalVariant, activeTab } = state;

  const commonOptions = useMemo(() => ({
    verifications: SAMPLE_VERIFICATIONS,
    proofBaseUrl: PROOF_BASE_URL,
    includeSources,
  }), [includeSources]);

  const slackOutput = useMemo(
    () => renderCitationsForSlack(SAMPLE_LLM_OUTPUT, { ...commonOptions, variant: slackVariant }),
    [commonOptions, slackVariant],
  );

  const githubOutput = useMemo(
    () => renderCitationsForGitHub(SAMPLE_LLM_OUTPUT, { ...commonOptions, variant: githubVariant }),
    [commonOptions, githubVariant],
  );

  const htmlOutput = useMemo(
    () => renderCitationsAsHtml(SAMPLE_LLM_OUTPUT, { ...commonOptions, variant: htmlVariant }),
    [commonOptions, htmlVariant],
  );

  const terminalOutput = useMemo(
    () => renderCitationsForTerminal(SAMPLE_LLM_OUTPUT, { ...commonOptions, variant: terminalVariant, color: false }),
    [commonOptions, terminalVariant],
  );

  const tabs: { key: ActiveRenderer; label: string; icon: string }[] = [
    { key: "slack", label: "Slack", icon: "#" },
    { key: "github", label: "GitHub", icon: "G" },
    { key: "html", label: "HTML", icon: "<>" },
    { key: "terminal", label: "Terminal", icon: ">" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8 px-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Proof Renderers</h1>
        <p className="text-gray-600 mb-6">
          Each renderer transforms LLM output containing <code className="text-sm bg-gray-100 px-1 rounded">&lt;cite /&gt;</code> tags
          into platform-native formats with verification indicators and proof links.
        </p>

        {/* Global controls */}
        <div className="flex items-center gap-4 mb-6">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeSources}
              onChange={e => dispatch({ type: "SET_INCLUDE_SOURCES", value: e.target.checked })}
              className="rounded border-gray-300"
            />
            Include sources section
          </label>
        </div>

        {/* Input preview */}
        <details className="mb-6">
          <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
            Show raw LLM input
          </summary>
          <pre className="mt-2 p-4 bg-white border rounded-lg text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
            {SAMPLE_LLM_OUTPUT}
          </pre>
        </details>

        {/* Tab navigation */}
        <div className="flex border-b border-gray-200 mb-0" role="tablist" aria-label="Renderer format">
          {tabs.map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => dispatch({ type: "SET_ACTIVE_TAB", value: tab.key })}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <span className="font-mono mr-1.5 text-xs">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Renderer panels */}
        <div className="bg-white border border-t-0 rounded-b-lg" role="tabpanel">
          {/* Slack */}
          {activeTab === "slack" && (
            <RendererPanel
              title="Slack mrkdwn"
              description="Output formatted for Slack's mrkdwn syntax"
              variants={SLACK_VARIANTS}
              selectedVariant={slackVariant}
              onVariantChange={v => dispatch({ type: "SET_VARIANT", key: "slackVariant", value: v })}
              output={slackOutput.full}
            />
          )}

          {/* GitHub */}
          {activeTab === "github" && (
            <RendererPanel
              title="GitHub-flavored Markdown"
              description="Output formatted for GitHub issues, PRs, and comments"
              variants={GITHUB_VARIANTS}
              selectedVariant={githubVariant}
              onVariantChange={v => dispatch({ type: "SET_VARIANT", key: "githubVariant", value: v })}
              output={githubOutput.full}
            />
          )}

          {/* HTML */}
          {activeTab === "html" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-medium text-gray-900">Static HTML</h3>
                  <p className="text-xs text-gray-500">Styled HTML for email, embeds, and static pages</p>
                </div>
                <VariantSelector
                  variants={HTML_VARIANTS}
                  selected={htmlVariant}
                  onChange={v => dispatch({ type: "SET_VARIANT", key: "htmlVariant", value: v })}
                  label="HTML variant"
                />
              </div>

              {/* Rendered HTML preview */}
              <div className="mb-4">
                <div className="text-xs font-medium text-gray-500 mb-1">Rendered preview</div>
                <iframe
                  srcDoc={htmlOutput.full}
                  className="w-full border rounded-lg bg-white"
                  style={{ minHeight: "200px" }}
                  title="HTML renderer preview"
                  sandbox=""
                />
              </div>

              {/* Raw HTML source */}
              <details>
                <summary className="text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700">
                  Show raw HTML source
                </summary>
                <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
                  {htmlOutput.full}
                </pre>
              </details>
            </div>
          )}

          {/* Terminal */}
          {activeTab === "terminal" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-medium text-gray-900">Terminal / CLI</h3>
                  <p className="text-xs text-gray-500">Plain text output for terminal environments (ANSI colors disabled for web display)</p>
                </div>
                <VariantSelector
                  variants={TERMINAL_VARIANTS}
                  selected={terminalVariant}
                  onChange={v => dispatch({ type: "SET_VARIANT", key: "terminalVariant", value: v })}
                  label="Terminal variant"
                />
              </div>
              <pre className="p-4 bg-gray-900 text-green-400 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                {terminalOutput.full}
              </pre>
            </div>
          )}
        </div>

        {/* Citation metadata */}
        <details className="mt-6">
          <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
            Show extracted citation metadata
          </summary>
          <pre className="mt-2 p-4 bg-white border rounded-lg text-xs text-gray-700 overflow-x-auto">
            {JSON.stringify(slackOutput.citations, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

function VariantSelector<T extends string>({
  variants,
  selected,
  onChange,
  label,
}: {
  variants: readonly T[];
  selected: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <select
      value={selected}
      onChange={e => onChange(e.target.value as T)}
      className="text-sm border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label={label ?? "Variant"}
    >
      {variants.map(v => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

function RendererPanel<T extends string>({
  title,
  description,
  variants,
  selectedVariant,
  onVariantChange,
  output,
}: {
  title: string;
  description: string;
  variants: readonly T[];
  selectedVariant: T;
  onVariantChange: (v: T) => void;
  output: string;
}) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-medium text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <VariantSelector variants={variants} selected={selectedVariant} onChange={onVariantChange} label={`${title} variant`} />
      </div>
      <pre className="p-4 bg-gray-50 rounded-lg text-sm text-gray-800 overflow-x-auto whitespace-pre-wrap">
        {output}
      </pre>
    </div>
  );
}
