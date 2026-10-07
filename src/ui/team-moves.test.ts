// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { CloudTeam, TeamProjectOnMac } from "./api";
import { Home } from "./home";
import { GetItDialog, MoveToTeamDialog, moveCommitNote, TeamProjectsAway } from "./team-moves";

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

const DEVOSURF: CloudTeam = { id: "t", address: "devosurf", name: "Devosurf", role: "editor", logo: null, people: 3 };
const TIDEMARK: CloudTeam = { id: "u", address: "tidemark", name: "Tidemark", role: "admin", logo: null, people: 2 };

const project = (change: Partial<TeamProjectOnMac> = {}): TeamProjectOnMac => ({
	name: "app",
	url: "https://spool.page/devosurf/app",
	repo: "github.com/devosurf/app",
	clone: "git clone https://github.com/devosurf/app.git",
	copies: [],
	checkouts: ["/Users/ben/code/app"],
	home: "/Users/ben/spool/devosurf/app",
	...change,
});

/** The daemon, as these sheets ask it: one answer for every call, and what was asked. */
function daemon(answer: (url: string) => Response | Promise<Response>) {
	const asked: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string, init?: RequestInit) => {
			asked.push(`${init?.method ?? "GET"} ${url}${init?.body ? ` ${init.body}` : ""}`);
			return answer(url);
		}),
	);
	return asked;
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

function button(host: ParentNode, label: string): HTMLButtonElement {
	const found = Array.from(host.querySelectorAll("button")).find((node) => node.textContent === label);
	if (!found) throw new Error(`Missing button: ${label}`);
	return found;
}

it("dims the team's projects not on this Mac, each with Get it, and leaves out those it holds", async () => {
	daemon(() =>
		Response.json({ projects: [project(), project({ name: "site", repo: null, clone: null, copies: ["/x/site"] })] }),
	);
	const host = mount(createElement(TeamProjectsAway, { team: DEVOSURF, onGot: vi.fn() }));
	await settle();
	expect(host.textContent).toContain("Not on this Mac");
	expect(host.textContent).toContain("app");
	expect(host.textContent).toContain("github.com/devosurf/app");
	expect(host.textContent).not.toContain("site");
	expect(host.querySelector('[aria-label="Get app"]')).not.toBeNull();
});

it("offers the checkout here first, then a picked one, then just this Mac, and shows the clone command", async () => {
	const asked = daemon(() => Response.json({ root: "/Users/ben/code/app", name: "app" }));
	const onGot = vi.fn();
	const host = mount(createElement(GetItDialog, { team: DEVOSURF, project: project(), onGot, onClose: vi.fn() }));
	const choices = Array.from(host.querySelectorAll("label")).map((label) => label.textContent);
	expect(choices).toEqual([
		"In ~/code/appYour checkout of github.com/devosurf/app",
		"In a checkout…Choose a clone of the repo",
		"Just on this Mac~/spool/devosurf/app",
	]);
	expect(host.querySelector<HTMLInputElement>('input[type="radio"]')?.checked).toBe(true);
	expect(host.querySelector("code")?.textContent).toBe("git clone https://github.com/devosurf/app.git");

	await act(async () => button(host, "Get it").click());
	await settle();
	expect(asked).toEqual([
		'POST /api/cloud/teams/devosurf/projects/app/get {"where":"checkout","path":"/Users/ben/code/app"}',
	]);
	expect(onGot).toHaveBeenCalledWith({ root: "/Users/ben/code/app", name: "app" });
});

it("gets it just on this Mac when no checkout here holds the repo, and says why it couldn't", async () => {
	const asked = daemon(() =>
		Response.json({ error: "You're a viewer of devosurf; open it in a browser." }, { status: 409 }),
	);
	const host = mount(
		createElement(GetItDialog, {
			team: DEVOSURF,
			project: project({ checkouts: [], repo: null, clone: null }),
			onGot: vi.fn(),
			onClose: vi.fn(),
		}),
	);
	const radios = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
	expect(radios.map((radio) => radio.checked)).toEqual([false, true]);
	expect(host.querySelector("code")).toBeNull();
	await act(async () => button(host, "Get it").click());
	await settle();
	expect(asked).toEqual(['POST /api/cloud/teams/devosurf/projects/app/get {"where":"mac"}']);
	expect(host.textContent).toContain("You're a viewer of devosurf");
});

it("names what stays on this Mac and in git before it moves", async () => {
	daemon((url) =>
		url.includes("/move/stays")
			? Response.json({
					stays: [{ path: "README.md", why: "only canvas.json, AGENTS.md, CLAUDE.md, frames/ and shared/ sync" }],
				})
			: Response.json({}),
	);
	const host = mount(
		createElement(MoveToTeamDialog, {
			project: { root: "/Users/ana/site", name: "site" },
			teams: [DEVOSURF],
			onMoved: vi.fn(),
			onClose: vi.fn(),
		}),
	);
	await settle();
	expect(host.querySelector("[data-move-stays]")?.textContent).toContain(
		"This file stays on this Mac and in git. It doesn't go to the team:",
	);
	expect(host.querySelector("[data-move-stays]")?.textContent).toContain("design/README.md");
});

