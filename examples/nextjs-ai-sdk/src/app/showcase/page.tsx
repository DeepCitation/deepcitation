import Link from "next/link";

export default function ShowcasePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">DeepCitation Showcase</h1>
        <p className="text-gray-600 mb-8">
          Explore how DeepCitation renders verified citations across different platforms and formats.
        </p>

        <div className="grid gap-4">
          <Link
            href="/showcase/renderers"
            className="block bg-white rounded-xl border shadow-sm p-6 hover:border-blue-300 hover:shadow-md transition-all"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Proof Renderers</h2>
            <p className="text-sm text-gray-600">
              See how citations render across Slack, GitHub, HTML, and Terminal. Each renderer transforms
              LLM output with citation tags into platform-native formats with verification indicators.
            </p>
            <span className="inline-block mt-3 text-sm text-blue-600 font-medium">
              View renderers &rarr;
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
