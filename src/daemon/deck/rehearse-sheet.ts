import type { BrowserContext } from "playwright-core";
import type { Rehearsal } from "../../deck/rehearsal";
import { escapeHtml } from "../document";
import { STILL_MS, type Still } from "./rehearse";

/**
 * A rehearsal's sheet (spool#322): every picture it took, in the order the talk plays, on as few pages as a person or a
 * vision model can read at a glance, each marked where something was found.
 */

/** One picture on a sheet, with what it is. */
export interface SheetCell {
	readonly still: string;
	readonly label: string;
	readonly move: boolean;
	/** something was found here: broken, or worth a note */
	readonly mark?: "broken" | "note";
}

/** Every beat at rest in order, and after each slide's last beat the move into the next, at its start, middle and end. */
export function sheetCells(
	rehearsal: Rehearsal,
	/** what was found at a beat, or with `move` in the move from a slide into the next */
	marks: (at: { slide: number; beat?: number; move?: true }) => SheetCell["mark"],
): SheetCell[] {
	const cells: SheetCell[] = [];
	const nameOf = (slide: number) => rehearsal.slides[slide]?.frame.split("/").at(-1) ?? "";
	for (const beat of rehearsal.beats) {
		const slide = rehearsal.slides[beat.at.slide];
		const beats = slide?.beats ?? [];
		const label =
			beats.length < 2
				? `${beat.at.slide + 1} · ${nameOf(beat.at.slide)}`
				: `${beat.at.slide + 1} · ${nameOf(beat.at.slide)} · beat ${beat.at.beat + 1} "${beats[beat.at.beat] ?? ""}"`;
		const mark = marks(beat.at);
		cells.push({ still: beat.still, label, move: false, ...(mark === undefined ? {} : { mark }) });
		if (beat.at.beat !== beats.length - 1) continue;
		const move = rehearsal.moves.find((each) => each.from === beat.at.slide);
		const moveMark = marks({ slide: beat.at.slide, move: true });
		for (const { label: when, still } of move?.stills ?? [])
			cells.push({
				still,
				label: `${beat.at.slide + 1} → ${beat.at.slide + 2} · ${when === "cut" ? "a cut, nothing moves" : when}`,
				move: true,
				...(moveMark === undefined ? {} : { mark: moveMark }),
			});
	}
	return cells;
}

/** How wide a sheet is, px: a vision model reads about this much without shrinking it. */
const SHEET_W = 1600;
const SHEET_GAP = 16;
const SHEET_HEAD = 44;
const LABEL_H = 22;
/** Sheet addresses the sheet's own page asks for, answered from memory. */
const SHEET_ORIGIN = "https://sheet.spool.invalid";

/** The sheet's pages: as many as hold every cell at a size each can be read at. */
export function sheetPages(cells: readonly SheetCell[], size: { w: number; h: number }) {
	const columns = size.w >= size.h ? 4 : 6;
	const cellW = Math.floor((SHEET_W - SHEET_GAP * (columns + 1)) / columns);
	const imageH = Math.round((cellW * size.h) / size.w);
	const rows = Math.max(1, Math.floor((SHEET_W - SHEET_HEAD) / (imageH + LABEL_H + SHEET_GAP)));
	const per = columns * rows;
	const pages: SheetCell[][] = [];
	for (let at = 0; at < cells.length; at += per) pages.push(cells.slice(at, at + per));
	return { columns, cellW, imageH, pages };
}

/** The sheet's pages pictured: each a grid of the pictures, labelled, drawn in the rehearsal's own browser. */
export async function composeSheets(
	context: BrowserContext,
	cells: readonly SheetCell[],
	stills: readonly Still[],
	size: { w: number; h: number },
	title: string,
): Promise<Buffer[]> {
	if (cells.length === 0) return [];
	const { columns, cellW, imageH, pages } = sheetPages(cells, size);
	const byName = new Map(stills.map((still) => [still.name, still.png]));
	const page = await context.newPage();
	try {
		await page.route(`${SHEET_ORIGIN}/**`, (route) => {
			const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
			const png = byName.get(name);
			return png === undefined
				? route.fulfill({ status: 404 })
				: route.fulfill({ body: png, contentType: "image/png" });
		});
		await page.setViewportSize({ width: SHEET_W, height: 800 });
		const sheets: Buffer[] = [];
		for (const [at, cellsOf] of pages.entries()) {
			const head = `${escapeHtml(title)} · sheet ${at + 1} of ${pages.length}`;
			const figures = cellsOf
				.map((cell) => {
					const border =
						cell.mark === "broken"
							? "#ff4d4f"
							: cell.mark === "note"
								? "#f5a623"
								: cell.move
									? "#3a3a3f"
									: "#26262a";
					return `<figure><img src="${SHEET_ORIGIN}/${encodeURIComponent(cell.still)}" style="border-color:${border}"><figcaption${cell.move ? ' class="move"' : ""}>${escapeHtml(cell.label)}${cell.mark === undefined ? "" : ` · ${cell.mark === "broken" ? "broken" : "note"}`}</figcaption></figure>`;
				})
				.join("");
			await page.setContent(
				`<!doctype html><html><head><style>
					html,body{margin:0;background:#111113;color:#e6e6e8;font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif}
					header{height:${SHEET_HEAD}px;display:flex;align-items:center;padding:0 ${SHEET_GAP}px;font-size:14px;color:#bdbdc2}
					main{display:grid;grid-template-columns:repeat(${columns},${cellW}px);gap:${SHEET_GAP}px;padding:0 ${SHEET_GAP}px ${SHEET_GAP}px}
					figure{margin:0}
					img{display:block;width:${cellW}px;height:${imageH}px;object-fit:contain;background:#000;border:2px solid;box-sizing:border-box}
					figcaption{height:${LABEL_H}px;padding-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
					figcaption.move{color:#9a9aa2}
				</style></head><body style="width:${SHEET_W}px"><header>${head}</header><main>${figures}</main></body></html>`,
				{ waitUntil: "load" },
			);
			sheets.push(await page.screenshot({ type: "png", fullPage: true, timeout: STILL_MS }));
		}
		return sheets;
	} finally {
		await page.close().catch(() => {});
	}
}
