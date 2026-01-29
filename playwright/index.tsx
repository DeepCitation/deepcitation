// Required import for Playwright CT - this file must exist for component testing
// The @playwright/experimental-ct-react package handles React mounting automatically
// when this file is present with React imports

import React from "react";
import ReactDOM from "react-dom/client";

// Import Tailwind CSS for proper styling in tests
import "./styles.css";

// Export for Playwright CT framework to detect React version
export { React, ReactDOM };
