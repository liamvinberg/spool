import type { CapturedFrame } from "./frame-export";
import { buildFramePdf } from "./frame-pdf";

self.onmessage = async (event: MessageEvent<readonly CapturedFrame[]>) => {
	try {
		const bytes = await buildFramePdf(event.data);
		self.postMessage({ bytes }, { transfer: [bytes.buffer] });
	} catch (error) {
		self.postMessage({ error: error instanceof Error ? error.message : "PDF export failed. Try again." });
	}
};
