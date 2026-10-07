import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import type { PlaceKind, Project } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { SpoolShell } from "shared/ui/spool/shell";
import { CLONE, HARBOR, OWN, REPO, TEAM_PROJECTS } from "./fixture";
import { type Filter, type Scope, StartHome } from "./home";
import { NewSheet } from "./new-sheet";
import { OpenSheet, type Outcome } from "./open-sheet";
import { BIRTH, EASE, type Host } from "./parts";
import { ProjectView } from "./project-view";

/**
 * start-sheet: ask first, the smallest diff from what ships.
 *
 * Home stays the cover grid. New project… asks a name and a place in one sheet
 * and Create opens the empty project at once, so the folder agents write into
 * exists from the first second. Open… is one door for anything that already
 * exists: a folder, a path, a git link, or a teammate's project not on this Mac.
 *
 * Every state frame is this walk started at one step, still clickable from there.
 * The `app | browser` switch in the bar is the proposal's own control: the same
 * walk inside the Mac app and inside a browser tab on localhost.
 */

export type StartAt = "home" | "new" | "new-team" | "open" | "add" | "clone";

type SheetState = { kind: "new"; place: PlaceKind } | { kind: "open"; initial: string } | null;

const OPEN_AT: Partial<Record<StartAt, string>> = { open: HARBOR.path, add: REPO.path, clone: CLONE.url };

export function StartSheetScreen({ start = "home" }: { start?: StartAt }) {
	const [host, setHost] = useState<Host>("app");
	const [scope, setScope] = useState<Scope>(start === "new-team" ? "tidemark" : "own");
	const [filter, setFilter] = useState<Filter>("all");
	const [own, setOwn] = useState<Project[]>(OWN);
	const [team, setTeam] = useState<Project[]>(TEAM_PROJECTS);
	const [tabs, setTabs] = useState<string[]>(start === "new-team" ? ["tidemark-app", "kaffe"] : ["tvarso", "kaffe"]);
	const [view, setView] = useState<string | null>(null);
	const [born, setBorn] = useState<string | null>(null);
	const [birth, setBirth] = useState<string | null>(null);
	const [fetching, setFetching] = useState<Record<string, number>>({});
	const [sheet, setSheet] = useState<SheetState>(
		start === "new" ? { kind: "new", place: "draft" } : start === "new-team" ? { kind: "new", place: "team" } : OPEN_AT[start] ? { kind: "open", initial: OPEN_AT[start]! } : null,
	);

	const all = [...own, ...team];
	const byId = (id: string) => all.find((project) => project.id === id);
	const current = view ? byId(view) : undefined;

	const openNew = () => {
		setView(null);
		setSheet({ kind: "new", place: scope === "tidemark" ? "team" : "draft" });
	};
	const openDoor = (initial = "") => {
		setView(null);
		setSheet({ kind: "open", initial });
	};
	const show = (project: Project, grow: boolean) => {
		setTabs((list) => (list.includes(project.id) ? list : [...list, project.id]));
		setSheet(null);
		setBirth(grow ? BIRTH : null);
		setView(project.id);
	};
	const arrive = (project: Project) => {
		const isTeam = project.place.kind === "team";
		setScope(isTeam ? "tidemark" : "own");
		if (!isTeam && filter !== "all" && filter !== project.place.kind) setFilter("all");
		setBorn(project.id);
	};

	useEffect(() => {
		if (sheet !== null || view !== null) return;
		const key = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
			if (event.key === "n" || event.key === "N") {
				event.preventDefault();
				openNew();
			} else if (event.key === "o" || event.key === "O") {
				event.preventDefault();
				openDoor();
			}
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	});

	const done = (outcome: Outcome) => {
		if (outcome.kind === "register") {
			const project = outcome.project;
			const existing = own.find((item) => item.id === project.id);
			if (!existing) setOwn((list) => [project, ...list]);
			arrive(existing ?? project);
			show(existing ?? project, true);
		} else if (outcome.kind === "focus") {
			show(outcome.project, true);
		} else {
			const fetched = team.find((item) => item.id === outcome.id);
			if (!fetched) return;
			const now = { ...fetched, onMac: true, edited: "fetched just now" };
			setTeam((list) => list.map((item) => (item.id === outcome.id ? now : item)));
			arrive(now);
			show(now, sheet !== null);
		}
	};

	const get = (project: Project) => {
		if (fetching[project.id] !== undefined) return;
		let value = 0;
		const tick = setInterval(() => {
			value = Math.min(1, value + 0.1 + Math.random() * 0.08);
			setFetching((map) => ({ ...map, [project.id]: value }));
			if (value >= 1) {
				clearInterval(tick);
				setTimeout(() => {
					setFetching((map) => {
						const { [project.id]: _, ...rest } = map;
						return rest;
					});
					done({ kind: "fetched", id: project.id });
				}, 240);
			}
		}, 110);
	};

	const accessory = (
		<div className="flex h-[28px] items-center rounded-[7px] border border-border-raised p-[2px]" role="radiogroup" aria-label="Where spool runs">
			{(["app", "web"] as const).map((each) => (
				<button
					key={each}
					type="button"
					role="radio"
					aria-checked={host === each}
					onClick={() => setHost(each)}
					className={cn("relative h-[22px] rounded-[5px] px-[9px] type-detail", host === each ? "text-text" : "text-muted hover:text-text")}
				>
					{host === each && <motion.span layoutId="start-sheet-host" className="absolute inset-0 rounded-[5px] bg-raised" transition={{ duration: 0.18, ease: EASE }} />}
					<span className="relative">{each === "app" ? "mac app" : "browser"}</span>
				</button>
			))}
		</div>
	);

	const tabNames = tabs.map((id) => byId(id)?.name ?? id);
	const idOf = (name: string) => all.find((project) => project.name === name)?.id;

	const body = (
		<SpoolShell
			tabs={tabNames}
			activeTab={current?.name}
			headerAccessory={accessory}
			onHome={() => setView(null)}
			onFocus={(name) => {
				const id = idOf(name);
				if (id) {
					setSheet(null);
					setBirth(null);
					setView(id);
				}
			}}
			onClose={(name) => {
				const id = idOf(name);
				setTabs((list) => list.filter((item) => item !== id));
				if (id === view) setView(null);
			}}
			onPick={openNew}
		>
			{current ? (
				<ProjectView key={current.id} project={current} birth={birth} />
			) : (
				<div className="relative h-full">
					<StartHome
						scope={scope}
						filter={filter}
						own={own}
						team={team}
						born={born}
						fetching={fetching}
						keys={sheet === null}
						onScope={(next) => {
							setScope(next);
							setBorn(null);
						}}
						onFilter={(next) => {
							setFilter(next);
							setBorn(null);
						}}
						onNew={openNew}
						onOpen={() => openDoor()}
						onProject={(project) => show(project, false)}
						onGet={get}
					/>
					<AnimatePresence>
						{sheet?.kind === "new" && (
							<NewSheet
								key="new"
								host={host}
								initialPlace={sheet.place}
								own={own}
								team={team}
								onClose={() => setSheet(null)}
								onOpenInstead={(path) => setSheet({ kind: "open", initial: path })}
								onCreate={({ name, place }) => {
									const project: Project = {
										id: `new-${place.kind}-${name}`,
										name,
										art: "blank",
										frames: 0,
										edited: place.kind === "team" ? "you · just now" : "just now",
										place,
										...(place.kind === "team" ? { onMac: true, here: [] } : {}),
									};
									if (place.kind === "team") setTeam((list) => [project, ...list.filter((item) => item.id !== project.id)]);
									else setOwn((list) => [project, ...list.filter((item) => item.id !== project.id)]);
									arrive(project);
									show(project, true);
								}}
							/>
						)}
						{sheet?.kind === "open" && (
							<OpenSheet key={`open:${sheet.initial}`} host={host} scope={scope} own={own} team={team} initial={sheet.initial} onDone={done} onClose={() => setSheet(null)} />
						)}
					</AnimatePresence>
				</div>
			)}
		</SpoolShell>
	);

	return (
		<MotionConfig reducedMotion="user">
			<Frame host={host}>{body}</Frame>
		</MotionConfig>
	);
}

