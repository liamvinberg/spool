/**
 * Terminal stills (#42): a screen grid rendered to SVG in the pinned font.
 * One renderer serves every surface — canvas stills (font embedded as a data
 * URI, because an <img>-loaded SVG can reach nothing external), player
 * screens (inline SVG, the document's own @font-face applies), and shot.
 * Rendering from the grid rather than capturing pixels is what makes stills
 * font-correct by construction and crisp at any zoom.
 */

import { boxGlyphPath } from "./box-glyphs";
import { CELL_H, CELL_W, TERM_FONT_PX } from "./cells";
import { TERM_BACKGROUND, TERM_CURSOR, TERM_CURSOR_ACCENT } from "./theme";

/** A horizontal stretch of one style; `width` covers wide glyphs, default one cell per char. */
export interface Run {
	text: string;
	fg: string;
	bg?: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	dim?: boolean;
	width?: number;
	box?: true;
}

export interface Grid {
	cols: number;
	rows: number;
	lines: Run[][];
	cursor?: { col: number; row: number; cell: Run };
}

/** Baseline sits three quarters into the cell — pinned, like the metrics. */
const BASELINE = CELL_H * 0.75;

export function gridToSvg(grid: Grid, fontCss?: string): string {
	const w = grid.cols * CELL_W;
	const h = grid.rows * CELL_H;
	const parts: string[] = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
	];
	if (fontCss !== undefined) parts.push(`<style>${fontCss}</style>`);
	parts.push(`<rect width="100%" height="100%" fill="${TERM_BACKGROUND}"/>`);
	const backgrounds: string[] = [];
	const foreground: string[] = [];
	grid.lines.forEach((line, row) => {
		let col = 0;
		for (const run of line) {
			const cells = run.width ?? run.text.length;
			if (run.bg !== undefined) {
				backgrounds.push(
					`<rect x="${col * CELL_W}" y="${row * CELL_H}" width="${cells * CELL_W}" height="${CELL_H}" fill="${run.bg}"/>`,
				);
			}
			foreground.push(...renderRun(run, col, row));
			col += cells;
		}
	});
	if (grid.cursor !== undefined) {
		const cell = grid.cursor.cell;
		const cells = cell.width ?? 1;
		const cursorRun: Run = {
			text: cell.text,
			fg: TERM_CURSOR_ACCENT,
			...(cell.width !== undefined ? { width: cell.width } : {}),
			...(cell.box === true ? { box: true as const } : {}),
		};
		foreground.push(
			`<rect x="${grid.cursor.col * CELL_W}" y="${grid.cursor.row * CELL_H}" width="${cells * CELL_W}" height="${CELL_H}" fill="${TERM_CURSOR}"/>`,
			...renderRun(cursorRun, grid.cursor.col, grid.cursor.row),
		);
	}
	parts.push(...backgrounds, ...foreground, "</svg>");
	return parts.join("");
}

function renderRun(run: Run, col: number, row: number): string[] {
	const cells = run.width ?? run.text.length;
	if (run.box === true) {
		const glyph = boxGlyphPath(run.text, CELL_W, CELL_H, col * CELL_W, row * CELL_H);
		if (glyph === undefined) return [];
		const opacity = run.dim === true ? ' opacity="0.5"' : "";
		const paths = glyph.paths.map(
			(path) => `<path d="${path.d}" fill="none" stroke="${run.fg}" stroke-width="${path.strokeWidth}"${opacity}/>`,
		);
		if (run.underline === true) {
			const y = (row + 1) * CELL_H - 0.5;
			paths.push(
				`<path d="M${col * CELL_W},${y} L${(col + cells) * CELL_W},${y}" fill="none" stroke="${run.fg}" stroke-width="1"${opacity}/>`,
			);
		}
		return paths;
	}
	if (run.text.trim() === "") return [];
	const style = [
		run.bold === true ? ' font-weight="700"' : "",
		run.italic === true ? ' font-style="italic"' : "",
		run.underline === true ? ' text-decoration="underline"' : "",
		run.dim === true ? ' opacity="0.5"' : "",
	].join("");
	return [
		`<text x="${col * CELL_W}" y="${row * CELL_H + BASELINE}" textLength="${cells * CELL_W}" ` +
			`lengthAdjust="spacingAndGlyphs" font-family="JetBrains Mono, monospace" font-size="${TERM_FONT_PX}" ` +
			`fill="${run.fg}"${style}>${escapeXml(run.text)}</text>`,
	];
}

function escapeXml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
