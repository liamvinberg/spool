// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { SYNC_CHANGED, SyncNotices, useSyncState } from "./sync-state";

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

it("says a team project ended here, sync paused, and which files didn't travel, each a notice of its own", () => {
	const host = mount(
		createElement(SyncNotices, {
			state: {
				ended: "devosurf",
				goneLocal: null,
				paused: "this project took 120 saves in the last minute",
				sending: null,
				held: [
					{ path: "shared/assets/film.mov", why: "it's over 25 MB" },
					{ path: "shared/assets/raw.psd", why: "it's over 25 MB" },
				],
			},
		}),
	);
	const said = () => [...host.querySelectorAll("[data-sync-state]")].map((notice) => notice.textContent ?? "");
	expect(said()).toHaveLength(3);
	expect(said()[0]).toContain("No longer synced with devosurf. This is now a project on this Mac only.");
	expect(said()[1]).toContain(
		"Sync paused: this project took 120 saves in the last minute. Changes stay on this Mac until it lifts.",
	);
	expect(said()[2]).toContain("2 files didn't travel");
	act(() => host.querySelector<HTMLButtonElement>("[aria-expanded]")?.click());
	expect(host.textContent).toContain("shared/assets/film.mov it's over 25 MB");

	// a notice closed stays closed; the others stand
	const paused = host.querySelectorAll("[data-sync-state]")[1];
	act(() => paused?.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')?.click());
	expect(said()).toHaveLength(2);
	expect(said().join("")).not.toContain("Sync paused");
});

it("names the one file that didn't travel", () => {
	const host = mount(
		createElement(SyncNotices, {
			state: {
				ended: null,
				goneLocal: null,
				paused: null,
				sending: null,
				held: [{ path: "shared/assets/film.mov", why: "it's over 25 MB" }],
			},
		}),
	);
	expect(host.querySelector("[data-sync-state]")?.textContent).toContain(
		"shared/assets/film.mov didn't travel: it's over 25 MB",
	);
});

it("says nothing while a team project syncs as it should", () => {
	const host = mount(
		createElement(SyncNotices, { state: { ended: null, goneLocal: null, paused: null, sending: null, held: [] } }),
	);
	expect(host.querySelector("[data-sync-state]")).toBeNull();
});

it("says the team went local and the copy keeps working here, until the team pays", () => {
	const host = mount(
		createElement(SyncNotices, {
			state: { ended: null, goneLocal: "Devosurf", paused: null, sending: null, held: [] },
		}),
	);
	expect(host.querySelector("[data-sync-state]")?.textContent).toContain(
		"Devosurf has gone local. Your copy keeps working here and syncs again once the team pays.",
	);
});

it("says changes waiting out a long spell on the minute's limit as progress, not as a pause", () => {
	const host = mount(
		createElement(SyncNotices, {
			state: {
				ended: null,
				goneLocal: null,
				paused: null,
				sending: "Sending 340 changes to devosurf, about 3 minutes",
				held: [],
			},
		}),
	);
	expect(host.querySelector("[data-sync-state]")?.textContent).toContain(
		"Sending 340 changes to devosurf, about 3 minutes.",
	);
});

it("counts a long wait down in the same notice, and a closed one stays closed until the wait ends", () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
	});
	const show = (sending: string | null) =>
		act(() =>
			root.render(
				createElement(SyncNotices, { state: { ended: null, goneLocal: null, paused: null, sending, held: [] } }),
			),
		);
	show("Sending 3,898 changes to devosurf, about 32 minutes");
	const notice = host.querySelector("[data-sync-state]");
	show("Sending 3,880 changes to devosurf, about 32 minutes");
	// the same notice with new words: it doesn't slide in again
	expect(host.querySelector("[data-sync-state]")).toBe(notice);
	expect(notice?.textContent).toContain("Sending 3,880 changes to devosurf, about 32 minutes.");

	act(() => notice?.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')?.click());
	show("Sending 3,700 changes to devosurf, about 31 minutes");
	expect(host.querySelector("[data-sync-state]")).toBeNull();

	// the next wait is said again
	show(null);
	show("Sending 900 changes to devosurf, about 8 minutes");
	expect(host.querySelector("[data-sync-state]")?.textContent).toContain("Sending 900 changes");
});

it("stands the moved sheet over the canvas once the pull lands, and Remove from Home forgets the project", async () => {
	const sync = { ended: null, goneLocal: null, paused: null, sending: null, held: [], moved: null as unknown };
	const asked: { url: string; body: string | undefined }[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new Request(input, init).url;
			asked.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
			return Response.json(url.endsWith("/sync") ? sync : {});
		}),
	);
	function Canvas() {
		return createElement("div", null, useSyncState("kaffe", "/Users/ben/kaffe"));
	}
	mount(createElement(Canvas));
	await act(async () => {});
	expect(document.querySelector("[data-moved-sheet]")).toBeNull();

	// the pull lands: the daemon says the project moved, and the canvas reads its sync again
	sync.moved = {
		team: "tidemark",
		url: "https://spool.page/tidemark/kaffe",
		standing: "outside",
		commit: { hash: "3f2a1c9d0e", author: "Ada Lind", date: "2026-09-01T00:00:00Z" },
		leftover: [],
	};
	await act(async () => {
		window.dispatchEvent(new CustomEvent(SYNC_CHANGED));
	});
	const sheet = document.querySelector<HTMLElement>("[data-moved-sheet]");
	expect(sheet?.textContent).toContain("kaffe moved to tidemark");
	const remove = [...(sheet?.querySelectorAll("button") ?? [])].find((one) => one.textContent === "Remove from Home");
	await act(async () => remove?.click());
	expect(document.querySelector("[data-moved-sheet]")).toBeNull();
	const forgot = asked.find((one) => one.url.endsWith("/api/projects/forget"));
	expect(JSON.parse(forgot?.body ?? "{}")).toEqual({ root: "/Users/ben/kaffe" });
});
