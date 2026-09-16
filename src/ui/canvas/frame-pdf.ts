import type { CapturedFrame } from "./frame-export";

const PDF_POINTS_PER_CSS_PIXEL = 72 / 96;

export async function buildFramePdf(frames: readonly CapturedFrame[]): Promise<Uint8Array> {
	const { PDFDocument } = await import("pdf-lib");
	const pdf = await PDFDocument.create();
	for (const frame of frames) {
		const image = await pdf.embedPng(frame.png);
		const width = frame.width * PDF_POINTS_PER_CSS_PIXEL;
		const height = frame.height * PDF_POINTS_PER_CSS_PIXEL;
		const page = pdf.addPage([width, height]);
		page.drawImage(image, { x: 0, y: 0, width, height });
	}
	return pdf.save();
}
