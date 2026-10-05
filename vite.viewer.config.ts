import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteLicenses } from "./src/bundle-licenses";

const licenses = viteLicenses();

// The read-only canvas (src/ui/viewer), shipped as `spool.page/viewer/*` for
// Spool Cloud to serve a team project in a browser. Every URL inside the build
// is relative, so the cloud mounts it wherever it likes, and the manifest says
// which files are the entry's script and stylesheet.
export default defineConfig({
	root: "src/ui/viewer",
	base: "./",
	plugins: [react(), tailwindcss(), licenses.app],
	worker: { plugins: () => [licenses.worker] },
	build: {
		outDir: "../../../dist/viewer",
		emptyOutDir: true,
		manifest: "manifest.json",
	},
});
