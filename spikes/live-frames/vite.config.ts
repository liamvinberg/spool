import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	// cors: null-origin srcdoc frames fetch react/screen modules cross-origin.
	// allowedHosts: the tailnet share proxies with the ts.net host header.
	server: { cors: true, allowedHosts: [".ts.net"] },
	preview: { cors: true, allowedHosts: [".ts.net"] },
});
