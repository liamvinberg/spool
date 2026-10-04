import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FINDINGS, type Finding, type Place } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import type { Artwork } from "shared/ui/demo/home-data";
import { Faces } from "shared/ui/explore/cloud/home/parts";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { Bar, type BarTab, CanvasReadouts } from "./bar";
import { type CanvasKind, CanvasView } from "./canvas";
import { Chooser } from "./chooser";
import type { Attached, Reading } from "./composer";
import { ASK, beatsFor, CHOOSER, GIT_LINK, nameFor, OWN, projectById, readPath, TEAM, TIDEMARK, TURN_END } from "./fixture";
import { type Card, HomeView, type Scope } from "./home";
import { EASE, ENTER, type Host, type Where, whereLabel, wherePath } from "./marks";
import { PlaceChip, PlacePopover } from "./place";

/**
 * start-prompt: a project starts as an ask, not a name.
 *
 * spool's frames are written by agents, so Home opens on one prompt, "What are we
 * making?", over the project grid. Enter makes a draft at once (agents write from the
 * first second, so it has to exist on disk), opens its tab with the agent already in
 * the turn, and the agent's first call names the project from the ask. Where it lives
 * is decided up front by the `in` control beside the prompt, or later from the place
 * chip on the bar. Bringing a folder in reads as an ask too: choose one, drop one or
 * type its path, and the prompt fills with what spool found there.
 */

export type Step = "home" | "asking" | "working" | "place" | "repo";

interface Tab {
	id: string;
	/** the name it has now; an agent tab's arrives with the turn */
	name: string;
	where: Where;
	view: "agent" | "empty" | "arriving" | "static";
	/** agent tabs: the ask, the name the agent will give it, and when Enter was pressed */
	ask?: string;
	agentName?: string;
	startedAt?: number;
	/** arriving tabs: what spool is fetching, and when it began */
	verb?: string;
	source?: string;
	total?: number;
	art?: Artwork;
	frames?: number;
	/** made in this walk, so Home grows a card for it */
	fresh?: boolean;
	here?: string[];
}

const placeOf = (place: Place): Where =>
	place.kind === "folder" ? { kind: "folder", root: place.path, branch: place.branch } : { kind: place.kind };

function staticTab(id: string): Tab {
	const project = projectById(id)!;
	return { id, name: project.name, where: placeOf(project.place), view: "static", art: project.art, frames: project.frames, ...(project.here ? { here: project.here } : {}) };
}

function agentTab(id: string, ask: string, where: Where, startedAt: number): Tab {
	const folder = where.kind === "folder" ? (where.root.split("/").pop() ?? "untitled") : null;
	return { id, name: folder ?? "untitled", where, view: "agent", ask, agentName: folder ?? nameFor(ask), startedAt, fresh: true };
}

interface Seed {
	tabs: Tab[];
	active: string | null;
	text: string;
	menu: boolean;
	attached: Attached | null;
	popover: boolean;
	highlight?: number;
}

function seed(step: Step, now: number): Seed {
	const tabs = [staticTab("tvarso"), staticTab("kaffe")];
	const base: Seed = { tabs, active: null, text: "", menu: false, attached: null, popover: false };
	switch (step) {
		case "home":
			return base;
		case "asking":
			return { ...base, text: ASK, menu: true, highlight: 1 };
		case "working":
			return { ...base, tabs: [...tabs, agentTab("new-1", ASK, { kind: "draft" }, now - 900)], active: "new-1" };
		case "place":
			return { ...base, tabs: [...tabs, agentTab("new-1", ASK, { kind: "draft" }, now - TURN_END - 400)], active: "new-1", popover: true };
		case "repo":
			return { ...base, attached: { reading: FINDINGS.repo!, settled: true } };
	}
}

