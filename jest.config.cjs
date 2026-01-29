module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts?(x)"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }],
  },
  moduleNameMapper: {
    "^react$": "<rootDir>/../../node_modules/react",
    "^react-dom$": "<rootDir>/../../node_modules/react-dom",
    "^react/jsx-runtime$": "<rootDir>/../../node_modules/react/jsx-runtime",
    "^react/jsx-dev-runtime$": "<rootDir>/../../node_modules/react/jsx-dev-runtime",
    "^(\\.{1,2}/.*)\\.js$": "$1",
    // Mock canvas for environments where native module is not available
    "canvas": "<rootDir>/tests/mocks/canvas.js",
  },
};
