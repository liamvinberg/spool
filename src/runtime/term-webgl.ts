import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal } from "@xterm/xterm";

type WebglTerminal = Pick<Terminal, "cols" | "loadAddon" | "resize" | "rows">;

export async function activateWebgl(term: WebglTerminal): Promise<WebglAddon | undefined> {
	let addon: WebglAddon | undefined;
	try {
		const webgl = new WebglAddon();
		addon = webgl;
		webgl.onContextLoss(() => webgl.dispose());
		term.loadAddon(webgl);
		// Chromium reports the scaled device-pixel content box after the addon's
		// first sizing pass. Reapplying the empty boot grid after that observer
		// settles keeps the WebGL backing store and glyph model on one scale.
		// The first reflow can itself produce a final device-box correction, so
		// repeat once before any terminal bytes are connected.
		await painted();
		const { cols, rows } = term;
		for (let pass = 0; pass < 2; pass++) {
			term.resize(cols + 1, rows);
			term.resize(cols, rows);
			await painted();
		}
		return webgl;
	} catch {
		addon?.dispose();
		// The DOM renderer is the intended fallback for unavailable GPUs and
		// blocked WebGL contexts. Terminal state belongs to xterm, not the addon.
		return undefined;
	}
}

function painted(): Promise<void> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve();
		};
		const timeout = setTimeout(finish, 100);
		requestAnimationFrame(() => requestAnimationFrame(finish));
	});
}