export function StartPrompt({ step = "home", initialHost = "app" }: { step?: Step; initialHost?: Host }) {
	const first = useRef<Seed | null>(null);
	first.current ??= seed(step, Date.now());
	const start = first.current;

	const [host, setHost] = useState<Host>(initialHost);
	const [scope, setScope] = useState<Scope>("own");
	const [tabs, setTabs] = useState<Tab[]>(start.tabs);
	const [active, setActive] = useState<string | null>(start.active);
	const [text, setText] = useState(start.text);
	const [where, setWhere] = useState<Where>({ kind: "draft" });
	const [menu, setMenu] = useState(start.menu);
	const [attached, setAttached] = useState<Attached | null>(start.attached);
	const [popover, setPopover] = useState(start.popover);
	const [chooser, setChooser] = useState<"attach" | "place" | null>(null);
	const [toast, setToast] = useState<{ title: string; path: string } | null>(null);
	const [born, setBorn] = useState<string | null>(null);
	const [focusKey, setFocusKey] = useState(0);
	const [now, setNow] = useState(() => Date.now());
	const counter = useRef(1);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const later = useCallback((ms: number, run: () => void) => {
		timers.current.push(setTimeout(run, ms));
	}, []);
	useEffect(() => () => timers.current.forEach(clearTimeout), []);

	/* one clock for every turn and every fetch in flight */
	const live = tabs.some((tab) => (tab.view === "agent" && now - (tab.startedAt ?? 0) < TURN_END + 200) || tab.view === "arriving");
	useEffect(() => {
		if (!live) return;
		const id = setInterval(() => setNow(Date.now()), 80);
		return () => clearInterval(id);
	}, [live]);

	/* what each tab reads as at this instant */
	const shown = useMemo(
		() =>
			tabs.map((tab) => {
				if (tab.view === "agent") {
					const elapsed = now - (tab.startedAt ?? now);
					const beats = beatsFor(tab.agentName ?? "untitled").filter((beat) => !(beat.names && tab.where.kind === "folder"));
					const naming = beats.find((beat) => beat.names);
					const named = naming === undefined || elapsed >= naming.at + naming.runs;
					const ended = elapsed >= TURN_END;
					const painted = beats.filter((beat) => beat.frame && elapsed >= beat.at + beat.runs).length;
					return { tab, elapsed, beats, name: named ? (tab.agentName ?? tab.name) : tab.name, ended, painted, path: wherePath(tab.where, ended ? (tab.agentName ?? "untitled") : tab.name) };
				}
				if (tab.view === "arriving") {
					const got = Math.min(tab.total ?? 1, Math.floor((now - (tab.startedAt ?? now)) / 160));
					return { tab, elapsed: 0, beats: [], name: tab.name, ended: true, painted: got, path: wherePath(tab.where, tab.name) };
				}
				return { tab, elapsed: 0, beats: [], name: tab.name, ended: true, painted: tab.frames ?? 0, path: tab.where.kind === "folder" ? tab.where.root : wherePath(tab.where, tab.name) };
			}),
		[tabs, now],
	);

	/* a fetch that has every frame becomes a project like any other */
	useEffect(() => {
		const done = shown.filter((item) => item.tab.view === "arriving" && item.painted >= (item.tab.total ?? 0));
		if (done.length === 0) return;
		setTabs((list) => list.map((tab) => (done.some((item) => item.tab.id === tab.id) ? { ...tab, view: "static", frames: tab.total ?? 0 } : tab)));
	}, [shown]);

	const current = shown.find((item) => item.tab.id === active) ?? null;

	const focusPrompt = () => setFocusKey((key) => key + 1);
	const goHome = () => {
		setActive(null);
		setPopover(false);
		setToast(null);
		focusPrompt();
	};
	const open = (tab: Tab, birth = false) => {
		setTabs((list) => (list.some((item) => item.id === tab.id) ? list : [...list, tab]));
		setActive(tab.id);
		setMenu(false);
		setPopover(false);
		if (birth) setBorn(tab.id);
	};
	const nextId = () => `new-${++counter.current}`;

	/* ── the prompt ── */

	const settle = (reading: Reading) => {
		setAttached({ reading, settled: false });
		setText("");
		later(520, () => setAttached((value) => (value?.reading === reading ? { reading, settled: true } : value)));
		focusPrompt();
	};

	const read = (input: string) => {
		if (GIT_LINK.test(input)) {
			settle(FINDINGS.clone!);
			return;
		}
		const found = readPath(input);
		if (found.kind === "known") {
			const project = projectById(found.id)!;
			settle({ kind: "known", id: found.id, name: project.name, path: found.path });
			return;
		}
		settle(found);
	};

	const bring = () => {
		setMenu(false);
		if (host === "app") setChooser("attach");
		else {
			setAttached(null);
			setText("~/");
			focusPrompt();
		}
	};

	const dropped = (name: string) => {
		if (host === "web") {
			setAttached({ reading: { kind: "nameless", name }, settled: true });
			setText("~/");
			focusPrompt();
			return;
		}
		const row = CHOOSER.flatMap((group) => group.rows).find((item) => item.name === name);
		read(row?.path ?? `~/Desktop/${name}`);
	};

	const startFrom = (empty: boolean) => {
		const ask = text.trim();
		const id = nextId();
		const t = Date.now();
		setNow(t);
		if (attached === null) {
			if (ask === "" || empty) {
				open({ id, name: "untitled", where, view: "empty", fresh: true }, true);
			} else {
				open(agentTab(id, ask, where, t), true);
			}
			setText("");
			return;
		}
		const reading = attached.reading;
		setAttached(null);
		setText("");
		switch (reading.kind) {
			case "repo":
			case "plain": {
				const folder: Where = { kind: "folder", root: reading.path, ...(reading.kind === "repo" ? { branch: reading.branch } : {}) };
				if (ask === "" || empty) open({ id, name: reading.name, where: folder, view: "empty", fresh: true }, true);
				else open(agentTab(id, ask, folder, t), true);
				return;
			}
			case "project":
				open({ id: "harbor", name: reading.name, where: { kind: "folder", root: reading.path, branch: reading.branch }, view: "static", art: reading.art, frames: reading.frames, fresh: true }, true);
				return;
			case "inside":
				open(tabs.find((tab) => tab.id === "tvarso") ?? staticTab("tvarso"));
				return;
			case "known":
				open(tabs.find((tab) => tab.id === reading.id) ?? staticTab(reading.id));
				return;
			case "clone":
				open({ id: "orbit", name: reading.name, where: { kind: "folder", root: reading.into, branch: "main" }, view: "arriving", verb: "cloning", source: reading.url, total: reading.frames, art: reading.art, startedAt: t, fresh: true }, true);
				return;
			case "fetch":
				getTeamProject("brand-refresh");
				return;
			case "nameless":
				return;
		}
	};

	const getTeamProject = (id: string) => {
		const finding = FINDINGS.fetch as Extract<Finding, { kind: "fetch" }>;
		const t = Date.now();
		setNow(t);
		open({ id, name: finding.name, where: { kind: "team" }, view: "arriving", verb: "getting", source: `from ${finding.team}`, total: finding.frames, art: finding.art, startedAt: t, fresh: false });
	};

	/* ── Home's cards ── */

	const [fetched, setFetched] = useState<string[]>([]);
	useEffect(() => {
		const ids = tabs.filter((tab) => tab.view === "static" && tab.where.kind === "team").map((tab) => tab.id);
		if (ids.some((id) => !fetched.includes(id))) setFetched((list) => [...new Set([...list, ...ids])]);
	}, [tabs, fetched]);

	const cards: Card[] = useMemo(() => {
		const fresh: Card[] = shown
			.filter((item) => item.tab.fresh)
			.map(({ tab, name, painted, ended }) => ({
				id: tab.id,
				name,
				art: tab.art ?? "blank",
				frames: tab.view === "static" ? (tab.frames ?? 0) : painted,
				edited: "now",
				place: placeFor(tab.where, name),
				...(tab.view === "agent" ? { cover: painted > 0 ? ("ebb" as const) : ("empty" as const), working: !ended } : tab.view === "empty" ? { cover: "empty" as const } : {}),
				...(tab.here ? { here: tab.here } : {}),
			}))
			.reverse();
		const mine = fresh.filter((card) => (scope === "own" ? card.place.kind !== "team" : card.place.kind === "team"));
		const base = (scope === "own" ? OWN : TEAM).map((project) => (fetched.includes(project.id) ? { ...project, onMac: true } : project));
		return [...mine, ...base];
	}, [shown, scope, fetched]);

	/* ── moving a project ── */

	const move = (id: string, to: Where) => {
		const item = shown.find((entry) => entry.tab.id === id);
		if (item === undefined) return;
		const from = item.path;
		setTabs((list) => list.map((tab) => (tab.id === id ? { ...tab, where: to } : tab)));
		setPopover(false);
		setChooser(null);
		const target = wherePath(to, item.tab.agentName ?? item.name);
		setToast(
			to.kind === "team"
				? { title: `${item.name} is a ${TIDEMARK.name} project now. Jonas, Mira and Sam have its files.`, path: `${from} → ${target}` }
				: { title: `${item.name} lives in ${to.kind === "folder" ? to.root : "Drafts"} now.`, path: `${from} → ${target}` },
		);
		later(5200, () => setToast(null));
		if (to.kind === "team") later(1800, () => setTabs((list) => list.map((tab) => (tab.id === id ? { ...tab, here: ["jonas"] } : tab))));
	};

	/* ── keys ── */

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o" && active === null && chooser === null) {
				event.preventDefault();
				bring();
				return;
			}
			if (active === null && !typing && chooser === null && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1) {
				focusPrompt();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	/* ── the window ── */

	const barTabs: BarTab[] = shown.map((item) => ({ id: item.tab.id, name: item.name, working: item.tab.view === "agent" && !item.ended && item.tab.id !== active }));

	const canvasView = (item: (typeof shown)[number]): CanvasKind => {
		const tab = item.tab;
		if (tab.view === "agent") return { kind: "agent", ask: tab.ask ?? "", beats: item.beats, elapsed: item.elapsed, ended: item.ended, where: whereLabel(tab.where) };
		if (tab.view === "empty") return { kind: "empty", name: item.name, root: wherePath(tab.where, item.name) };
		if (tab.view === "arriving") return { kind: "arriving", verb: tab.verb ?? "getting", source: tab.source ?? "", total: tab.total ?? 0, got: item.painted, art: tab.art ?? "blank" };
		return { kind: "static", art: tab.art ?? "blank", frames: tab.frames ?? 0 };
	};

	const app = (
		<MotionConfig reducedMotion="user" transition={ENTER}>
			<LayoutGroup>
				<div className="relative flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
					<Bar
						tabs={barTabs}
						active={active}
						onHome={goHome}
						onFocus={(id) => {
							setActive(id);
							setPopover(false);
						}}
						onClose={(id) => {
							setTabs((list) => list.filter((tab) => tab.id !== id));
							if (active === id) goHome();
						}}
						onPlus={goHome}
						right={
							current === null ? undefined : (
								<>
									<AnimatePresence>
										{current.tab.here && current.tab.here.length > 0 && (
											<motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-[8px]">
												<Faces ids={current.tab.here} size={22} />
											</motion.span>
										)}
									</AnimatePresence>
									<PlaceChip where={current.tab.where} path={current.path} open={popover} onToggle={() => setPopover(!popover)} />
									<CanvasReadouts zoom={current.tab.view === "agent" ? "42%" : "64%"} />
								</>
							)
						}
					/>
					<main className="relative min-h-0 flex-1">
						{current === null ? (
							<HomeView
								host={host}
								scope={scope}
								onScope={(next) => {
									setScope(next);
									setWhere({ kind: next === "own" ? "draft" : "team" });
								}}
								cards={cards}
								born={born}
								onOpen={(card) => {
									const tab = tabs.find((item) => item.id === card.id);
									if (tab) open(tab);
									else if (card.place.kind === "team" && card.onMac === false) getTeamProject(card.id);
									else open(staticTab(card.id));
								}}
								onDropFolder={dropped}
								composer={{
									host,
									text,
									onText: setText,
									where,
									onWhere: setWhere,
									menu,
									onMenu: setMenu,
									attached,
									onDetach: () => {
										setAttached(null);
										setText("");
										focusPrompt();
									},
									onStart: startFrom,
									onBring: bring,
									onRead: read,
									focusKey,
									...(start.highlight !== undefined ? { initialHighlight: start.highlight } : {}),
								}}
							/>
						) : (
							<motion.div key={current.tab.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: EASE }} className="h-full">
								<CanvasView view={canvasView(current)} />
							</motion.div>
						)}
					</main>
					<AnimatePresence>
						{popover && current !== null && (
							<PlacePopover
								host={host}
								name={current.name}
								where={current.tab.where}
								initialPick={step === "place" && current.tab.where.kind === "draft" ? "team" : null}
								onMove={(to) => move(current.tab.id, to)}
								onChoose={() => setChooser("place")}
								onClose={() => setPopover(false)}
							/>
						)}
					</AnimatePresence>
					<AnimatePresence>
						{chooser !== null && (
							<Chooser
								prompt={chooser === "attach" ? "Choose a folder for spool to read." : `Choose the repo ${current?.name ?? "it"} moves into.`}
								onCancel={() => setChooser(null)}
								onPick={(path) => {
									const mode = chooser;
									setChooser(null);
									if (mode === "attach") read(path);
									else if (current) move(current.tab.id, { kind: "folder", root: path });
								}}
							/>
						)}
					</AnimatePresence>
					<AnimatePresence>
						{toast !== null && (
							<motion.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 6, transition: { duration: 0.14 } }}
								transition={ENTER}
								className="absolute bottom-[88px] left-[calc(50%-110px)] z-40 flex max-w-[520px] -translate-x-1/2 flex-col gap-[4px] rounded-[9px] border border-border-raised bg-raised px-[16px] py-[12px]"
							>
								<span className="type-label">{toast.title}</span>
								<span className="text-muted type-detail">{toast.path}</span>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</LayoutGroup>
		</MotionConfig>
	);

	return (
		<div className="flex h-full w-full flex-col bg-bg">
			<div className="min-h-0 flex-1">
				{host === "web" ? (
					<PlayedTab title="spool" url="localhost:7767" sibling="GitHub">
						{app}
					</PlayedTab>
				) : (
					app
				)}
			</div>
			<HostStrip host={host} onHost={setHost} canvas={current !== null} />
		</div>
	);
}

