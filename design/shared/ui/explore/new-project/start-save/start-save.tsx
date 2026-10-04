import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { PlayedTab } from "shared/ui/spool/browser-tab";
import { HOME_ACTION } from "shared/ui/spool/home-actions";
import { CheckIcon } from "shared/ui/spool/icons";
import { TrashToast } from "shared/ui/spool/trash-toast";
import { FINDINGS, type Finding } from "shared/lib/explore/new-project/places";
import { Bar, type BarTab, Kbd } from "./bar";
import { DocCanvas, ProjectCanvas } from "./canvas";
import { DISK, type Doc, type Entry, type Item, KEPT, KNOWN, type Known, type SaveTo, STARTING, designPath, fresh, nextDoc, placeOf, projectFor, slug } from "./fixture";
import { Home, type Team } from "./home";
import { BrowseSheet, FinderSheet, type Pick, Reading, readEntry } from "./open";
import { SCRIM } from "./motion";
import { CloseAlert, SaveSheet, Sheet } from "./sheet";

/**
 * start-save: pen.dev's document model on spool.
 *
 * + is instant. It opens an untitled tab whose files already exist in spool's
 * scratch, so an agent writes frames from the first second, and the tab wears a
 * dot until it is saved. ⌘S hangs a sheet from that tab and asks the two things a
 * project needs, a name and a place: Drafts, a folder beside code, or a team.
 * Saving moves the folder there and a card is born on Home. Opening is ⌘O: Finder
 * (or spool's own list, in a browser), then one reading of what was found.
 */

export type Step = "home" | "untitled" | "save" | "save-repo" | "close" | "open";
export type Host = "app" | "web";

interface TabRef {
	id: string;
	kind: "doc" | "project";
	ref: string;
}

type Place = SaveTo["kind"];
type SaveOverlay = { kind: "save"; doc: string; closing?: boolean; place: Place; folder?: string };
type Overlay =
	| SaveOverlay
	| { kind: "close"; doc: string }
	| { kind: "pick"; back?: SaveOverlay; dropped?: string }
	| { kind: "reading"; finding: Finding; picked: boolean };

type Toast = { kind: "done"; title: string; path: string; detail?: string } | { kind: "trash"; doc: Doc; tab: TabRef; index: number };

const docTab = (doc: Doc): TabRef => ({ id: `doc:${doc.id}`, kind: "doc", ref: doc.id });
const projectTab = (id: string): TabRef => ({ id: `p:${id}`, kind: "project", ref: id });

function start(step: Step) {
	const writing = fresh(step === "untitled" ? 3 : 6, step === "untitled" ? "writing" : "done");
	const onCanvas = step === "untitled" || step === "save" || step === "save-repo" || step === "close";
	const docs = onCanvas ? [KEPT, writing] : [KEPT];
	const tabs = [projectTab("tvarso"), ...docs.map(docTab)];
	const overlay: Overlay | null =
		step === "save"
			? { kind: "save", doc: writing.id, place: "draft" }
			: step === "save-repo"
				? { kind: "save", doc: writing.id, place: "folder", folder: "~/code/tidemark-api" }
				: step === "close"
					? { kind: "close", doc: writing.id }
					: step === "open"
						? { kind: "reading", finding: FINDINGS.project!, picked: true }
						: null;
	return { docs, tabs, active: onCanvas ? docTab(writing).id : null, overlay };
}

