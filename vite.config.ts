import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite's only job (#12): building the canvas SPA into dist/ui at release.
// The daemon serves the output; there is no vite dev server in the loop —
// `pnpm build:ui --watch` during development, refresh = update.
export default defineConfig({
	root: "src/ui",
	base: "/ui/",
	plugins: [react(), tailwindcss()],
	build: {
		outDir: "../../dist/ui",
		emptyOutDir: true,
	},
});
