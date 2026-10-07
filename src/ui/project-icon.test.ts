// @vitest-environment happy-dom

import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectCard, ProjectIcon } from "./api";
import { ProjectGrid } from "./home";
import { nameHue, ProjectMark, ProjectTeams } from "./project-icon";
import { type TabProject, TabStrip } from "./tab-strip";

const FILE: ProjectIcon = { from: "file", path: "design/shared/icon.svg", hash: "a".repeat(32) };
const FAVICON: ProjectIcon = { from: "favicon", path: "public/favicon.svg", hash: "b".repeat(32) };
const TEAMS = new Map([["devosurf", { address: "devosurf", name: "Devosurf", logo: null }]]);

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLElement }> = [];

afterEach(() => {
	for (const { root, host } of mounted.splice(0)) {
		act(() => root.unmount());
		host.remove();
	}
});

async function mount(element: ReactElement) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	mounted.push({ root, host });
	await act(async () => root.render(createElement(ProjectTeams.Provider, { value: TEAMS }, element)));
	return host;
}

describe("a project's icon", () => {
	it("draws its file or favicon from the daemon by hash", async () => {
		const host = await mount(createElement(ProjectMark, { project: "kvitt", name: "kvitt", icon: FILE }));
		const image = host.querySelector("img");
		expect(image?.getAttribute("src")).toBe(`/icons/kvitt/${FILE.hash}`);
		expect(image?.dataset.projectIcon).toBe("file");
		expect(image?.style.width).toBe("16px");
	});

	it("falls back to the name's first letter, lowercase on a tint picked from the name", async () => {
		const host = await mount(createElement(ProjectMark, { project: "Kvitt", name: "Kvitt", size: 20 }));
		const letter = host.querySelector<HTMLElement>('[data-project-icon="letter"]');
		expect(letter?.textContent).toBe("k");
		// the same name always gets the same tint (happy-dom keeps only the ring's colour-mix to read it by)
		expect(letter?.style.boxShadow).toContain(nameHue("Kvitt"));
		expect(new Set(["kvitt", "atlas", "notes", "spool", "kaffe"].map(nameHue)).size).toBeGreaterThan(1);
		expect(host.querySelector("[data-team-mark]")).toBeNull();
	});

	it("wears a team copy's team mark in its corner, cut from the colour behind it", async () => {
		const host = await mount(
			createElement(ProjectMark, {
				project: "checkout",
				name: "checkout",
				icon: FAVICON,
				team: "devosurf",
				cut: "var(--color-canvas)",
			}),
		);
		const badge = host.querySelector<HTMLElement>("[data-team-mark]");
		expect(badge?.dataset.teamMark).toBe("filled");
		expect(badge?.textContent).toBe("D");
		expect(badge?.style.width).toBe("10px");
		expect(badge?.style.boxShadow).toContain("var(--color-canvas)");
		// set out past the icon's corner by about a third of itself
		expect(badge?.parentElement?.style.right).toBe("-4px");
	});

	it("hollows the badge while the copy's sync is paused", async () => {
		const host = await mount(
			createElement(ProjectMark, { project: "checkout", name: "checkout", team: "devosurf", paused: true }),
		);
		const badge = host.querySelector<HTMLElement>("[data-team-mark]");
		expect(badge?.dataset.teamMark).toBe("hollow");
		expect(badge?.style.boxShadow).toContain("inset 0 0 0 1.25px var(--color-muted)");
		expect(badge?.classList.contains("text-muted")).toBe(true);
	});

	it("draws a team this Mac can't see right now from its address", async () => {
		const host = await mount(createElement(ProjectMark, { project: "atlas", name: "atlas", team: "northwind" }));
		expect(host.querySelector("[data-team-mark]")?.textContent).toBe("N");
	});
});

const tabs: TabProject[] = [
	{ root: "/w/kvitt", name: "kvitt", icon: FILE },
	{ root: "/w/checkout", name: "checkout", icon: FAVICON, teamAddress: "devosurf", paused: true },
	{ root: "/w/notes", name: "notes" },
];

async function strip(props: Partial<Parameters<typeof TabStrip>[0]> = {}) {
	return mount(
		createElement(TabStrip, {
			tabs,
			focused: "/w/kvitt",
			onFocus: () => {},
			onClose: () => {},
			onReorder: () => {},
			onPick: () => {},
			...props,
		}),
	);
}