export function StartSave({ step = "home" }: { step?: Step }) {
	const [host, setHost] = useState<Host>("app");
	const [team, setTeam] = useState<Team>("own");
	const [projects, setProjects] = useState<Item[]>(STARTING);
	const [known, setKnown] = useState<Known[]>(KNOWN);
	const initial = useRef(start(step)).current;
	const [docs, setDocs] = useState<Doc[]>(initial.docs);
	const [tabs, setTabs] = useState<TabRef[]>(initial.tabs);
	const [active, setActive] = useState<string | null>(initial.active);
	const [overlay, setOverlay] = useState<Overlay | null>(initial.overlay);
	const [toast, setToast] = useState<Toast | null>(null);
	const [progress, setProgress] = useState<number | null>(null);
	const [dragging, setDragging] = useState(false);

	const docOf = (id: string) => docs.find((doc) => doc.id === id);
	const activeTab = tabs.find((tab) => tab.id === active);
	const activeDoc = activeTab?.kind === "doc" ? docOf(activeTab.ref) : undefined;

	/* the agent writes one frame at a time into whatever canvas asked it */
	useEffect(() => {
		if (!docs.some((doc) => doc.agent === "writing")) return;
		const timer = setTimeout(
			() =>
				setDocs((list) =>
					list.map((doc) => {
						if (doc.agent !== "writing") return doc;
						const [next, ...rest] = doc.todo;
						if (!next) return { ...doc, agent: "done" };
						return { ...doc, frames: [...doc.frames, next], todo: rest, log: [...doc.log, { kind: "write", text: next.name }], agent: rest.length > 0 ? "writing" : "done" };
					}),
				),
			1500,
		);
		return () => clearTimeout(timer);
	}, [docs]);

	useEffect(() => {
		if (toast === null) return;
		const timer = setTimeout(() => setToast(null), toast.kind === "trash" ? 6000 : 4500);
		return () => clearTimeout(timer);
	}, [toast]);

	/* ── verbs ── */

	const newDoc = () => {
		const doc = nextDoc(
			docs.map((item) => item.label),
			team === "tidemark",
		);
		setDocs((list) => [...list, doc]);
		setTabs((list) => [...list, docTab(doc)]);
		setActive(docTab(doc).id);
		setOverlay(null);
	};

	const askSave = (docId: string, closing = false, focus = true) => {
		const doc = docOf(docId);
		if (!doc || doc.saved) return;
		if (focus) setActive(`doc:${docId}`);
		setOverlay({ kind: "save", doc: docId, place: doc.team ? "team" : "draft", closing });
	};

	const save = (docId: string, name: string, to: SaveTo, closing: boolean) => {
		const doc = docOf(docId);
		if (!doc) return;
		const place = placeOf(to, name);
		let id = slug(name);
		while (projects.some((item) => item.id === id)) id = `${id}-2`;
		setDocs((list) => list.map((item) => (item.id === docId ? { ...item, saved: { name, place, project: id }, log: [...item.log, { kind: "moved", text: designPath(to, name) }] } : item)));
		setProjects((list) => [{ id, name, art: "blank", frames: doc.frames.length, edited: to.kind === "team" ? "you · just now" : "just now", place, born: true, doc: docId, ...(to.kind === "team" ? { onMac: true } : {}) }, ...list]);
		if (to.kind === "folder") setKnown((list) => list.map((item) => (item.path === to.folder.path ? { ...item, holds: name } : item)));
		// Home follows the save, so the card it makes is born where you can see it
		if (closing || active === null) setTeam(to.kind === "team" ? "tidemark" : "own");
		if (closing) {
			setTabs((list) => list.filter((tab) => tab.id !== `doc:${docId}`));
			if (active === `doc:${docId}`) setActive(null);
		}
		setOverlay(null);
		setToast({
			kind: "done",
			title: to.kind === "team" ? "Saved to Tidemark" : "Saved",
			path: designPath(to, name),
			...(to.kind === "folder" && to.folder.branch ? { detail: `on ${to.folder.branch}` } : to.kind === "team" ? { detail: "jonas, mira and sam have it" } : {}),
		});
	};

	const close = (tabId: string, focus = true) => {
		const tab = tabs.find((item) => item.id === tabId);
		if (!tab) return;
		const doc = tab.kind === "doc" ? docOf(tab.ref) : undefined;
		if (doc && !doc.saved && (doc.frames.length > 0 || doc.agent === "writing")) {
			if (focus) setActive(tabId);
			setOverlay({ kind: "close", doc: doc.id });
			return;
		}
		// an untitled canvas nothing was written into has nothing to lose
		if (doc && !doc.saved) setDocs((list) => list.filter((item) => item.id !== doc.id));
		setTabs((list) => list.filter((item) => item.id !== tabId));
		if (active === tabId) setActive(null);
	};

	const discard = (docId: string) => {
		const doc = docOf(docId);
		const index = tabs.findIndex((tab) => tab.id === `doc:${docId}`);
		if (!doc) return;
		setDocs((list) => list.filter((item) => item.id !== docId));
		setTabs((list) => list.filter((tab) => tab.id !== `doc:${docId}`));
		if (active === `doc:${docId}`) setActive(null);
		setOverlay(null);
		setToast({ kind: "trash", doc: { ...doc, agent: doc.agent === "writing" ? "done" : doc.agent }, tab: docTab(doc), index });
	};

	const undoTrash = () => {
		if (toast?.kind !== "trash") return;
		const { doc, tab, index } = toast;
		setDocs((list) => [...list, doc]);
		setTabs((list) => [...list.slice(0, index), tab, ...list.slice(index)]);
		setActive(tab.id);
		setToast(null);
	};

	const openProject = (item: Item) => {
		if (item.place.kind === "team" && item.onMac === false) {
			setOverlay({ kind: "reading", finding: FINDINGS.fetch!, picked: false });
			return;
		}
		if (item.doc) {
			const doc = docOf(item.doc);
			if (doc) {
				if (!tabs.some((tab) => tab.id === `doc:${doc.id}`)) setTabs((list) => [...list, docTab(doc)]);
				setActive(`doc:${doc.id}`);
				return;
			}
		}
		const tab = projectTab(item.id);
		if (!tabs.some((existing) => existing.id === tab.id)) setTabs((list) => [...list, tab]);
		setActive(tab.id);
		setOverlay(null);
	};

	const picked = (pick: Pick, back?: SaveOverlay) => {
		const finding = readEntry(pick.parts, pick.entry, projects);
		if (back) {
			const path = `~/${pick.parts.join("/")}`;
			if (!known.some((item) => item.path === path)) {
				const holds = finding.kind === "project" || finding.kind === "inside" ? finding.name : undefined;
				setKnown((list) => [...list, { path, name: pick.entry.name, ...(finding.kind === "repo" ? { branch: finding.branch, stack: finding.stack } : {}), ...(holds ? { holds } : {}) }]);
			}
			setOverlay({ ...back, place: "folder", folder: path });
			return;
		}
		setOverlay({ kind: "reading", finding, picked: true });
	};

	const act = (finding: Finding) => {
		if (finding.kind === "clone" || (finding.kind === "fetch" && !projects.find((item) => item.name === finding.name)?.onMac)) {
			setProgress(0);
			return;
		}
		land(finding);
	};

	const land = (finding: Finding) => {
		setProgress(null);
		if (finding.kind === "inside") return openProject(projects.find((item) => item.id === "tvarso")!);
		if (finding.kind === "fetch") {
			const item = projects.find((entry) => entry.name === finding.name)!;
			const got = { ...item, onMac: true };
			setProjects((list) => list.map((entry) => (entry.id === item.id ? got : entry)));
			setToast({ kind: "done", title: `Got ${finding.name}`, path: finding.into, detail: "saves relay both ways now" });
			return openProject(got);
		}
		const existing = projects.find((item) => "path" in finding && item.place.path === finding.path);
		if (existing) return openProject(existing);
		const item = projectFor(finding);
		if (!item) return;
		setProjects((list) => [item, ...list]);
		if (finding.kind === "repo" || finding.kind === "plain") setKnown((list) => [...list.filter((entry) => entry.path !== finding.path), { path: finding.path, name: finding.name, holds: finding.name }]);
		setToast({ kind: "done", title: finding.kind === "project" ? "Added to Home" : finding.kind === "clone" ? "Cloned" : "Started", path: `${item.place.path}/design` });
		openProject(item);
	};

	useEffect(() => {
		if (progress === null || overlay?.kind !== "reading") return;
		if (progress >= 1) {
			const timer = setTimeout(() => land(overlay.finding), 200);
			return () => clearTimeout(timer);
		}
		const timer = setTimeout(() => setProgress((value) => Math.min((value ?? 0) + 0.12, 1)), 120);
		return () => clearTimeout(timer);
	});

	/* ── keys, while no sheet holds them ── */

	const keys = useRef<(event: KeyboardEvent) => void>(() => {});
	keys.current = (event) => {
		if (overlay !== null) return;
		const mod = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();
		const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
		if (mod && key === "s") {
			event.preventDefault();
			if (activeDoc && !activeDoc.saved) askSave(activeDoc.id);
		} else if (mod && key === "o") {
			event.preventDefault();
			setOverlay({ kind: "pick" });
		} else if (mod && key === "z" && toast?.kind === "trash") {
			event.preventDefault();
			undoTrash();
		} else if (!mod && !typing && key === "n" && active === null) {
			event.preventDefault();
			newDoc();
		}
	};
	useEffect(() => {
		const listen = (event: KeyboardEvent) => keys.current(event);
		window.addEventListener("keydown", listen);
		return () => window.removeEventListener("keydown", listen);
	}, []);

	/* ── where a sheet hangs ── */

	const body = useRef<HTMLDivElement>(null);
	const [anchor, setAnchor] = useState(0);
	const hung = overlay?.kind === "save" || overlay?.kind === "close" ? `doc:${overlay.doc}` : null;
	useLayoutEffect(() => {
		if (!hung || !body.current) return;
		const tab = body.current.parentElement?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(hung)}"]`);
		const box = body.current.getBoundingClientRect();
		const left = tab ? tab.getBoundingClientRect().left - box.left : 16;
		setAnchor(Math.max(16, Math.min(left, box.width - 580)));
	}, [hung, tabs.length]);

	const barTabs: BarTab[] = tabs.map((tab) => {
		if (tab.kind === "doc") {
			const doc = docOf(tab.ref);
			return { id: tab.id, name: doc?.saved?.name ?? doc?.label ?? "untitled", unsaved: !doc?.saved, team: doc?.saved?.place.kind === "team" };
		}
		const item = projects.find((entry) => entry.id === tab.ref);
		return { id: tab.id, name: item?.name ?? tab.ref, unsaved: false, team: item?.place.kind === "team" };
	});

	const shownProjects = projects.map((item) => {
		const doc = item.doc ? docOf(item.doc) : undefined;
		return doc ? { ...item, frames: doc.frames.length, shots: doc.frames } : item;
	});

	const seen = useCallback(() => setProjects((list) => (list.some((item) => item.born) ? list.map(({ born: _, ...item }) => item) : list)), []);

	const onDrop = (event: React.DragEvent) => {
		event.preventDefault();
		setDragging(false);
		const name = event.dataTransfer.files[0]?.name ?? "moodboard";
		if (host === "web") return setOverlay({ kind: "pick", dropped: name });
		const found = locate(name);
		setOverlay({ kind: "reading", finding: found ? readEntry(found.parts, found.entry, projects) : { kind: "plain", path: `~/Desktop/${name}`, name }, picked: false });
	};

	const app = (
		<div
			className="relative flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]"
			onDragOver={(event) => {
				if (!event.dataTransfer.types.includes("Files")) return;
				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={(event) => {
				if (event.currentTarget === event.target) setDragging(false);
			}}
			onDrop={onDrop}
		>
			<Bar
				tabs={barTabs}
				active={active}
				hung={hung}
				onHome={() => setActive(null)}
				onFocus={setActive}
				onClose={close}
				onNew={newDoc}
				right={
					<>
						{activeDoc && !activeDoc.saved ? (
							<>
								<span className="text-muted type-detail">not saved</span>
								<button type="button" className={cn(HOME_ACTION, "min-h-[28px] px-[10px]")} onClick={() => askSave(activeDoc.id)}>
									Save…
									<Kbd>⌘S</Kbd>
								</button>
							</>
						) : active !== null ? (
							<span className="text-muted type-detail">72%</span>
						) : null}
						<HostToggle host={host} onHost={setHost} />
					</>
				}
			/>
			{overlay && <div className="absolute inset-x-0 top-0 z-50 h-11" aria-hidden="true" onClick={() => progress === null && setOverlay(null)} />}
			<div ref={body} className="relative min-h-0 flex-1">
				{activeTab === undefined ? (
					<Home
						team={team}
						projects={shownProjects}
						docs={docs.filter((doc) => !doc.saved)}
						onTeam={setTeam}
						onNew={newDoc}
						onOpen={() => setOverlay({ kind: "pick" })}
						onProject={openProject}
						onDoc={(id) => setActive(`doc:${id}`)}
						onSaveDoc={(id) => askSave(id, false, false)}
						onCloseDoc={(id) => close(`doc:${id}`, false)}
						onSeen={seen}
					/>
				) : activeTab.kind === "doc" && docOf(activeTab.ref) ? (
					<DocCanvas
						key={activeTab.id}
						doc={docOf(activeTab.ref)!}
						onSave={() => askSave(activeTab.ref)}
						onSend={(ask) => setDocs((list) => list.map((doc) => (doc.id === activeTab.ref ? { ...doc, ask, agent: "writing" } : doc)))}
					/>
				) : (
					<ProjectCanvas key={activeTab.id} item={shownProjects.find((item) => item.id === activeTab.ref) ?? shownProjects[0]!} />
				)}

				<AnimatePresence>
					{overlay && <motion.div key="scrim" {...SCRIM} className="absolute inset-0 z-20 bg-bg/60" onClick={() => progress === null && setOverlay(null)} />}
					{overlay?.kind === "save" && docOf(overlay.doc) && (
						<Sheet key={`save-${overlay.doc}-${overlay.folder ?? ""}`} left={anchor} width={560} label="Save">
							<SaveSheet
								doc={docOf(overlay.doc)!}
								known={known}
								initialKind={overlay.place}
								initialFolder={overlay.folder}
								closing={overlay.closing}
								onCancel={() => setOverlay(null)}
								onSave={(name, to) => save(overlay.doc, name, to, overlay.closing === true)}
								onOther={() => setOverlay({ kind: "pick", back: overlay })}
							/>
						</Sheet>
					)}
					{overlay?.kind === "close" && docOf(overlay.doc) && (
						<Sheet key={`close-${overlay.doc}`} left={anchor} width={460} label="Close">
							<CloseAlert
								doc={docOf(overlay.doc)!}
								onCancel={() => setOverlay(null)}
								onDiscard={() => discard(overlay.doc)}
								onSave={() => askSave(overlay.doc, true, false)}
							/>
						</Sheet>
					)}
					{overlay?.kind === "pick" &&
						(host === "app" ? (
							<Sheet key="finder" left="center" width={820} label="Open">
								<FinderSheet
									choosing={overlay.back !== undefined}
									onPick={(pick) => picked(pick, overlay.back)}
									onLink={(url) => setOverlay({ kind: "reading", finding: cloneOf(url), picked: true })}
									onCancel={() => setOverlay(overlay.back ?? null)}
								/>
							</Sheet>
						) : (
							<Sheet key="browse" left="center" width={600} label="Open">
								<BrowseSheet
									choosing={overlay.back !== undefined}
									dropped={overlay.dropped}
									onPick={(pick) => picked(pick, overlay.back)}
									onLink={(url) => setOverlay({ kind: "reading", finding: cloneOf(url), picked: true })}
									onCancel={() => setOverlay(overlay.back ?? null)}
								/>
							</Sheet>
						))}
					{overlay?.kind === "reading" && (
						<Sheet key={`reading-${overlay.finding.name}`} left="center" width={540} label={overlay.finding.name}>
							<Reading
								finding={overlay.finding}
								projects={projects}
								progress={progress}
								onAct={() => act(overlay.finding)}
								onBack={overlay.picked ? () => setOverlay({ kind: "pick" }) : undefined}
								onCancel={() => setOverlay(null)}
							/>
						</Sheet>
					)}
				</AnimatePresence>

				<AnimatePresence>
					{toast?.kind === "done" && (
						<motion.div
							key={`done-${toast.path}`}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 4, transition: { duration: 0.14 } }}
							transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
							className="-translate-x-1/2 absolute bottom-[96px] left-1/2 z-30 flex items-center gap-[12px] rounded-md border border-border-raised bg-raised px-[14px] py-[10px]"
						>
							<CheckIcon className="h-[12px] w-[12px] shrink-0" />
							<span className="type-control">{toast.title}</span>
							<code className="text-muted type-detail">
								{toast.path}
								{toast.detail ? ` · ${toast.detail}` : ""}
							</code>
						</motion.div>
					)}
				</AnimatePresence>
				{toast?.kind === "trash" && <TrashToast frames={toast.doc.frames.map((frame) => frame.name)} page={toast.doc.label} onUndo={undoTrash} />}

				{dragging && (
					<div className="pointer-events-none absolute inset-[12px] z-40 grid place-items-center rounded-[12px] border border-muted border-dashed bg-bg/70">
						<p className="type-title">Drop a folder to open it</p>
					</div>
				)}
			</div>
		</div>
	);

	return (
		<MotionConfig reducedMotion="user">
			{host === "web" ? (
				<PlayedTab title="spool" url="localhost:7766" sibling="GitHub">
					{app}
				</PlayedTab>
			) : (
				app
			)}
		</MotionConfig>
	);
}

