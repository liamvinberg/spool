/**
 * The daemon's read of a terminal screen (#42): the headless emulator's
 * viewport buffer flattened into style runs with every color resolved
 * through the pinned theme — the one Grid that stills, player screens, and
 * shot all render from. Blank cells ride along as default-styled spaces so
 * runs stay positionable by cumulative width alone; bare tails are trimmed.
 */

import type { IBufferCell, Terminal } from "@xterm/headless";
import { isBoxGlyph } from "./box-glyphs";
import { cursorVisible } from "./cursor-visibility";
import type { Grid, Run } from "./still";
import { TERM_ANSI, TERM_BACKGROUND, TERM_FOREGROUND } from "./theme";

export function gridFromBuffer(term: Terminal): Grid {
	const buffer = term.buffer.active;
	const lines: Run[][] = [];
	for (let y = 0; y < term.rows; y++) {
		const line = buffer.getLine(buffer.viewportY + y);
		const runs: Run[] = [];
		if (line !== undefined) {
			for (let x = 0; x < term.cols; x++) {
				const cell = line.getCell(x);
				if (cell === undefined || cell.getWidth() === 0) continue;
				const run = runFromCell(cell);
				const previous = runs[runs.length - 1];
				if (run.box !== true && previous !== undefined && previous.box !== true && sameStyle(previous, run)) {
					previous.text += run.text;
					previous.width = (previous.width ?? 0) + cell.getWidth();
				} else {
					runs.push(run);
				}
			}
		}
		lines.push(trimBareTail(runs));
	}
	const cursorCol = Math.min(buffer.cursorX, term.cols - 1);
	const cursorCell = buffer.getLine(buffer.viewportY + buffer.cursorY)?.getCell(cursorCol);
	const showCursor = cursorVisible(term) && cursorCell !== undefined && cursorCell.getWidth() !== 0;
	return {
		cols: term.cols,
		rows: term.rows,
		lines,
		...(showCursor ? { cursor: { col: cursorCol, row: buffer.cursorY, cell: runFromCell(cursorCell) } } : {}),
	};
}

function runFromCell(cell: IBufferCell | undefined): Run {
	if (cell === undefined) return { text: " ", width: 1, fg: TERM_FOREGROUND };
	const text = cell.getChars() === "" ? " " : cell.getChars();
	return {
		...styleCell(cell),
		text,
		width: Math.max(1, cell.getWidth()),
		...(isBoxGlyph(text) ? { box: true as const } : {}),
	};
}

/** Blank default cells padding a line's tail carry no information. */
function trimBareTail(runs: Run[]): Run[] {
	const bare = runs[runs.length - 1];
	if (bare !== undefined && bare.bg === undefined && bare.text.trim() === "") runs.pop();
	const tail = runs[runs.length - 1];
	if (tail !== undefined && tail.bg === undefined) {
		const kept = tail.text.trimEnd();
		if (kept !== tail.text) {
			tail.width = (tail.width ?? tail.text.length) - (tail.text.length - kept.length);
			tail.text = kept;
		}
	}
	return runs;
}

interface CellStyle {
	fg: string;
	bg?: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	dim?: boolean;
}

function styleCell(cell: IBufferCell): CellStyle {
	let fg = cell.isFgDefault() ? TERM_FOREGROUND : resolveColor(cell.getFgColor(), cell.isFgRGB());
	let bg = cell.isBgDefault() ? undefined : resolveColor(cell.getBgColor(), cell.isBgRGB());
	if (cell.isInverse() !== 0) {
		const swapped = bg ?? TERM_BACKGROUND;
		bg = fg;
		fg = swapped;
	}
	const style: CellStyle = { fg };
	if (bg !== undefined) style.bg = bg;
	if (cell.isBold() !== 0) style.bold = true;
	if (cell.isItalic() !== 0) style.italic = true;
	if (cell.isUnderline() !== 0) style.underline = true;
	if (cell.isDim() !== 0) style.dim = true;
	return style;
}

function sameStyle(a: Run, b: CellStyle): boolean {
	return (
		a.fg === b.fg &&
		a.bg === b.bg &&
		(a.bold ?? false) === (b.bold ?? false) &&
		(a.italic ?? false) === (b.italic ?? false) &&
		(a.underline ?? false) === (b.underline ?? false) &&
		(a.dim ?? false) === (b.dim ?? false)
	);
}

function resolveColor(color: number, rgb: boolean): string {
	if (rgb) return `#${color.toString(16).padStart(6, "0")}`;
	if (color < 16) return TERM_ANSI[color] as string;
	if (color < 232) {
		const n = color - 16;
		const level = [0, 95, 135, 175, 215, 255];
		const channel = (v: number) => (level[v] as number).toString(16).padStart(2, "0");
		return `#${channel(Math.floor(n / 36))}${channel(Math.floor((n % 36) / 6))}${channel(n % 6)}`;
	}
	const gray = (8 + 10 * (color - 232)).toString(16).padStart(2, "0");
	return `#${gray}${gray}${gray}`;
}
