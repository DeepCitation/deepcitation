"use client";

import { useState } from "react";

interface VerificationPanelProps {
  verification: {
    citations: Record<string, any>;
    verifications: Record<string, any>;
    summary: {
      total: number;
      verified: number;
      missed: number;
      pending: number;
    };
  };
}

export function VerificationPanel({ verification }: VerificationPanelProps) {
  const [expandedCitation, setExpandedCitation] = useState<string | null>(null);

  const { summary, verifications } = verification;
  const verificationRate = summary.total > 0 ? (summary.verified / summary.total) * 100 : 0;

  return (
    <div className="w-80 border-l bg-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <h2 className="font-semibold text-gray-900">Citation Verification</h2>
        <p className="text-xs text-gray-500">Real-time verification against attachments</p>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Verification Rate</span>
          <span
            className={`text-sm font-medium ${
              verificationRate >= 80 ? "text-green-600" : verificationRate >= 50 ? "text-yellow-600" : "text-red-600"
            }`}
          >
            {verificationRate.toFixed(0)}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              verificationRate >= 80 ? "bg-green-500" : verificationRate >= 50 ? "bg-yellow-500" : "bg-red-500"
            }`}
            style={{ width: `${verificationRate}%` }}
          />
        </div>

        {/* Stats */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="bg-white rounded p-2">
            <div className="text-lg font-semibold text-green-600">{summary.verified}</div>
            <div className="text-xs text-gray-500">Verified</div>
          </div>
          <div className="bg-white rounded p-2">
            <div className="text-lg font-semibold text-red-600">{summary.missed}</div>
            <div className="text-xs text-gray-500">Missed</div>
          </div>
          <div className="bg-white rounded p-2">
            <div className="text-lg font-semibold text-gray-600">{summary.total}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
        </div>
      </div>

      {/* Citation List */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(verifications).map(([key, v]: [string, any]) => {
          const isVerified = v.status === "found";
          const isPartial = ["partial_text_found", "found_on_other_page", "found_on_other_line"].includes(v.status);
          const isMiss = v.status === "not_found";
          const isExpanded = expandedCitation === key;

          return (
            <div key={key} className="border-b last:border-b-0">
              <button
                onClick={() => setExpandedCitation(isExpanded ? null : key)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 text-left"
              >
                {/* Status icon */}
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                    isVerified
                      ? "bg-green-100 text-green-600"
                      : isPartial
                        ? "bg-yellow-100 text-yellow-600"
                        : isMiss
                          ? "bg-red-100 text-red-600"
                          : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {isVerified ? "✓" : isPartial ? "◐" : isMiss ? "✗" : "○"}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900">Citation [{key}]</div>
                  <div className="text-xs text-gray-500 truncate">
                    {v.status || "pending"}
                    {v.verifiedPageNumber && ` • Page ${v.verifiedPageNumber}`}
                  </div>
                </div>

                {/* Expand icon */}
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-3 space-y-2">
                  {v.verifiedMatchSnippet && (
                    <div className="bg-gray-50 rounded p-2">
                      <div className="text-xs font-medium text-gray-500 mb-1">Matched Text</div>
                      <div className="text-sm text-gray-700 line-clamp-3">"{v.verifiedMatchSnippet}"</div>
                    </div>
                  )}

                  {v.verificationImageBase64 && (
                    <div className="bg-gray-50 rounded p-2">
                      <div className="text-xs font-medium text-gray-500 mb-1">Visual Proof</div>
                      <img src={v.verificationImageBase64} alt="Verification proof" className="w-full rounded border" />
                    </div>
                  )}

                  {v.verifiedPageNumber !== v.citation?.pageNumber && v.citation?.pageNumber && (
                    <div className="text-xs text-yellow-600">
                      Found on page {v.verifiedPageNumber} (expected {v.citation?.pageNumber})
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
