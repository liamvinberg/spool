import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Place } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { Cursor, Faces } from "shared/ui/explore/cloud/home/parts";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { ChevronIcon, ThreadIcon } from "shared/ui/spool/icons";
import { Bar } from "./bar";
import { CanvasView } from "./canvas";
import {
	BRAND_FRAMES,
	designPath,
	draftPlace,
	droppedNamed,
	HARBOR,
	initialItems,
	type Item,
	nextUntitled,
	type Section,
	type Spot,
	TEAM,
	teamPlace,
} from "./fixture";
import { type Ghost, HomeView, type Host } from "./home";
import { EASE, PlaceGlyph, placeName, SyncedIcon } from "./marks";
import { MovePopover } from "./move";
import { OpenSheet } from "./open";

/**
 * start-drafts: a project exists the moment you ask for one, and where it lives is
 * decided later. ⌘N makes `untitled` in Drafts (or in the team Home is showing),
 * its card is born in the grid and grows into its tab, and the tab's name is a
 * field. The place chip in the bar moves it into a folder or a team when it has
 * earned one. Existing work arrives by Open… or by dropping a folder on the window,
 * and lands as a card carrying what spool read in it.
 */

export type Step = "home" | "born" | "move" | "moved" | "drop" | "drop-web" | "fetch";

interface Toast {
	title: string;
	files: string;
}

const OTHERS = TEAM.members.filter((id) => id !== "ada");

function seed(step: Step): {
	items: Item[];
	section: Section;
	tabs: string[];
	active: string | null;
	naming: string | null;
	move: boolean;
	ghost: Ghost | null;
	fetch: { id: string; n: number } | null;
	toast: Toast | null;
} {
	const items = initialItems();
	const base = { items, section: "recents" as Section, tabs: ["tvarso", "kaffe"], active: null, naming: null, move: false, ghost: null, fetch: null, toast: null };
	const fresh = (name: string, place: Place): Item => ({ id: name, name, art: null, frames: 0, edited: "now", place, onMac: true, here: [] });
	switch (step) {
		case "home":
			return base;
		case "born":
			return { ...base, items: [fresh("untitled", draftPlace("untitled")), ...items], tabs: [...base.tabs, "untitled"], active: "untitled", naming: "untitled" };
		case "move":
			return { ...base, items: [fresh("receipts", draftPlace("receipts")), ...items], tabs: [...base.tabs, "receipts"], active: "receipts", move: true };
		case "moved":
			return {
				...base,
				items: [{ ...fresh("receipts", teamPlace("receipts")), here: ["jonas"] }, ...items],
				tabs: [...base.tabs, "receipts"],
				active: "receipts",
				toast: { title: `receipts is a ${TEAM.name} project now. jonas, mira and sam have its files.`, files: "~/spool/receipts → ~/spool/tidemark/receipts" },
			};
		case "drop":
			return { ...base, ghost: { spot: HARBOR, dropped: false, still: true } };
		case "drop-web":
			return { ...base, ghost: { spot: droppedNamed("moodboard"), dropped: true, foundIn: ["~/code", "~/Desktop"] } };
		case "fetch":
			return { ...base, section: "tidemark", tabs: [...base.tabs, "brand-refresh"], active: "brand-refresh", fetch: { id: "brand-refresh", n: 3 } };
	}
}

