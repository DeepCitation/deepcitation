/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@deepcitation/deepcitation-js"],
  devIndicators: {
    position: "bottom-left",
  },
};

module.exports = nextConfig;
