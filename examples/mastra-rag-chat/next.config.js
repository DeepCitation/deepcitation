/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["deepcitation"],
  serverExternalPackages: [
    "@mastra/core",
    "@mastra/rag",
    "@mastra/libsql",
    "@libsql/client",
    "libsql",
  ],
  devIndicators: {
    position: "bottom-left",
  },
};

module.exports = nextConfig;