export function StartDrafts({ step = "home", host = "app" }: { step?: Step; host?: Host }) {
	const start = useRef(seed(step)).current;
	const reduced = useReducedMotion() ?? false;
	const [items, setItems] = useState<Item[]>(start.items);
	const [section, setSection] = useState<Section>(start.section);
	const [tabs, setTabs] = useState<string[]>(start.tabs);
	const [active, setActive] = useState<string | null>(start.active);
	const [naming, setNaming] = useState<string | null>(start.naming);
	const [born, setBorn] = useState<string | null>(null);
	const [birthing, setBirthing] = useState<string | null>(null);
	const [landed, setLanded] = useState<string | null>(null);
	const [ghost, setGhost] = useState<Ghost | null>(start.ghost);
	const [sheet, setSheet] = useState(false);
	const [move, setMove] = useState(start.move);
	const [moving, setMoving] = useState<string | null>(null);
	const [toast, setToast] = useState<Toast | null>(start.toast);
	const [fetch, setFetch] = useState(start.fetch);
	const counter = useRef(0);
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const later = useCallback((ms: number, run: () => void) => {
		timers.current.push(setTimeout(run, ms));
	}, []);
	useEffect(() => () => timers.current.forEach(clearTimeout), []);

	const patch = useCallback((id: string, change: Partial<Item>) => setItems((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item))), []);
	const focus = useCallback((id: string) => {
		setTabs((list) => (list.includes(id) ? list : [...list, id]));
		setActive(id);
	}, []);

	/* a project is born: a card in the grid, then the card grows into its tab */
	const birth = useCallback(
		(item: Item, name: boolean) => {
			setItems((list) => [item, ...list]);
			setMove(false);
			setSheet(false);
			if (active !== null || reduced) {
				setBorn(null);
				focus(item.id);
				if (name) setNaming(item.id);
				return;
			}
			if (section !== "recents" && section !== (item.place.kind === "team" ? "tidemark" : item.place.kind === "draft" ? "drafts" : "folders")) setSection("recents");
			setBirthing(item.id);
			later(320, () => {
				setBirthing(null);
				setBorn(item.id);
				focus(item.id);
				if (name) setNaming(item.id);
			});
		},
		[active, reduced, section, focus, later],
	);

	const newProject = useCallback(() => {
		counter.current += 1;
		const name = nextUntitled(items);
		const team = section === "tidemark";
		birth({ id: `new-${counter.current}`, name, art: null, frames: 0, edited: "now", place: team ? teamPlace(name) : draftPlace(name), onMac: true, here: [] }, true);
	}, [items, section, birth]);

	const land = useCallback(
		(item: Item) => {
			setItems((list) => [item, ...list.filter((other) => other.id !== item.id)]);
			if (section !== "recents" && section !== "folders") setSection("recents");
			setLanded(item.id);
			later(2400, () => setLanded(null));
			later(9000, () => patch(item.id, { reading: undefined }));
		},
		[section, later, patch],
	);

	/* a folder handed over, by Open… or by a drop: what spool read decides what happens */
	const take = useCallback(
		(spot: Spot) => {
			setSheet(false);
			setGhost(null);
			const finding = spot.finding;
			switch (finding.kind) {
				case "known":
					setActive(null);
					focus(finding.id);
					return;
				case "inside":
					setActive(null);
					setSection("recents");
					setLanded("tvarso");
					patch("tvarso", { reading: "walked up from src/routes" });
					later(2400, () => setLanded(null));
					later(9000, () => patch("tvarso", { reading: undefined }));
					return;
				case "project":
					setActive(null);
					land({ id: spot.key, name: finding.name, art: finding.art, frames: finding.frames, edited: "now", place: { kind: "folder", label: finding.path, path: finding.path, ...(finding.branch ? { branch: finding.branch } : {}) }, onMac: true, here: [], reading: "design/ found · added" });
					return;
				case "clone":
					setActive(null);
					land({ id: spot.key, name: finding.name, art: finding.art, frames: finding.frames, edited: "now", place: { kind: "folder", label: finding.into, path: finding.into, branch: "main" }, onMac: true, here: [], reading: "cloning…", arriving: true });
					later(1700, () => patch(spot.key, { arriving: false, reading: `cloned · ${finding.frames} frames` }));
					return;
				case "repo":
				case "plain": {
					const path = finding.path;
					birth({ id: spot.key, name: finding.name, art: null, frames: 0, edited: "now", place: { kind: "folder", label: path, path, ...(finding.kind === "repo" ? { branch: finding.branch } : {}) }, onMac: true, here: [], reading: "design/ started" }, false);
					return;
				}
				case "fetch":
					return;
			}
		},
		[focus, patch, land, birth, later],
	);

	const open = useCallback(
		(id: string) => {
			const item = items.find((candidate) => candidate.id === id);
			if (item === undefined) return;
			setBorn(null);
			focus(id);
			if (!item.onMac) setFetch({ id, n: 0 });
		},
		[items, focus],
	);

	/* a teammate's project arrives frame by frame */
	useEffect(() => {
		if (fetch === null) return;
		if (fetch.n >= BRAND_FRAMES.length) {
			patch(fetch.id, { onMac: true, edited: "sam · 3 days ago" });
			const done = setTimeout(() => setFetch(null), 2600);
			return () => clearTimeout(done);
		}
		const tick = setTimeout(() => setFetch({ ...fetch, n: fetch.n + 1 }), fetch.n === 0 ? 420 : 240);
		return () => clearTimeout(tick);
	}, [fetch, patch]);

	const rename = (id: string, name: string) => {
		const item = items.find((candidate) => candidate.id === id);
		if (item === undefined || item.name === name) return;
		const place = item.place.kind === "draft" ? draftPlace(name) : item.place.kind === "team" ? teamPlace(name) : item.place;
		patch(id, { name, place });
	};

	const moveTo = (place: Place) => {
		const item = items.find((candidate) => candidate.id === active);
		if (item === undefined) return;
		const from = designPath(item);
		setMove(false);
		setMoving(item.id);
		patch(item.id, { place });
		const to = designPath({ name: item.name, place });
		later(reduced ? 0 : 700, () => {
			setMoving(null);
			setToast(
				place.kind === "team"
					? { title: `${item.name} is a ${TEAM.name} project now. jonas, mira and sam have its files.`, files: `${from} → ${to}` }
					: { title: `${item.name} moved into ${placeName(place)}.`, files: `${from} → ${to}` },
			);
			if (place.kind === "team") later(1500, () => patch(item.id, { here: ["jonas"] }));
		});
	};

	useEffect(() => {
		if (toast === null) return;
		const gone = setTimeout(() => setToast(null), 6000);
		return () => clearTimeout(gone);
	}, [toast]);

	/* the keys: ⌘N or N makes a project, ⌘O or O opens one, Esc lets go of a drag */
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
			if (typing || move || sheet || naming !== null) return;
			const k = event.key.toLowerCase();
			const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
			const mod = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
			if (k === "n" && (mod || plain)) {
				event.preventDefault();
				newProject();
			} else if (k === "o" && (mod || plain)) {
				event.preventDefault();
				setSheet(true);
			} else if (event.key === "Escape" && ghost !== null) {
				setGhost(null);
			}
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, [move, sheet, naming, ghost, newProject]);

	/* a real folder dragged in from Finder: the frame can read its name, as a browser can */
	const dragDepth = useRef(0);
	const onDragEnter = (event: React.DragEvent) => {
		if (!event.dataTransfer.types.includes("Files")) return;
		event.preventDefault();
		dragDepth.current += 1;
		setActive(null);
		if (ghost === null || ghost.dropped) setGhost({ spot: host === "app" ? HARBOR : { ...HARBOR, finding: { kind: "plain", path: "", name: "" } }, dropped: false, blind: host === "web" });
	};
	const onDragLeave = () => {
		dragDepth.current -= 1;
		if (dragDepth.current <= 0 && ghost !== null && !ghost.dropped) setGhost(null);
	};
	const onDrop = (event: React.DragEvent) => {
		event.preventDefault();
		dragDepth.current = 0;
		const entry = event.dataTransfer.items[0]?.webkitGetAsEntry?.();
		take(entry?.name ? droppedNamed(entry.name) : HARBOR);
	};

	const item = items.find((candidate) => candidate.id === active) ?? null;
	const right = item ? <ProjectSide item={item} host={host} fetching={fetch?.id === item.id && fetch.n < BRAND_FRAMES.length} moving={moving === item.id} move={move} onMoveOpen={() => setMove((value) => !value)} onMove={moveTo} onMoveClose={() => setMove(false)} /> : null;

	const app = (
		<MotionConfig reducedMotion="user" transition={{ duration: 0.24, ease: EASE }}>
			<LayoutGroup>
				<div
					className="relative flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]"
					onDragEnter={onDragEnter}
					onDragOver={(event) => event.preventDefault()}
					onDragLeave={onDragLeave}
					onDrop={onDrop}
				>
					<Bar
						tabs={tabs.flatMap((id) => {
							const tab = items.find((candidate) => candidate.id === id);
							return tab ? [{ id, name: tab.name }] : [];
						})}
						active={active}
						naming={naming}
						born={born}
						right={right}
						onHome={() => {
							setActive(null);
							setMove(false);
						}}
						onFocus={(id) => {
							setBorn(null);
							setActive(id);
						}}
						onClose={(id) => {
							setTabs((list) => list.filter((other) => other !== id));
							if (active === id) setActive(null);
							if (naming === id) setNaming(null);
						}}
						onPlus={newProject}
						onRename={rename}
						onNamed={() => setNaming(null)}
						onStartNaming={(id) => setNaming(id)}
					/>
					<main className="relative min-h-0 flex-1">
						{item === null ? (
							<HomeView
								host={host}
								items={items}
								section={section}
								birthing={birthing}
								landed={landed}
								ghost={ghost}
								onSection={(next) => {
									setSection(next);
									setGhost(null);
								}}
								onNew={newProject}
								onOpenSheet={() => setSheet(true)}
								onOpenItem={open}
								onDrop={() => ghost && take(ghost.spot)}
							/>
						) : (
							<CanvasView key={item.id} item={item} fetched={fetch?.id === item.id ? fetch.n : null} onCopy={(path) => void navigator.clipboard?.writeText(path).catch(() => {})} />
						)}
						{item !== null && item.here.includes("jonas") && <Cursor id="jonas" x={980} y={190} />}
						<AnimatePresence>{sheet && <OpenSheet key="sheet" host={host} onPick={take} onClose={() => setSheet(false)} />}</AnimatePresence>
						<AnimatePresence>{toast && <ToastNote key={toast.title} toast={toast} />}</AnimatePresence>
					</main>
				</div>
			</LayoutGroup>
		</MotionConfig>
	);
	if (host === "web") {
		return (
			<PlayedTab title="spool" url="localhost:7766" sibling="Claude">
				{app}
			</PlayedTab>
		);
	}
	return app;
}

