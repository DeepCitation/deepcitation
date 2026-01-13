/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@deepcitation/deepcitation-js"],
  devIndicators: {
    position: "bottom-left",
  },
};

module.exports = nextConfig;