/** The exploration's own control: the same walk, in the Mac app or in a browser tab. */
function HostToggle({ host, onHost }: { host: Host; onHost: (host: Host) => void }): ReactNode {
	return (
		<div className="ml-[4px] flex items-center gap-[2px] rounded-[7px] border border-border border-dashed p-[2px]" aria-label="Host, a proposal control">
			{(["app", "web"] as const).map((option) => (
				<button
					key={option}
					type="button"
					onClick={() => onHost(option)}
					aria-pressed={host === option}
					className={cn("h-[22px] rounded-[5px] px-[8px] type-detail", host === option ? "bg-raised text-text" : "text-muted hover:text-text")}
				>
					{option}
				</button>
			))}
		</div>
	);
}

function cloneOf(url: string): Finding {
	const name = url.trim().replace(/\.git$/, "").split("/").pop() || "repo";
	const known = FINDINGS.clone!;
	return known.kind === "clone" && known.name === name ? known : { kind: "clone", url: url.trim(), name, into: `~/code/${name}`, frames: 0, art: "blank" };
}

function locate(name: string, list: Entry[] = DISK, parts: string[] = []): Pick | null {
	for (const entry of list) {
		if (entry.name === name && !entry.file) return { parts: [...parts, entry.name], entry };
		const deeper = entry.children ? locate(name, entry.children, [...parts, entry.name]) : null;
		if (deeper) return deeper;
	}
	return null;
}
