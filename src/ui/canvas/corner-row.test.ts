import { expect, it } from "vitest";
import { FACES_FOLDED, FACES_FULL, GAP, LEVELS, type Level, levelFor, type RowWidths } from "./corner-row";

/** The top right's row (spool#312) gives way one level at a time as it runs short of room, Present never folding. */

const TRAIL = { full: 300, middle: 220, cut: 160, name: 70 };
const FACES = { [FACES_FULL]: 80, [FACES_FOLDED]: 64 };
const PRESENT = 110;
const row: RowWidths = { trail: TRAIL, faces: FACES, present: PRESENT };
const need = (trail: number, faces: number) => trail + faces + PRESENT + 2 * GAP;
const levelOf = (widths: RowWidths, room: number) => LEVELS[levelFor(widths, room)] as Level;

it("takes the first level that fits: the path's middle, then the faces, then its last part, then only its name", () => {
	expect(levelOf(row, need(300, 80))).toEqual({ fold: "full", faces: FACES_FULL });
	expect(levelOf(row, need(300, 80) - 1)).toEqual({ fold: "middle", faces: FACES_FULL });
	expect(levelOf(row, need(220, 64))).toEqual({ fold: "middle", faces: FACES_FOLDED });
	expect(levelOf(row, need(160, 64))).toEqual({ fold: "cut", faces: FACES_FOLDED });
	expect(levelOf(row, need(70, 64))).toEqual({ fold: "name", faces: FACES_FOLDED });
	// short even of that, the row stays at its last level: Present and your path never fold
	expect(levelOf(row, 0)).toEqual({ fold: "name", faces: FACES_FOLDED });
});

it("counts only the parts in the row and the gaps between them", () => {
	// the faces alone take the corner on a page that is no deck
	expect(levelOf({ trail: null, faces: FACES, present: 0 }, 80)).toEqual({ fold: "full", faces: FACES_FULL });
	expect(levelOf({ trail: null, faces: FACES, present: 0 }, 79).faces).toBe(FACES_FOLDED);
	expect(levelOf({ trail: TRAIL, faces: null, present: PRESENT }, 300 + GAP + PRESENT).fold).toBe("full");
	expect(levelOf({ trail: TRAIL, faces: null, present: PRESENT }, 300 + GAP + PRESENT - 1).fold).toBe("middle");
});
