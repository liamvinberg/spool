// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { CloudTeam, DeletedTeam, ProjectCard } from "./api";
import { DOWNLOAD_URL } from "./desktop-bridge";
import { fakeTeamsSource } from "./fake-teams-source";
import { handedOver } from "./handover";
import { Home } from "./home";
import { handOffExport, teamExportItems, useTeamExport } from "./team-export";
import { DeletedTeamPage, HomePlaces, TeamSettingsPage, TeamsSourceContext } from "./teams";

/** A team export from Home (#200): Export all in Settings, Export… on a cover, a deleted team's page, and spool.page's hand-off. */

const NOW = Date.UTC(2026, 9, 21, 12);
const PURGE = Date.UTC(2026, 10, 20, 12) / 1000;

const team = (role: CloudTeam["role"]): CloudTeam => ({
	id: "t",
	address: "tidemark",
	name: "Tidemark",
	role,
	logo: null,
	people: 3,
	billing: { state: "paying" },
});
const DELETED: DeletedTeam = { address: "harbour", name: "Harbour", logo: null, purgeAfter: PURGE };

function render(element: ReactNode) {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	// the progress poll and the notice's fade are timers too, walked rather than waited out
	vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"], now: NOW });
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	act(() => root.render(element));
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
	return host;
}

/** The Mac app's folder dialog, answering with `folder`, and what it was asked. */
function macFolder(folder: string | null) {
	const asked: unknown[] = [];
	vi.stubGlobal("spoolCanvasWindow", {
		onCommand: () => () => {},
		setCanvasActive: () => {},
		chooseDirectory: async (request: unknown) => {
			asked.push(request);
			return folder;
		},
	});
	return asked;
}

/** Settings › General for `shown`, with the Mac's export behind its Export all. */
function settings(fake: ReturnType<typeof fakeTeamsSource>, shown: CloudTeam) {
	function Page() {
		const exporting = useTeamExport(fake.source);
		return createElement(
			"div",
			null,
			createElement(TeamSettingsPage, {
				team: shown,
				origin: "https://spool.page",
				onTab: () => {},
				onOpen: () => {},
				onChanged: () => {},
				onMoved: () => {},
				onDeleted: () => {},
				onExport: exporting.start,
			}),
			exporting.surface,
		);
	}
	return render(createElement(TeamsSourceContext.Provider, { value: fake.source }, createElement(Page)));
}

async function settle(ms = 0) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

function button(host: ParentNode, label: string): HTMLButtonElement {
	const found = Array.from(host.querySelectorAll("button")).find((node) => node.textContent === label);
	if (!found) throw new Error(`Missing button: ${label}`);
	return found;
}
const buttons = (host: ParentNode) => Array.from(host.querySelectorAll("button")).map((node) => node.textContent);

async function click(host: ParentNode, label: string) {
	await act(async () => button(host, label).click());
	await settle();
}

const said = () =>
	Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).map((node) => node.textContent);

it("asks an admin for a folder on Export all, shows how far it has come with Cancel, then says where it went", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")] });
	const dialog = macFolder("/Users/ana/Exports");
	const host = settings(fake, team("admin"));
	await click(host, "Export all…");
	expect(dialog).toEqual([{ purpose: "export", defaultPath: "~/Downloads" }]);
	expect(fake.asked).toContainEqual(expect.stringMatching(/^export tidemark into \/Users\/ana\/Exports as \S+$/u));

	fake.exports.progress({ project: "checkout", index: 1, projects: 2, saves: 1200 });
	await settle(600);
	expect(said()).toEqual(["Exporting checkout, 1 of 2 · 1,200 savesCancel"]);
	expect(buttons(document.body)).toContain("Cancel");

	fake.exports.finish("/Users/ana/Exports/tidemark export 2026-10-21");
	await settle();
	expect(said()).toContain("Exported to /Users/ana/Exports/tidemark export 2026-10-21");
});

it("stops the export on Cancel and says so", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")] });
	macFolder("/Users/ana/Exports");
	const host = settings(fake, team("admin"));
	await click(host, "Export all…");
	await settle(600);
	await click(document.body, "Cancel");
	expect(fake.asked).toContainEqual(expect.stringMatching(/^cancel export \S+$/u));
	expect(said()).toContain("Export cancelled.");
});

