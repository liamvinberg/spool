const PDF_POINTS_PER_CSS_PIXEL = 72 / 96;

export interface CanvasOrderFrame {
	name: string;
	x: number;
	y: number;
}

export interface CapturedFrame {
	name: string;
	width: number;
	height: number;
	png: Uint8Array;
}

export function framesInCanvasOrder<T extends CanvasOrderFrame>(
	frames: readonly T[],
	selected: readonly string[],
): T[] {
	const names = new Set(selected);
	return frames
		.filter((frame) => names.has(frame.name))
		.sort((a, b) => a.x - b.x || a.y - b.y || a.name.localeCompare(b.name));
}

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

export async function pngBytesFromImageBlob(blob: Blob, width: number, height: number): Promise<Uint8Array> {
	if (blob.type === "image/png") return new Uint8Array(await blob.arrayBuffer());

	const source = URL.createObjectURL(blob);
	try {
		const image = document.createElement("img");
		image.src = source;
		await image.decode();
		const scale = Math.min(window.devicePixelRatio || 1, 2);
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(width * scale));
		canvas.height = Math.max(1, Math.round(height * scale));
		const context = canvas.getContext("2d");
		if (context === null) throw new Error("canvas is unavailable");
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		const png = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((result) => {
				if (result === null) reject(new Error("frame could not be rasterized"));
				else resolve(result);
			}, "image/png");
		});
		return new Uint8Array(await png.arrayBuffer());
	} finally {
		URL.revokeObjectURL(source);
	}
}

export function downloadBytes(bytes: Uint8Array, type: string, filename: string): void {
	const copy = Uint8Array.from(bytes);
	const url = URL.createObjectURL(new Blob([copy.buffer], { type }));
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.hidden = true;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