async function openMenu(host: HTMLElement, index: number) {
	const label = host.querySelectorAll<HTMLButtonElement>(".project-tab-label")[index];
	await act(async () =>
		label?.dispatchEvent(
			new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
		),
	);
	return document.querySelector<HTMLElement>('[role="menu"]');
}

const rows = (menu: HTMLElement | null) =>
	[...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])].map((row) => row.textContent);

describe("a tab", () => {
	it("leads its name with the project's icon, and a team copy's with its badge", async () => {
		const host = await strip();
		const labels = [...host.querySelectorAll<HTMLElement>(".project-tab-label")];
		expect(labels[0]?.querySelector("img")?.getAttribute("src")).toBe(`/icons/kvitt/${FILE.hash}`);
		expect(labels[0]?.lastElementChild?.textContent).toBe("kvitt");
		expect(labels[1]?.querySelector<HTMLElement>("[data-team-mark]")?.dataset.teamMark).toBe("hollow");
		// the inactive tab sits on the bar, so its badge's gap is the bar's colour
		expect(labels[1]?.querySelector<HTMLElement>("[data-team-mark]")?.style.background).toBe("var(--color-bg)");
		expect(labels[2]?.querySelector('[data-project-icon="letter"]')?.textContent).toBe("n");
	});

	it("opens its menu on the project: its icon, its name and where it lives", async () => {
		const host = await strip({ onChangeIcon: () => {}, onRemoveIcon: () => {} });
		const solo = await openMenu(host, 0);
		expect(solo?.querySelector("img")?.style.width).toBe("24px");
		expect(solo?.textContent).toContain("kvittOn this Mac");
		expect(rows(solo)).toEqual(["Change icon…", "Remove icon", "Export project…", "Close tab"]);
		expect(document.activeElement?.textContent).toBe("Change icon…");
		await act(async () =>
			document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
		);

		const team = await openMenu(host, 1);
		expect(team?.textContent).toContain("checkoutDevosurf · sync paused");
		// a favicon is the repo's: there is no file of the project's own to remove
		expect(rows(team)).toEqual(["Change icon…", "Export project…", "Close tab"]);
	});

	it("asks to change or remove the icon of the tab the menu is on", async () => {
		const onChangeIcon = vi.fn();
		const onRemoveIcon = vi.fn();
		const host = await strip({ onChangeIcon, onRemoveIcon });
		await openMenu(host, 0);
		await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')][0]?.click());
		expect(onChangeIcon).toHaveBeenCalledWith(tabs[0]);
		await openMenu(host, 0);
		await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')][1]?.click());
		expect(onRemoveIcon).toHaveBeenCalledWith(tabs[0]);
	});
});

describe("a cover at Home", () => {
	const card = (name: string, icon?: ProjectIcon): ProjectCard & { copies: number } => ({
		root: `/w/${name}`,
		name,
		openedAt: "2026-01-01T00:00:00Z",
		frameCount: 0,
		covers: [],
		copies: 1,
		...(icon === undefined ? {} : { icon }),
	});

	async function grid(projects: ReturnType<typeof card>[], menu: string) {
		return mount(
			createElement(ProjectGrid, {
				projects,
				menu,
				onMenu: () => {},
				onOpenProject: () => {},
				onForgetProject: () => {},
				onTrashProject: () => {},
				onRenameProject: () => {},
				onChangeIcon: () => {},
				onRemoveIcon: () => {},
			}),
		);
	}

	it("draws the icon ahead of the name, and its menu changes it", async () => {
		const host = await grid([card("kvitt", FILE)], "/w/kvitt");
		expect(host.querySelector(".pj-cover-caption img")?.getAttribute("src")).toBe(`/icons/kvitt/${FILE.hash}`);
		const labels = [...host.querySelectorAll("article button")].map((button) => button.textContent);
		expect(labels.slice(labels.indexOf("Open"), labels.indexOf("Open") + 3)).toEqual([
			"Open",
			"Change icon…",
			"Remove icon",
		]);
	});

	it("offers no Remove icon when the icon is the repo's favicon or the letter", async () => {
		const host = await grid([card("atlas", FAVICON)], "/w/atlas");
		const labels = [...host.querySelectorAll("article button")].map((button) => button.textContent);
		expect(labels).toContain("Change icon…");
		expect(labels).not.toContain("Remove icon");
	});
});
