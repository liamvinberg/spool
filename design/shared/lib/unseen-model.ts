/**
 * What you have not looked at yet, and what moved since you did.
 *
 * An agent authors frames while you are somewhere else. When you come back the
 * canvas looks exactly as it did — same field, same names — and the six things
 * that are new are indistinguishable from the eighty that are not. That is the
 * whole problem: spool's medium is looking, and looking has no memory.
 *
 * Two states, one mechanism. A frame spool has no seen-record for is `new`; a
 * frame whose compiled-source hash has moved since the record was written is
 * `changed`. `hashInputs` (`src/daemon/compile.ts:401`) already produces that
 * hash for every frame on every compile and covers are already addressed by it,
 * so nothing new has to be computed — the record is a hash and a timestamp per
 * frame, and both questions fall out of comparing it to the current one.
 *
 * Where the record lives is a real decision and it is not the project: seen is
 * per-person, and `design/` is committed and shared. It belongs beside the
 * registry in `~/.spool` (`src/daemon/lifecycle.ts:47`), keyed by project root.
 * Memory alone would mean every daemon restart floods you with 88 unseen frames,
 * which is a mark nobody would trust twice.
 *
 * The geometry here is a mock canvas: world coordinates in px, a camera with a
 * scale, and the two questions the `view` clearing rule asks of a frame — is
 * enough of it on screen, and is it big enough to have been read.
 */

export type Mark = "new" | "changed";

export interface Plate {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	/** picks which wireframe body the plate draws; a frame is not a rectangle */
	readonly seed: number;
}

const PHONE_W = 390;
const PHONE_H = 844;

/** column and row pitch: a plate plus the gutter a person leaves between two */
const COL = 500;
const ROW = 1000;

function at(name: string, col: number, row: number, seed: number): Plate {
	return { name, x: col * COL, y: row * ROW, w: PHONE_W, h: PHONE_H, seed };
}

/**
 * One page of a shipping product, arranged the way a person arranges: families
 * in rows, variants beside their base. Twelve frames, of which six are things
 * the agent did while you were away.
 */
export const FIELD: readonly Plate[] = [
	at("home", 0, 0, 1),
	at("home--dense", 1, 0, 2),
	at("pricing", 2, 0, 3),
	at("pricing--annual", 3, 0, 4),
	at("checkout", 0, 1, 5),
	at("checkout--empty", 1, 1, 6),
	at("receipt", 2, 1, 7),
	at("settings", 3, 1, 8),
	at("settings--billing", 0, 2, 9),
	at("invite", 1, 2, 10),
	at("invite--sent", 2, 2, 11),
	at("help", 3, 2, 12),
];

/** the state of the canvas the moment you come back to it */
export const MARKS: Readonly<Record<string, Mark>> = {
	"home--dense": "new",
	pricing: "changed",
	"pricing--annual": "new",
	"checkout--empty": "new",
	receipt: "changed",
	"invite--sent": "new",
};

/** a second page, collapsed in the rail, holding one thing you have not seen */
export const SITE_FRAMES: readonly string[] = ["landing", "landing--wide", "press-kit"];
export const SITE_MARKS: Readonly<Record<string, Mark>> = { "landing--wide": "new" };
export const DOCS_FRAMES: readonly string[] = ["quickstart", "reference"];

export interface Cam {
	readonly x: number;
	readonly y: number;
	readonly k: number;
}

export interface View {
	readonly w: number;
	readonly h: number;
}

export const START: Cam = { x: 60, y: 70, k: 0.42 };

export const K_MIN = 0.12;
export const K_MAX = 1;

/**
 * The two thresholds the `view` rule stands on.
 *
 * `LEGIBLE_W` is the honest half of it: a frame 90px wide crossed the screen,
 * it was not read, and a rule that cleared it would be lying about you. 150px
 * is a phone frame at 38%, the zoom where its headline is a word rather than a
 * bar.
 *
 * `DWELL_MS` is the other half: on screen is not the same as looked at, and a
 * pan that sweeps a row in 200ms should leave every mark standing.
 */
export const LEGIBLE_W = 150;
export const COVERAGE = 0.6;
export const DWELL_MS = 900;

/**
 * How long a canvas keeps counting after you touch it. Frames sitting in view
 * of an empty chair are not being seen, and the rule has to say so or it clears
 * the whole field overnight. Real spool would ask the window whether it has
 * focus; here the last pointer event is the same question.
 */
export const ATTENTION_MS = 8000;

export interface Box {
	readonly left: number;
	readonly top: number;
	readonly w: number;
	readonly h: number;
}

export function boxOf(plate: Plate, cam: Cam): Box {
	return { left: plate.x * cam.k + cam.x, top: plate.y * cam.k + cam.y, w: plate.w * cam.k, h: plate.h * cam.k };
}

/** enough of it on screen, and big enough to have been read */
export function readable(plate: Plate, cam: Cam, view: View): boolean {
	const box = boxOf(plate, cam);
	if (box.w < LEGIBLE_W) return false;
	const across = Math.max(0, Math.min(box.left + box.w, view.w) - Math.max(box.left, 0));
	const down = Math.max(0, Math.min(box.top + box.h, view.h) - Math.max(box.top, 0));
	return (across * down) / (box.w * box.h) >= COVERAGE;
}

/** zoom keeping the point under the cursor where it is */
export function zoomAround(cam: Cam, at: { x: number; y: number }, factor: number): Cam {
	const k = Math.min(K_MAX, Math.max(K_MIN, cam.k * factor));
	const scale = k / cam.k;
	return { k, x: at.x - (at.x - cam.x) * scale, y: at.y - (at.y - cam.y) * scale };
}

/** the camera that puts one plate in the middle, never zooming out to get there */
export function centreOn(plate: Plate, cam: Cam, view: View): Cam {
	const k = Math.max(cam.k, 0.42);
	return { k, x: view.w / 2 - (plate.x + plate.w / 2) * k, y: view.h / 2 - (plate.y + plate.h / 2) * k };
}

/** unseen frames in reading order, which is the order the stepper walks them */
export function unseenOrder(marks: Readonly<Record<string, Mark>>): readonly Plate[] {
	return FIELD.filter((plate) => marks[plate.name] !== undefined);
}

export function countOf(marks: Readonly<Record<string, Mark>>): { readonly fresh: number; readonly moved: number } {
	const values = Object.values(marks);
	return {
		fresh: values.filter((mark) => mark === "new").length,
		moved: values.filter((mark) => mark === "changed").length,
	};
}

/**
 * The finder's own unseen set, over the 88 real frames in `frame-find.ts`. The
 * four at the top are the newest folders on disk, which is what makes the point:
 * the empty query is already sorted newest first, so the frames you have not seen
 * are the ones already under the caret when the palette opens.
 */
export const FIND_MARKS: Readonly<Record<string, Mark>> = {
	"spool-canvas--find-dim": "new",
	"spool-canvas--find-tail": "new",
	"spool-canvas--find-split": "new",
	"spool-canvas--find-fresh": "new",
	"agent-mark--open": "new",
	"agent-mark--edge": "new",
	"agent-mark--label": "new",
	"agent-play--ask-drop": "changed",
	"spool-canvas": "changed",
	"site-hub--composed": "changed",
};
