import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteLicenses } from "./src/bundle-licenses";

const licenses = viteLicenses();

// spool in a browser (src/ui/viewer), shipped as `spool.page/viewer/*` for
// Spool Cloud to serve: the read-only canvas of a team project (index.html)
// and Home at spool.page/<team> (home.html), sharing their chunks. Every URL
// inside the build is relative, so the cloud mounts it wherever it likes, and
// the manifest says which files are each entry's script and stylesheet.
export default defineConfig({
	root: "src/ui/viewer",
	base: "./",
	plugins: [react(), tailwindcss(), licenses.app],
	worker: { plugins: () => [licenses.worker] },
	build: {
		outDir: "../../../dist/viewer",
		emptyOutDir: true,
		manifest: "manifest.json",
		rollupOptions: {
			input: {
				index: fileURLToPath(new URL("src/ui/viewer/index.html", import.meta.url)),
				home: fileURLToPath(new URL("src/ui/viewer/home.html", import.meta.url)),
			},
		},
	},
});
