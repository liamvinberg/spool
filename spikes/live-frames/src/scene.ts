// 63-frame field: 9×7 grid, kinds spread deterministically (seeded LCG) so heavy
// frames land everywhere, not clustered. Same shape every run — playwright shots,
// benchmarks, and the in-app scene must agree on ids.

export type ScreenKind =
	| "login"
	| "clock"
	| "habit"
	| "statsdesk"
	| "buttons"
	| "todo"
	| "particles"
	| "ticker"
	| "livechart";

export type SceneFrame = {
	id: string;
	name: string;
	kind: ScreenKind;
	x: number;
	y: number;
	w: number;
	h: number;
};

export type SceneArrow = { id: string; from: string; to: string };

const COLS = 9;
const CELL_W = 1560;
const CELL_H = 1160;

// counts sum to 63. ~27 frames do continuous work (rAF loops / intervals),
// the rest are static-ish with entry animations and hover states — a plausible mix
// for a real design canvas.
const KIND_COUNTS: Record<ScreenKind, number> = {
	particles: 6,
	ticker: 6,
	livechart: 6,
	clock: 9,
	login: 9,
	habit: 7,
	statsdesk: 6,
	buttons: 7,
	todo: 7,
};

const SIZES: Record<ScreenKind, { w: number; h: number }> = {
	login: { w: 390, h: 844 },
	clock: { w: 390, h: 844 },
	habit: { w: 390, h: 844 },
	todo: { w: 390, h: 844 },
	particles: { w: 390, h: 844 },
	ticker: { w: 390, h: 844 },
	livechart: { w: 390, h: 844 },
	buttons: { w: 420, h: 320 },
	statsdesk: { w: 1280, h: 800 },
};

function seededShuffle<T>(items: T[], seed: number): T[] {
	const out = [...items];
	let s = seed;
	const rand = () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		const a = out[i];
		const b = out[j];
		if (a !== undefined && b !== undefined) {
			out[i] = b;
			out[j] = a;
		}
	}
	return out;
}

const kindDeck: ScreenKind[] = seededShuffle(
	(Object.entries(KIND_COUNTS) as [ScreenKind, number][]).flatMap(([k, n]) => Array.from({ length: n }, () => k)),
	42,
);

export const sceneFrames: SceneFrame[] = kindDeck.map((kind, i) => {
	const col = i % COLS;
	const row = Math.floor(i / COLS);
	const size = SIZES[kind];
	const perKindIndex = kindDeck.slice(0, i).filter((k) => k === kind).length;
	return {
		id: `f-${String(i).padStart(2, "0")}`,
		name: `${kind}-${perKindIndex}`,
		kind,
		x: col * CELL_W + 80,
		y: row * CELL_H + 80,
		w: size.w,
		h: size.h,
	};
});

// Flow noodles between horizontal neighbors — enough to make the SVG layer real.
export const sceneArrows: SceneArrow[] = sceneFrames.flatMap((f, i) => {
	const col = i % COLS;
	const row = Math.floor(i / COLS);
	const next = sceneFrames[i + 1];
	if (col < COLS - 1 && (row + col) % 2 === 0 && next) {
		return [{ id: `a-${f.id}-${next.id}`, from: f.id, to: next.id }];
	}
	return [];
});
