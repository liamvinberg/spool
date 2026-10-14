/**
 * A write moved the stamps after it, and this document is not reloaded for
 * its own save: every element past a patch shifts with it — along its line,
 * and down or up by the lines a delete or its undo took or put back.
 *
 * The attributes are walked here and now. The call sites the runtime minted
 * are not attributes and cannot be walked at all, so every shift is kept and
 * applied to one on its way out instead (#317).
 */

interface Place {
	line: number;
	column: number;
}

/** One shift a save made, as the canvas tells it (`restamp`). */
export interface StampShift extends Place {
	delta: number;
	taken: number;
	across?: { end: Place; to: Place };
}

const shifted = new Map<string, StampShift[]>();

export function restamp(file: string, shifts: readonly StampShift[]): void {
	const held = shifted.get(file) || [];
	for (const shift of shifts) held.push(shift);
	shifted.set(file, held);
	for (const el of document.querySelectorAll("[data-spool-source]")) {
		const at = stampParts(el.getAttribute("data-spool-source"));
		if (!at || at.file !== file) continue;
		// an element inside a run a delete took is one about to go with it
		// (a redo), and it keeps the stamp an undo will need again
		let place: Place = at;
		for (const shift of shifts) place = shiftPlace(place, shift) || place;
		if (place.line !== at.line || place.column !== at.column) {
			el.setAttribute("data-spool-source", `${at.file}:${place.line}:${place.column}`);
		}
	}
}

// A copy of parseStampRef (src/stamp.ts) that also takes a stamp with no file.
function stampParts(source: string | null): (Place & { file: string }) | null {
	const match = /^(.*):(\d+):(\d+)$/.exec(source || "");
	return match ? { file: match[1] as string, line: Number(match[2]), column: Number(match[3]) } : null;
}

// Where a place ends up after one shift, or null when it stood inside a run
// the patch took across lines: the copy of shiftedPlace (src/ui/canvas/hand-edit.ts)
// the frame runs.
function shiftPlace(at: Place, shift: StampShift): Place | null {
	const across = shift.across;
	if (!across) {
		if (shift.line === at.line && shift.column + (shift.taken || 0) <= at.column) {
			return { line: at.line, column: at.column + shift.delta };
		}
		return at;
	}
	if (earlier(at, shift)) return at;
	if (shift.taken > 0 && earlier(at, across.end)) return null;
	if (at.line === across.end.line) {
		return { line: across.to.line, column: across.to.column + at.column - across.end.column };
	}
	return { line: at.line + across.to.line - across.end.line, column: at.column };
}

function earlier(a: Place, b: Place): boolean {
	return a.line < b.line || (a.line === b.line && a.column < b.column);
}

function offsetIn(at: Place, from: Place): Place {
	return { line: at.line - from.line, column: at.line === from.line ? at.column - from.column : at.column };
}

// One compile-time stamp, as the file has it now: every shift this document
// was told about, in the order it was told. A stamp inside a run a delete
// took is gone until an undo puts the very run back where it stood; one
// that never comes back says a line no file has, which refuses as stale
// rather than landing on whatever moved into its place.
export function stampNow(source: string): string {
	const at = stampParts(source);
	if (!at) return source;
	let place: Place = { line: at.line, column: at.column };
	let lost: { anchor: Place; offset: Place; extent: Place } | null = null;
	for (const shift of shifted.get(at.file) || []) {
		if (!lost) {
			const next = shiftPlace(place, shift);
			if (next) place = next;
			else
				lost = {
					anchor: { line: shift.line, column: shift.column },
					offset: offsetIn(place, shift),
					// a place is lost only to a shift across lines
					extent: offsetIn((shift.across as NonNullable<StampShift["across"]>).end, shift),
				};
			continue;
		}
		const back =
			shift.across && shift.taken === 0 && shift.line === lost.anchor.line && shift.column === lost.anchor.column
				? offsetIn(shift.across.to, shift)
				: null;
		if (back && back.line === lost.extent.line && back.column === lost.extent.column) {
			place =
				lost.offset.line === 0
					? { line: shift.line, column: shift.column + lost.offset.column }
					: { line: shift.line + lost.offset.line, column: lost.offset.column };
			lost = null;
			continue;
		}
		const anchor = shiftPlace(lost.anchor, shift);
		if (!anchor) return `${at.file}:0:0`;
		lost.anchor = anchor;
	}
	return lost ? `${at.file}:0:0` : `${at.file}:${place.line}:${place.column}`;
}
