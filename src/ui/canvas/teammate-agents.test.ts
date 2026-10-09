// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished } from "vitest";
import type { ProjectedPlaceholder } from "../../daemon/projection";
import type { PresenceState } from "../../team-sync-protocol";
import { createCameraStore } from "./camera-store";
import { createPresenceRoom, type PresenceRoom } from "./presence";
import { TeammatePlaceholder, teammateOf } from "./teammate-agents";

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