/**
 * The right of the bar while a project is focused: the place chip, which is also
 * the way to Move to…, and what that place means right now: who is in a team
 * project and that it is synced, or the branch a folder project sits on.
 */
function ProjectSide({
	item,
	host,
	fetching,
	moving,
	move,
	onMoveOpen,
	onMove,
	onMoveClose,
}: {
	item: Item;
	host: Host;
	fetching: boolean;
	moving: boolean;
	move: boolean;
	onMoveOpen: () => void;
	onMove: (place: Place) => void;
	onMoveClose: () => void;
}) {
	const team = item.place.kind === "team";
	const canMove = !team;
	return (
		<>
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.span
					key={moving ? "moving" : fetching ? "fetching" : `${item.place.kind}-${team ? item.here.join() : ""}`}
					className="flex items-center gap-[8px] text-muted type-detail"
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -4 }}
					transition={{ duration: 0.18, ease: EASE }}
				>
					{moving || fetching ? (
						<>
							<span className="h-[6px] w-[6px] animate-pulse rounded-full bg-muted" />
							{moving ? "moving…" : "fetching…"}
						</>
					) : team ? (
						<>
							<Faces ids={item.here.length > 0 ? item.here : OTHERS} size={20} ring="border-bg" />
							<span className={item.here.length > 0 ? "text-text" : undefined}>{item.here.length > 0 ? `${item.here.join(", ")} is here` : `${OTHERS.length} can open it`}</span>
							<span className="ml-[4px] flex items-center gap-[4px]">
								<SyncedIcon className="h-[12px] w-[12px]" />
								synced
							</span>
						</>
					) : item.place.kind === "folder" ? (
						<span>{item.place.branch ?? "no git"}</span>
					) : (
						<span>on this Mac</span>
					)}
				</motion.span>
			</AnimatePresence>
			<div className="relative">
				<motion.button
					layout
					type="button"
					aria-expanded={move}
					disabled={!canMove}
					title={canMove ? "Move to…" : `${TEAM.name} projects stay in ${TEAM.name}`}
					className={cn(
						"flex h-[28px] items-center gap-[8px] rounded-[7px] border px-[9px] type-control",
						move ? "border-muted bg-raised" : "border-border-raised hover:bg-surface",
						!canMove && "cursor-default hover:bg-transparent",
					)}
					onClick={onMoveOpen}
				>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={`${item.place.kind}${item.place.label}`}
							className="flex items-center gap-[8px] [&>svg]:h-[14px] [&>svg]:w-[14px]"
							initial={{ opacity: 0, filter: "blur(2px)", scale: 0.9 }}
							animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
							exit={{ opacity: 0, filter: "blur(2px)", scale: 0.9 }}
							transition={{ duration: 0.2, ease: EASE }}
						>
							<PlaceGlyph place={item.place} size={14} />
							<span>{placeName(item.place)}</span>
						</motion.span>
					</AnimatePresence>
					{canMove && <ChevronIcon open className="h-[10px] w-[10px] text-muted" />}
				</motion.button>
				<AnimatePresence>{move && <MovePopover key="move" item={item} host={host} onMove={onMove} onClose={onMoveClose} />}</AnimatePresence>
			</div>
			<span className="h-[18px] w-px bg-border-raised" />
			<span className="flex h-7 w-7 items-center justify-center rounded-sm text-text">
				<ThreadIcon className="h-3.5 w-3.5" />
			</span>
			<span className="min-w-9 text-right text-muted type-detail">100%</span>
		</>
	);
}

function ToastNote({ toast }: { toast: Toast }) {
	return (
		<motion.div
			role="status"
			className="absolute bottom-[28px] left-1/2 z-30 flex w-max max-w-[640px] -translate-x-1/2 flex-col gap-[6px] rounded-[9px] border border-border-raised bg-surface px-[16px] py-[12px]"
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 8, transition: { duration: 0.14 } }}
			transition={{ duration: 0.22, ease: EASE }}
		>
			<span className="type-control">{toast.title}</span>
			<span className="text-muted type-detail">{toast.files}</span>
		</motion.div>
	);
}
