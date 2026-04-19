/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["deepcitation"],
  webpack(config) {
    // tsconfig paths send "deepcitation" → ../../src/index.ts (source TS).
    // extensionAlias lets webpack resolve .js imports in that TS source to .ts files.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
  devIndicators: {
    position: "bottom-left",
  },
};

module.exports = nextConfig;
