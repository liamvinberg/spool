import { describe, expect, it, vi } from "vitest";
import type { RungRead } from "../api";
import { createCanvasStore } from "./canvas-store";
import type { ShownRefusal } from "./hand-edit";
import { emptyHistory } from "./history";
import type { PickedSelection } from "./overlays";
import { createHandEdit, type HandEditDeps, UNREAD } from "./use-hand-edit";

vi.mock("../api", () => ({
	revertPatch: vi.fn(),
	writeElement: vi.fn(() => new Promise(() => {})),
	writeText: vi.fn(() => new Promise(() => {})),
}));

const pick = (over: Partial<PickedSelection> = {}): PickedSelection => ({
	frame: "cart",
	selector: "screen > h1",
	tag: "h1",
	outerHtml: "<h1>Pay now</h1>",
	rect: { x: 10, y: 10, w: 100, h: 40 },
	radius: 0,
	words: true,
	source: "frames/cart/frame.tsx:7:4",
	generated: false,
	...over,
});

const readOf = (over: Partial<RungRead> = {}): RungRead => ({
	source: "frames/cart/frame.tsx:7:4",
	path: "design/frames/cart/frame.tsx",
	fingerprint: "f1",
	...over,
});

/** The lane over a canvas of one frame, `cart`, whose document hears every message. */
function lane() {
	const posted: unknown[] = [];
	const frame = { contentWindow: { postMessage: (message: unknown) => posted.push(message) }, focus() {} };
	const shown: (ShownRefusal | null)[] = [];
	const deps: HandEditDeps = {
		project: "p",
		store: createCanvasStore(),
		picked: [],
		iframes: { current: new Map([["cart", frame as unknown as HTMLIFrameElement]]) },
		pickSeq: { current: 0 },
		reloading: { current: new Set() },
		holdNext: { current: new Set() },
		saved: { current: new Map() },
		pickedChain: { current: null },
		generationWaiters: { current: new Map() },
		viewportRef: { current: null },
		history: { current: emptyHistory() },
		setEditing: vi.fn(),
		setPicked: vi.fn(),
		setSelected: vi.fn(),
		setSaves: vi.fn(),
		setNotice: vi.fn(),
		updateHistory: vi.fn(),
		recordEntry: vi.fn(),
		reloadFrameDocument: vi.fn(),
		frameHeld: () => true,
		sharedWrite: () => false,
		holdChain: vi.fn(),
		holdFrame: vi.fn(),
		whenLoaded: (_frame, then) => then(),
		walkKin: vi.fn(),
		repick: vi.fn(),
		selectGeneration: vi.fn(),
		beginPick: vi.fn(),
		applyPick: vi.fn(),
		askFrame: vi.fn(),
	};
	const hand = createHandEdit(
		() => deps,
		(next) => {
			shown.push(typeof next === "function" ? next(shown.at(-1) ?? null) : next);
		},
	);
	const refusals = () => shown.filter((one) => one !== null).map((one) => one.refusal);
	const alters = () => posted.filter((message) => (message as { spool?: string }).spool === "alter");
	return { hand, posted, refusals, alters };
}

describe("the read every write is measured against", () => {
	it("writes against the selection's read of the element", () => {
		const { hand, alters, refusals } = lane();
		hand.noteRead(readOf(), [readOf()], false);
		hand.deleteElement([pick()]);
		expect(refusals()).toEqual([]);
		expect(alters()).toHaveLength(1);
	});

	it("refuses a write the file was never read for", () => {
		const { hand, alters, refusals } = lane();
		hand.noteRead(undefined, [], false);
		hand.deleteElement([pick()]);
		expect(refusals()).toEqual([UNREAD]);
		expect(alters()).toEqual([]);
	});

	it("waits for a read still on its way, and writes once it lands (DEV-299)", () => {
		const { hand, alters, refusals } = lane();
		hand.noteRead(undefined, null, true);
		hand.deleteElement([pick()]);
		expect(refusals()).toEqual([]);
		expect(alters()).toEqual([]);
		hand.noteRead(readOf(), [readOf()], false);
		hand.readSettled();
		expect(refusals()).toEqual([]);
		expect(alters()).toHaveLength(1);
	});

	it("refuses once a read it waited on never came", () => {
		const { hand, alters, refusals } = lane();
		hand.noteRead(undefined, null, true);
		hand.deleteElement([pick()]);
		hand.readSettled();
		expect(refusals()).toEqual([UNREAD]);
		expect(alters()).toEqual([]);
	});

	it("puts typed words back and refuses when their file was never read", () => {
		const { hand, posted, refusals } = lane();
		hand.noteRead(undefined, [], false);
		hand.finishEdit(
			{
				frame: "cart",
				selector: "screen > h1",
				source: "frames/cart/frame.tsx:7:4",
				id: 1,
				fingerprint: undefined,
				phase: "open",
				start: "Pay now",
			},
			true,
			[{ text: "Pay later" }],
			null,
		);
		expect(refusals()).toEqual([UNREAD]);
		expect(posted.some((message) => (message as { spool?: string }).spool === "restore")).toBe(true);
	});
});
