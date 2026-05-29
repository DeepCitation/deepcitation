import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { plugin } from "bun";
// Mock CSS imports to prevent raw CSS output during tests
plugin({
    name: "css-loader",
    setup(build) {
        build.onLoad({ filter: /\.css$/ }, () => ({
            contents: "",
            loader: "js",
        }));
    },
});
GlobalRegistrator.register();
