// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished } from "vitest";
import type { ProjectedPlaceholder } from "../../daemon/projection";
import type { PresenceAgentWork, PresenceState } from "../../team-sync-protocol";
import type { ProjectedFrame } from "../api";
import { createCameraStore } from "./camera-store";
import { createPresenceRoom, type PresenceRoom } from "./presence";
import { TeammateCompanions, TeammatePlaceholder, teammateCompanions, teammateOf, workHeard } from "./teammate-agents";

/**
 * A teammate's agent on a team canvas (#378): their designer's placeholder frame, which
 * reaches this canvas through sync, drawn in their presence colour with their name.
 */

const ada = { accountId: "acct-ada", name: "ada" };
const placeholder: ProjectedPlaceholder = {
	name: "ideas/home--split",
	page: "ideas",
	x: 100,
	y: 50,
	w: 390,
	h: 844,
	title: "Split home",
	by: ada,
};
const here: PresenceState = { page: "ideas", pointer: null, pressed: false, dragging: [], inside: null, view: null };

function draw(room: PresenceRoom, one: ProjectedPlaceholder = placeholder): HTMLElement {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	const camera = createCameraStore();
	camera.set({ x: 0, y: 0, k: 1 });
	const by = teammateOf(one, "acct-me");
	if (by === undefined) throw new Error("not a teammate's");
	act(() => root.render(createElement(TeammatePlaceholder, { room, placeholder: one, by, camera, pointed: false })));
	return host;
}

describe("whose a placeholder is", () => {
	it("is a teammate's when another account's agent made it, and this canvas's own otherwise", () => {
		expect(teammateOf(placeholder, "acct-me")).toEqual(ada);
		expect(teammateOf(placeholder, "acct-ada")).toBeUndefined();
		const { by: _, ...nobodys } = placeholder;
		expect(teammateOf(nobodys, "acct-me")).toBeUndefined();
		// until this canvas knows who it is signed in as, every placeholder is drawn as it always was
		expect(teammateOf(placeholder, null)).toBeUndefined();
	});
});

describe("a teammate's placeholder frame", () => {
	it("is drawn in their presence colour, and says whose designer is drawing it", () => {
		const room = createPresenceRoom();
		room.hear({ type: "presence", person: { ...ada, color: "#eaa94a" }, state: here, still: 0 });
		const host = draw(room);
		const frame = host.querySelector<HTMLElement>('[data-placeholder-frame="ideas/home--split"]');
		expect(frame?.getAttribute("data-placeholder-by")).toBe("acct-ada");
		expect(frame?.textContent).toContain("ada's designer is drawing this frame");
		const edge = frame?.querySelector<HTMLElement>(".border-dashed");
		expect(edge?.style.borderColor).toBe("#eaa94a");
		expect(host.querySelector<HTMLElement>("[data-placeholder-mark]")?.style.background).toBe("#eaa94a");
	});

	it("keeps their colour once they leave, and takes it the moment they arrive", () => {
		const room = createPresenceRoom();
		const host = draw(room);
		// nobody has said who ada is yet: neutral ink
		expect(host.querySelector<HTMLElement>(".border-dashed")?.style.borderColor).toBe("");
		expect(host.textContent).toContain("ada's designer is drawing this frame");
		act(() => room.hear({ type: "presence", person: { ...ada, color: "#4cc495" }, state: here, still: 0 }));
		expect(host.querySelector<HTMLElement>(".border-dashed")?.style.borderColor).toBe("#4cc495");
		act(() => room.hear({ type: "presence", person: { ...ada, color: "#4cc495" }, state: null, still: 0 }));
		expect(host.querySelector<HTMLElement>(".border-dashed")?.style.borderColor).toBe("#4cc495");
	});
});

