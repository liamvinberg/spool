import { readFileSync, realpathSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

/**
 * The canvas SPA off dist/ui, built by Vite at release. Routerless by design
 * (#12): / and /p/<name> both serve index.html and the page reads its path
 * once at boot. index.html is never cached — the daemon serves the UI, so
 * refresh = update; hashed assets are immutable.
 */

const MIME: Record<string, string> = {
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
};

export interface UiAsset {
	body: Buffer;
	contentType: string;
	cacheControl: string;
}

export function readUiIndex(uiDir: string | undefined): UiAsset | undefined {
	if (uiDir === undefined) return undefined;
	let body: Buffer;
	try {
		body = readFileSync(join(uiDir, "index.html"));
	} catch {
		return undefined;
	}
	return { body, contentType: "text/html; charset=utf-8", cacheControl: "no-cache" };
}

export function readUiAsset(uiDir: string | undefined, rel: string): UiAsset | undefined {
	if (uiDir === undefined) return undefined;
	let file: string;
	try {
		file = realpathSync(resolve(uiDir, rel));
	} catch {
		return undefined;
	}
	// resolve+realpath then prefix-check: no traversal, no symlink escape
	if (!file.startsWith(realpathSync(uiDir) + sep)) return undefined;
	let body: Buffer;
	try {
		body = readFileSync(file);
	} catch {
		return undefined;
	}
	return {
		body,
		contentType: MIME[extname(file)] ?? "application/octet-stream",
		// vite emits content-hashed filenames under assets/
		cacheControl: rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache",
	};
}

export const UI_MISSING_NOTICE = `spool ui is not built.

This daemon is serving from a checkout without dist/ui.
Run \`pnpm build\` (or \`pnpm build:ui\` during development) and refresh.
`;
