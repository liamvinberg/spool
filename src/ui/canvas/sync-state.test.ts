// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { SyncStateLine } from "./sync-state";

function mount(element: React.ReactNode) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() => root.render(element));
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	return host;
}

it("says a team project ended here, sync paused, and which files didn't travel, for as long as each lasts", () => {
	const host = mount(
		createElement(SyncStateLine, {
			state: {
				ended: "devosurf",
				goneLocal: null,
				paused: "you've made 30,000 saves to this project this month; sync starts again on 1 June",
				sending: null,
				held: [{ path: "shared/assets/film.mov", why: "it's over 25 MB" }],
			},
		}),
	);
	const said = host.querySelector("[data-sync-state]")?.textContent ?? "";
	expect(said).toContain("No longer synced with devosurf. This is now a project on this Mac only.");
	expect(said).toContain(
		"Sync paused: you've made 30,000 saves to this project this month; sync starts again on 1 June. Changes stay on this Mac until it lifts.",
	);
	expect(said).toContain("1 file didn't travel");
	act(() => host.querySelector<HTMLButtonElement>("[aria-expanded]")?.click());
	expect(host.querySelector("[data-sync-state]")?.textContent).toContain("shared/assets/film.mov it's over 25 MB");
});

it("says nothing while a team project syncs as it should", () => {
	const host = mount(
		createElement(SyncStateLine, { state: { ended: null, goneLocal: null, paused: null, sending: null, held: [] } }),
	);
	expect(host.querySelector("[data-sync-state]")).toBeNull();
});

it("says the team went local and the copy keeps working here, until the team pays", () => {
	const host = mount(
		createElement(SyncStateLine, {
			state: { ended: null, goneLocal: "Devosurf", paused: null, sending: null, held: [] },
		}),
	);
	expect(host.querySelector("[data-sync-state]")?.textContent).toBe(
		"Devosurf has gone local. Your copy keeps working here and syncs again once the team pays.",
	);
});

it("says changes waiting out a long spell on the minute's limit as progress, not as a pause", () => {
	const host = mount(
		createElement(SyncStateLine, {
			state: {
				ended: null,
				goneLocal: null,
				paused: null,
				sending: "Sending 340 changes to devosurf, about 3 minutes",
				held: [],
			},
		}),
	);
	expect(host.querySelector("[data-sync-state]")?.textContent).toBe(
		"Sending 340 changes to devosurf, about 3 minutes.",
	);
});
