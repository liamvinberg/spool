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
				paused: "this project took 120 saves in the last minute",
				held: [{ path: "shared/assets/film.mov", why: "it's over 25 MB" }],
			},
		}),
	);
	const said = host.querySelector("[data-sync-state]")?.textContent ?? "";
	expect(said).toContain("No longer synced with devosurf. This is now a project on this Mac only.");
	expect(said).toContain(
		"Sync paused: this project took 120 saves in the last minute. Changes stay on this Mac until it lifts.",
	);
	expect(said).toContain("1 file didn't travel");
	act(() => host.querySelector<HTMLButtonElement>("[aria-expanded]")?.click());
	expect(host.querySelector("[data-sync-state]")?.textContent).toContain("shared/assets/film.mov it's over 25 MB");
});

it("says nothing while a team project syncs as it should", () => {
	const host = mount(createElement(SyncStateLine, { state: { ended: null, paused: null, held: [] } }));
	expect(host.querySelector("[data-sync-state]")).toBeNull();
});
