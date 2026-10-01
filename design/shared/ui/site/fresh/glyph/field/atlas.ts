/** The marks thin ink falls back to, lightest first. They follow printable ASCII in the atlas. */
export const RAMP = ".,:;-=+";

export const ATLAS_COLUMNS = 16;
export const ATLAS_ROWS = 7;

/**
 * Printable ASCII (32 to 126) then the ramp, drawn white on clear into a 16 by 7
 * sheet, one cell per glyph at `cell` CSS pixels times `scale`.
 */
export function drawAtlas(cell: [number, number], fontSize: number, scale: number) {
	const [cw, ch] = cell;
	const canvas = document.createElement("canvas");
	canvas.width = Math.ceil(cw * scale) * ATLAS_COLUMNS;
	canvas.height = Math.ceil(ch * scale) * ATLAS_ROWS;
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;
	const slotW = canvas.width / ATLAS_COLUMNS;
	const slotH = canvas.height / ATLAS_ROWS;
	ctx.fillStyle = "#fff";
	ctx.textBaseline = "middle";
	ctx.textAlign = "center";
	ctx.font = `400 ${fontSize * scale}px "Fragment Mono", ui-monospace, monospace`;
	const glyphs: string[] = [];
	for (let code = 32; code <= 126; code++) glyphs.push(String.fromCharCode(code));
	glyphs.push(...RAMP);
	glyphs.forEach((glyph, i) => {
		const x = (i % ATLAS_COLUMNS) * slotW + slotW / 2;
		const y = Math.floor(i / ATLAS_COLUMNS) * slotH + slotH * 0.54;
		ctx.fillText(glyph, x, y);
	});
	return canvas;
}