function placeFor(where: Where, name: string): Place {
	if (where.kind === "folder") return { kind: "folder", label: where.root, path: `${where.root}/design`, ...(where.branch ? { branch: where.branch } : {}) };
	return { kind: where.kind, label: whereLabel(where), path: wherePath(where, name) };
}

/**
 * Outside the product on purpose: which host the walk is in, and the keys this take
 * claims. Flip it on any step; the browser loses the folder dialog and a dropped
 * folder's path, and nothing else.
 */
function HostStrip({ host, onHost, canvas }: { host: Host; onHost: (host: Host) => void; canvas: boolean }) {
	return (
		<div className="flex h-8 shrink-0 items-center gap-[12px] border-border border-t bg-surface/40 px-[20px]">
			<span className="font-mono text-2xs text-muted/50 leading-3">host</span>
			{(["app", "web"] as const).map((id) => (
				<button
					key={id}
					type="button"
					onClick={() => onHost(id)}
					className={cn("rounded px-[6px] py-[2px] font-mono text-2xs leading-3", host === id ? "bg-raised text-text" : "text-muted/70 hover:text-text")}
				>
					{id === "app" ? "mac app" : "browser"}
				</button>
			))}
			<span className="ml-auto font-mono text-2xs text-muted/50 leading-3">
				{canvas ? "home or + returns to the prompt · the place chip moves it" : "type anywhere · ⏎ start · ⌘⏎ start empty · ⌘O bring a folder · esc clears"}
			</span>
		</div>
	);
}