it("says on Home when a move's commit wasn't made, and nothing when it was", () => {
	const moved = { root: "/Users/ana/site", name: "site" };
	expect(moveCommitNote({ ...moved, commit: "committed" }, DEVOSURF)).toBeUndefined();
	expect(moveCommitNote({ ...moved, commit: "no-git" }, DEVOSURF)).toBeUndefined();
	expect(moveCommitNote({ ...moved, commit: "failed" }, DEVOSURF)).toBe(
		"site moved to Devosurf. git didn't take its commit. spool tries again the next time it starts, or commit spool.json and design/'s removal yourself.",
	);
	expect(moveCommitNote({ ...moved, commit: "waiting" }, DEVOSURF)).toBe(
		"site moved to Devosurf. Its commit lands once git is done with what it's doing.",
	);
});

it("moves a project to the chosen team, saying history before the move stays in git", async () => {
	const asked = daemon((url) =>
		url.includes("/move/stays")
			? Response.json({ stays: [] })
			: Response.json({ root: "/Users/ana/site", name: "site", commit: "committed" }),
	);
	const onMoved = vi.fn();
	const host = mount(
		createElement(MoveToTeamDialog, {
			project: { root: "/Users/ana/site", name: "site" },
			teams: [DEVOSURF, TIDEMARK],
			onMoved,
			onClose: vi.fn(),
		}),
	);
	expect(host.textContent).toContain("History before the move stays in git.");
	const select = host.querySelector("select") as HTMLSelectElement;
	await act(async () => {
		select.value = "tidemark";
		select.dispatchEvent(new Event("change", { bubbles: true }));
	});
	await act(async () => button(host, "Move to Tidemark").click());
	await settle();
	expect(asked).toEqual([
		"GET /api/cloud/move/stays?path=%2FUsers%2Fana%2Fsite",
		"GET /api/cloud/move/progress?path=%2FUsers%2Fana%2Fsite",
		'POST /api/cloud/teams/tidemark/move {"path":"/Users/ana/site"}',
	]);
	expect(onMoved).toHaveBeenCalledWith({ root: "/Users/ana/site", name: "site", commit: "committed" }, TIDEMARK);
});

it("offers Move to team on a project's cover, never on a team project's", async () => {
	const card = (name: string, team?: { url: string; team: string; project: string }) => ({
		name,
		root: `/Users/ana/${name}`,
		openedAt: new Date().toISOString(),
		frameCount: 1,
		covers: [],
		...(team === undefined ? {} : { team }),
	});
	const onMoveToTeam = vi.fn();
	const noop = vi.fn();
	const host = mount(
		createElement(Home, {
			projects: [
				card("site"),
				card("app", { url: "https://spool.page/devosurf/app", team: "devosurf", project: "app" }),
			] as never,
			onOpenProject: noop,
			onForgetProject: noop,
			onTrashProject: noop,
			onRenameProject: noop,
			onStart: noop,
			onFolder: noop,
			onSettings: noop,
			onMoveToTeam,
		}),
	);
	await act(async () => (host.querySelector('[aria-label="Manage app"]') as HTMLButtonElement).click());
	expect(Array.from(host.querySelectorAll("button")).some((node) => node.textContent === "Move to team…")).toBe(false);
	await act(async () => (host.querySelector('[aria-label="Manage site"]') as HTMLButtonElement).click());
	await act(async () => button(host, "Move to team…").click());
	expect(onMoveToTeam).toHaveBeenCalledWith(expect.objectContaining({ root: "/Users/ana/site", name: "site" }));
});

const CHAMFER = { root: "/Users/ana/chamfer", name: "chamfer" };
const PAUSED = (until: number) => ({
	up: 240,
	total: 1922,
	paused: { why: "this project took 120 saves in the last minute", until },
});
const NOTHING = { progress: null, team: null, ended: null };

/** Fake intervals and clock: a poll a second, and a countdown that moves with them. */
function fakeClock() {
	vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], now: new Date("2026-05-20T12:00:00Z") });
	onTestFinished(() => void vi.useRealTimers());
	return async (ms: number) => {
		await act(async () => {
			await vi.advanceTimersByTimeAsync(ms);
		});
		await settle();
	};
}