describe("a teammate's agent at work (#378)", () => {
	const working = (work: PresenceAgentWork[]): PresenceState => ({
		...here,
		agent: { running: true, status: `${work.length} designers working`, work },
	});

	it("shows what their designer is doing inside its placeholder, with a live mark in their colour", () => {
		const room = createPresenceRoom();
		room.hear({ type: "presence", person: { ...ada, color: "#eaa94a" }, state: here, still: 0 });
		const host = draw(room);
		expect(host.querySelector("[data-placeholder-live]")).toBeNull();
		act(() =>
			room.hear({
				type: "presence",
				person: { ...ada, color: "#eaa94a" },
				state: working([{ frame: "ideas/home--split", act: "drawing", detail: null, lines: 42 }]),
				still: 0,
			}),
		);
		const frame = host.querySelector("[data-placeholder-frame]");
		expect(frame?.getAttribute("data-placeholder-work")).toBe("drawing");
		expect(frame?.textContent).toContain("ada's designer");
		expect(frame?.textContent).toContain("42 lines");
		expect(host.querySelector<HTMLElement>("[data-placeholder-live]")?.style.background).toBe("#eaa94a");
		// they leave: what they were doing goes with them, and whose it is stays
		act(() => room.hear({ type: "presence", person: { ...ada, color: "#eaa94a" }, state: null, still: 0 }));
		expect(host.querySelector("[data-placeholder-live]")).toBeNull();
		expect(host.textContent).toContain("ada's designer is drawing this frame");
	});

	it("reads a designer's step the way this canvas reads its own", () => {
		const one = { frame: "f", detail: "Running Write the frame, then spool check", lines: 0 };
		expect(workHeard({ ...one, act: "reading" })).toEqual({
			phase: "Drawing",
			detail: "Write the frame, then spool check",
		});
		expect(workHeard({ ...one, act: "edit" })).toBeNull();
		expect(workHeard(undefined)).toBeNull();
	});

	it("puts their agents at frames this canvas shows as companions, and nothing elsewhere", () => {
		const room = createPresenceRoom();
		room.hear({
			type: "presence",
			person: { ...ada, color: "#eaa94a" },
			state: working([
				{ frame: "app/home", act: "edit", detail: null, lines: 80 },
				{ frame: "app/cart", act: "drawing", detail: null, lines: 3 },
				{ frame: "ideas/home--split", act: "reading", detail: null, lines: 0 },
				{ frame: "app/menu", act: "a-new-word", detail: null, lines: 0 },
			]),
			still: 0,
		});
		const mate = room.get("acct-ada");
		if (mate === undefined) throw new Error("ada is here");
		const squares = teammateCompanions(mate, new Set(["app/home", "app/cart", "app/menu"]));
		expect(squares.map(({ frame, act, own }) => ({ frame, act, own }))).toEqual([
			{ frame: "app/home", act: "edit", own: false },
			{ frame: "app/cart", act: "new", own: false },
			{ frame: "app/menu", act: "idle", own: false },
		]);
	});

	it("draws their squares in their colour", () => {
		const room = createPresenceRoom();
		room.hear({
			type: "presence",
			person: { ...ada, color: "#eaa94a" },
			state: working([{ frame: "home", act: "idle", detail: null, lines: 0 }]),
			still: 0,
		});
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		onTestFinished(() => {
			act(() => root.unmount());
			host.remove();
		});
		const camera = createCameraStore();
		camera.set({ x: 0, y: 0, k: 1 });
		const frames = [{ name: "home", x: 0, y: 0, w: 400, h: 800 } as ProjectedFrame];
		act(() => root.render(createElement(TeammateCompanions, { room, camera, frames })));
		const theirs = host.querySelector<HTMLElement>('[data-teammate-companions="acct-ada"]');
		expect(theirs?.style.getPropertyValue("--color-text")).toBe("#eaa94a");
		expect(theirs?.querySelector('[data-agent-companion="acct-ada:home"]')).not.toBeNull();
		// their turn over, their squares go
		act(() => room.hear({ type: "presence", person: { ...ada, color: "#eaa94a" }, state: here, still: 0 }));
		expect(host.querySelector("[data-teammate-companions]")).toBeNull();
	});
});