/**
 * The browser around spool when it runs as a page on localhost. Drawn here rather
 * than with PlayedTab so switching hosts keeps the walk where it is.
 */
function Frame({ host, children }: { host: Host; children: ReactNode }) {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-[#17171A]">
			{host === "web" && <BrowserBar />}
			<div className="relative min-h-0 flex-1 [transform:translateZ(0)]">{children}</div>
		</div>
	);
}

function BrowserBar() {
	return (
		<div className="shrink-0 font-sans antialiased">
			<div className="flex h-[38px] items-end gap-1 px-2">
				<BrowserTab label="tidemark-api · GitHub" />
				<BrowserTab label="spool" active />
				<span className="mb-[9px] ml-1.5 text-[#6E6E73] type-title">+</span>
			</div>
			<div className="flex h-10 items-center gap-2.5 border-[#2A2A2E] border-b bg-[#202024] px-3">
				<span className="h-[10px] w-[10px] rounded-full border border-[#4E4E54]" />
				<span className="ml-1 flex h-[26px] min-w-0 flex-1 items-center gap-2 rounded-md bg-[#161619] px-3">
					<span className="truncate text-[#9A9AA0] type-value">localhost:7766</span>
				</span>
			</div>
		</div>
	);
}

function BrowserTab({ label, active = false }: { label: string; active?: boolean }) {
	return (
		<span className={cn("flex h-[30px] items-center gap-2 rounded-t-md px-3", active ? "max-w-[280px] bg-[#202024]" : "max-w-[220px] opacity-60")}>
			<span className="h-2 w-[3px] shrink-0 bg-thread" />
			<span className="truncate text-[#C8C8CC] type-label">{label}</span>
		</span>
	);
}
