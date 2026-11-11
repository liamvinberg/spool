import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteLicenses } from "./src/bundle-licenses";
import { channelDefine } from "./src/channel";

const licenses = viteLicenses();

// Vite's only job (#12): building the canvas SPA into dist/ui at release.
// The daemon serves the output; there is no vite dev server in the loop —
// the checkout's foreground `pnpm dev serve` owns this build watcher.
export default defineConfig({
	root: "src/ui",
	base: "/ui/",
	plugins: [react(), tailwindcss(), licenses.app],
	worker: { plugins: () => [licenses.worker] },
	// a Spool Beta build (src/channel.ts) is told so by its version
	define: channelDefine((JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version),
	build: {
		outDir: "../../dist/ui",
		emptyOutDir: true,
	},
});