it("says plainly when this Mac has no git", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")] });
	macFolder("/Users/ana/Exports");
	const host = settings(fake, team("admin"));
	await click(host, "Export all…");
	fake.exports.fail("Exporting a team needs git, and this Mac has none.");
	await settle();
	expect(said()).toContain("Exporting a team needs git, and this Mac has none.");
});

it("does nothing when the folder dialog is put away", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")] });
	macFolder(null);
	const host = settings(fake, team("admin"));
	await click(host, "Export all…");
	expect(fake.asked.filter((line) => line.startsWith("export"))).toEqual([]);
});

it("shows editors and viewers no Export all", () => {
	for (const role of ["editor", "viewer"] as const) {
		const host = settings(fakeTeamsSource({ teams: [team(role)] }), team(role));
		expect(buttons(host)).not.toContain("Export all…");
	}
});

it("names the date admins can export a team until in the Delete team confirm", async () => {
	const fake = fakeTeamsSource({ teams: [team("admin")] });
	const host = settings(fake, team("admin"));
	await click(host, "Delete Tidemark…");
	expect(document.body.textContent).toContain("Admins can export it until November 20.");
});

it("gives an admin Export… on a team project's cover, and an editor or someone with a project of their own none", async () => {
	const linked = (name: string, address: string): ProjectCard => ({
		name,
		root: `/Users/ana/spool/${name}`,
		openedAt: new Date(NOW).toISOString(),
		frameCount: 1,
		covers: [],
		team: { team: address, project: name, url: `https://spool.page/${address}/${name}` },
	});
	const exported: string[] = [];
	const items = teamExportItems(
		[team("admin"), { ...team("editor"), id: "n", address: "northlight" }],
		(address, project) => exported.push(`${address}/${project}`),
	);
	const host = render(
		createElement(Home, {
			projects: [linked("checkout", "tidemark"), linked("site", "northlight")],
			onOpenProject: vi.fn(),
			onForgetProject: vi.fn(),
			onTrashProject: vi.fn(),
			onRenameProject: vi.fn(),
			onStart: vi.fn(),
			onFolder: vi.fn(),
			moveItems: items,
		}),
	);
	const menu = async (name: string) => {
		await act(async () => (host.querySelector(`[aria-label="Manage ${name}"]`) as HTMLButtonElement).click());
		return Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]'));
	};
	const checkout = await menu("checkout");
	await act(async () => checkout.find((item) => item.textContent === "Export…")?.click());
	expect(exported).toEqual(["tidemark/checkout"]);
	expect((await menu("site")).map((item) => item.textContent)).not.toContain("Export…");
});

it("keeps a deleted team in its admin's places, marked with the day it goes, and opens it to Export all alone", async () => {
	const chosen: string[] = [];
	const host = render(
		createElement(HomePlaces, {
			teams: [team("admin")],
			deleted: [DELETED],
			current: null,
			page: null,
			onTeam: (address: string) => chosen.push(address),
			onPage: () => {},
			onNewTeam: () => {},
		}),
	);
	const item = host.querySelector<HTMLElement>('[data-place="harbour"]');
	expect(item?.textContent).toContain("Deleted · gone on November 20");
	await act(async () => item?.click());
	expect(chosen).toEqual(["harbour"]);

	const exported: string[] = [];
	const page = render(
		createElement(DeletedTeamPage, {
			team: DELETED,
			onExport: async (address: string) => {
				exported.push(address);
				return null;
			},
		}),
	);
	expect(page.textContent).toContain("Harbour was deleted. It’s gone for good on November 20.");
	expect(buttons(page)).toEqual(["Export all…"]);
	await click(page, "Export all…");
	expect(exported).toEqual(["harbour"]);
});

it("on spool.page, opens spool on this Mac on the export, or offers the download when it doesn't answer", async () => {
	const went: string[] = [];
	const answered = await handOffExport("tidemark", "checkout", {
		knock: async () => true,
		go: (url) => went.push(url),
		open: () => {},
	});
	expect(answered).toBeNull();
	expect(went).toHaveLength(1);
	expect(handedOver(new URL(went[0] ?? "").search)).toEqual({ team: "tidemark", project: "checkout", export: true });

	const opened: string[] = [];
	const note = await handOffExport("tidemark", undefined, {
		knock: async () => false,
		go: () => {},
		open: (url) => opened.push(url),
	});
	const host = render(createElement("div", null, note));
	expect(host.textContent).toBe("spool isn’t open on this Mac. Open it to export, or download it.");
	await click(host, "download it");
	expect(opened).toEqual([DOWNLOAD_URL]);
});