it("shows how many files are up while it moves, and counts the pause down each second", async () => {
	const pass = fakeClock();
	let posted = false;
	let polls = 0;
	const asked = daemon((url) => {
		if (url.includes("/move/stays")) return Response.json({ stays: [] });
		if (url.includes("/move/progress")) {
			if (!posted) return Response.json(NOTHING);
			// the first poll answers; every later one hangs, so the countdown moves only by the sheet's own clock
			if (polls++ > 0) return new Promise<Response>(() => {});
			return Response.json({ progress: PAUSED(Date.now() + 48_000), team: "devosurf", ended: null });
		}
		posted = true;
		return new Promise<Response>(() => {});
	});
	const host = mount(
		createElement(MoveToTeamDialog, { project: CHAMFER, teams: [DEVOSURF], onMoved: vi.fn(), onClose: vi.fn() }),
	);
	await settle();
	expect(host.querySelector("[data-move-progress]")).toBeNull();
	await act(async () => button(host, "Move to Devosurf").click());
	await pass(1_000);
	const progress = () => host.querySelector("[data-move-progress]")?.textContent;
	expect(progress()).toContain("240 of 1,922 files up");
	expect(progress()).toContain("Paused: this project took 120 saves in the last minute. Carrying on in 48 seconds.");
	await pass(3_000);
	expect(progress()).toContain("Carrying on in 45 seconds.");
	// a poll still out is never asked again over, so an older answer can't land after a newer one
	expect(asked.filter((line) => line.startsWith("GET /api/cloud/move/progress"))).toHaveLength(3);
});

it("picks up a move already under way when it opens, and hands its outcome to Home when it ends", async () => {
	const pass = fakeClock();
	let done = false;
	const asked = daemon((url) => {
		if (url.includes("/move/stays")) return Response.json({ stays: [] });
		if (done)
			return Response.json({
				progress: null,
				team: "devosurf",
				ended: { outcome: { root: CHAMFER.root, name: "chamfer", commit: "waiting" } },
			});
		return Response.json({ progress: PAUSED(Date.now() + 10_000), team: "devosurf", ended: null });
	});
	const onMoved = vi.fn();
	const onClose = vi.fn();
	const host = mount(
		createElement(MoveToTeamDialog, { project: CHAMFER, teams: [TIDEMARK, DEVOSURF], onMoved, onClose }),
	);
	await settle();
	expect(host.querySelector("[data-move-progress]")?.textContent).toContain("Moving to Devosurf.");
	expect(host.querySelector("[data-move-progress]")?.textContent).toContain("240 of 1,922 files up");
	expect(button(host, "Move to Tidemark").disabled).toBe(true);
	done = true;
	await pass(1_000);
	expect(onMoved).toHaveBeenCalledWith({ root: CHAMFER.root, name: "chamfer", commit: "waiting" }, DEVOSURF);
	expect(onClose).toHaveBeenCalled();
	expect(asked.some((line) => line.startsWith("POST"))).toBe(false);
});

it("says what stopped a move it picked up", async () => {
	const pass = fakeClock();
	let done = false;
	daemon((url) => {
		if (url.includes("/move/stays")) return Response.json({ stays: [] });
		if (done)
			return Response.json({
				progress: null,
				team: "devosurf",
				ended: {
					error: "chamfer didn't move: the connection to spool.page dropped. Nothing changed here; try again.",
				},
			});
		return Response.json({ progress: PAUSED(Date.now() + 10_000), team: "devosurf", ended: null });
	});
	const host = mount(
		createElement(MoveToTeamDialog, { project: CHAMFER, teams: [DEVOSURF], onMoved: vi.fn(), onClose: vi.fn() }),
	);
	await settle();
	done = true;
	await pass(1_000);
	expect(host.querySelector('[role="alert"]')?.textContent).toBe(
		"chamfer didn't move: the connection to spool.page dropped. Nothing changed here; try again.",
	);
	expect(host.querySelector("[data-move-progress]")).toBeNull();
	expect(button(host, "Move to Devosurf").disabled).toBe(false);
});

it("says what stopped a move", async () => {
	daemon((url) =>
		url.includes("/move/stays")
			? Response.json({ stays: [] })
			: Response.json(
					{ error: "chamfer didn't move: the team's design/ is at its 1 GB limit. Nothing changed here." },
					{ status: 409 },
				),
	);
	const host = mount(
		createElement(MoveToTeamDialog, {
			project: { root: "/Users/ana/chamfer", name: "chamfer" },
			teams: [DEVOSURF],
			onMoved: vi.fn(),
			onClose: vi.fn(),
		}),
	);
	await act(async () => button(host, "Move to Devosurf").click());
	await settle();
	expect(host.querySelector('[role="alert"]')?.textContent).toBe(
		"chamfer didn't move: the team's design/ is at its 1 GB limit. Nothing changed here.",
	);
	expect(host.querySelector("[data-move-progress]")).toBeNull();
});
