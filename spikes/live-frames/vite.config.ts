import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	// null-origin srcdoc frames fetch react/screen modules cross-origin — allow them
	server: { cors: true },
	preview: { cors: true },
});
