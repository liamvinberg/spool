import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Project } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { TeamMark } from "shared/ui/explore/cloud/home/parts";
import { ArrowRightIcon, FolderIcon, SearchIcon } from "shared/ui/spool/icons";
import { FinderSheet, SpoolBrowser } from "./choosers";
import { CLIPBOARD, FETCH, isLink, nameOf, type Reading, read, tidy } from "./fixture";
import { BIRTH, BranchGlyph, CloudGlyph, EASE, type Host, Kbd, LinkGlyph, Progress, Sheet } from "./parts";

/** What an action hands back to Home once it has finished. */
export type Outcome =
	| { kind: "register"; project: Project }
	| { kind: "focus"; project: Project }
	| { kind: "fetched"; id: string };

/**
 * Open…, the one door for everything that already exists somewhere. A folder
 * chosen, a path or a git link pasted, or a teammate's project spool has not got
 * yet: spool reads what it was handed and the panel under the field says what it
 * found and the one thing to do about it.
 */
export function OpenSheet({
	host,
	scope,
	own,
	team,
	initial = "",
	onDone,
	onClose,
}: {
	host: Host;
	scope: "own" | "tidemark";
	own: Project[];
	team: Project[];
	initial?: string;
	onDone: (outcome: Outcome) => void;
	onClose: () => void;
}) {
	const [query, setQuery] = useState(initial);
	const [settled, setSettled] = useState(initial);
	const [fetchAsk, setFetchAsk] = useState(false);
	const [finder, setFinder] = useState(false);
	const [browsing, setBrowsing] = useState(host === "web" && initial === "");
	const [progress, setProgress] = useState<number | null>(null);
	const field = useRef<HTMLInputElement>(null);
	const busy = progress !== null;

	useEffect(() => {
		field.current?.focus();
	}, []);
	useEffect(() => {
		if (tidy(query) === tidy(settled)) return;
		const timer = setTimeout(() => setSettled(query), 320);
		return () => clearTimeout(timer);
	}, [query, settled]);

	const away = team.filter((project) => project.onMac === false);
	const reading: Reading | null = fetchAsk
		? FETCH
		: tidy(settled) === ""
			? null
			: read(settled, own);
	const pending = !fetchAsk && tidy(query) !== "" && tidy(query) !== tidy(settled);

	const hand = (value: string) => {
		setFetchAsk(false);
		setQuery(value);
		setSettled(value);
		setBrowsing(false);
		field.current?.focus();
	};

	const act = () => {
		const reading: Reading | null = fetchAsk ? FETCH : tidy(query) === "" ? null : read(query, own);
		if (!reading || busy) return;
		setSettled(query);
		const fresh = (project: Omit<Project, "edited">): Outcome => ({ kind: "register", project: { ...project, edited: "just now" } });
		switch (reading.kind) {
			case "project":
				return onDone(fresh({ id: reading.name, name: reading.name, art: reading.art, frames: reading.frames, place: { kind: "folder", label: reading.path, path: reading.path, ...(reading.branch ? { branch: reading.branch } : {}) } }));
			case "known":
				return onDone({ kind: "focus", project: reading.project });
			case "inside": {
				const root = own.find((project) => project.place.path === reading.root);
				if (root) return onDone({ kind: "focus", project: root });
				return onDone(fresh({ id: reading.name, name: reading.name, art: reading.art, frames: reading.frames, place: { kind: "folder", label: reading.root, path: reading.root } }));
			}
			case "repo":
				return onDone(fresh({ id: reading.name, name: reading.name, art: "blank", frames: 0, place: { kind: "folder", label: reading.path, path: reading.path, branch: reading.branch } }));
			case "plain":
				return onDone(fresh({ id: reading.name, name: reading.name, art: "blank", frames: 0, place: { kind: "folder", label: reading.path, path: reading.path } }));
			case "clone":
			case "fetch": {
				const done = () => {
					if (reading.kind === "fetch") onDone({ kind: "fetched", id: team.find((project) => project.name === reading.name)?.id ?? reading.name });
					else onDone(fresh({ id: reading.name, name: reading.name, art: reading.art, frames: reading.frames, place: { kind: "folder", label: reading.into, path: reading.into, branch: "main" } }));
				};
				setProgress(0);
				let value = 0;
				const tick = setInterval(() => {
					value = Math.min(1, value + 0.09 + Math.random() * 0.08);
					setProgress(value);
					if (value >= 1) {
						clearInterval(tick);
						setTimeout(done, 220);
					}
				}, 110);
				return;
			}
			default:
				return;
		}
	};

	return (
		<Sheet label="Open" title="Open" onClose={busy ? () => {} : onClose} width={600} birth={BIRTH}>
			<div
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.nativeEvent.isComposing && (event.target as HTMLElement).tagName !== "BUTTON") {
						event.preventDefault();
						act();
					}
				}}
			>
				<div className="flex h-[60px] items-center gap-[12px] pr-[12px] pl-[22px]">
					{isLink(tidy(query)) ? <LinkGlyph className="h-[15px] w-[15px] shrink-0 text-muted" /> : <SearchIcon className="h-[14px] w-[14px] shrink-0 text-muted" />}
					<input
						ref={field}
						value={fetchAsk ? FETCH.name : query}
						readOnly={busy}
						onChange={(event) => {
							setFetchAsk(false);
							setQuery(event.target.value);
							if (host === "web") setBrowsing(event.target.value === "");
						}}
						placeholder="Paste a path or a git link"
						aria-label="Path or git link"
						spellCheck={false}
						autoComplete="off"
						className="h-full min-w-0 flex-1 bg-transparent text-text caret-thread outline-none type-code-input placeholder:text-muted"
					/>
					<button
						type="button"
						disabled={busy}
						onClick={() => (host === "app" ? setFinder(true) : setBrowsing(!browsing))}
						className={cn("inline-flex h-[32px] shrink-0 items-center gap-[8px] rounded-[7px] border border-border-raised px-[11px] type-control hover:bg-raised", browsing && "bg-raised")}
					>
						<FolderIcon className="h-[14px] w-[14px] text-muted" />
						Choose folder…
					</button>
				</div>

				<AnimatePresence initial={false} mode="popLayout">
					{browsing ? (
						<Grow key="browser">
							<SpoolBrowser
								start="~/code"
								known={own.map((project) => project.place.path)}
								onChoose={hand}
								onCancel={() => setBrowsing(false)}
							/>
							<p className="border-border-raised border-t px-[22px] py-[12px] text-muted type-label">A folder dropped on a web page arrives without its path, so spool lists your folders here.</p>
						</Grow>
					) : pending ? (
						<Grow key="reading">
							<p className="flex items-center gap-[10px] border-border-raised border-t px-[22px] py-[18px] text-muted type-value">
								<Reader />
								{`reading ${tidy(query)}`}
							</p>
						</Grow>
					) : reading ? (
						<Grow key={`found:${reading.kind}:${"path" in reading ? reading.path : reading.name}`}>
							<Panel reading={reading} scope={scope} own={own} progress={progress} onAct={act} />
						</Grow>
					) : (
						<Grow key="empty">
							<div className="border-border-raised border-t px-[10px] py-[8px]">
								{host === "app" && (
									<Suggestion
										icon={<LinkGlyph className="h-[15px] w-[15px]" />}
										label={CLIPBOARD}
										detail="from your clipboard"
										onClick={() => hand(CLIPBOARD)}
									/>
								)}
								{away.map((project) => (
									<Suggestion
										key={project.id}
										icon={<TeamMark size={16} />}
										label={project.name}
										detail={`tidemark · not on this Mac`}
										onClick={() => {
											setQuery("");
											setSettled("");
											setFetchAsk(true);
											setBrowsing(false);
											field.current?.focus();
										}}
									/>
								))}
							</div>
						</Grow>
					)}
				</AnimatePresence>
			</div>
			<AnimatePresence>
				{finder && (
					<FinderSheet
						start="~/code"
						onChoose={(path) => {
							setFinder(false);
							hand(path);
						}}
						onCancel={() => {
							setFinder(false);
							field.current?.focus();
						}}
					/>
				)}
			</AnimatePresence>
		</Sheet>
	);
}

function Grow({ children }: { children: ReactNode }) {
	return (
		<motion.div
			initial={{ height: 0, opacity: 0 }}
			animate={{ height: "auto", opacity: 1 }}
			exit={{ height: 0, opacity: 0 }}
			transition={{ duration: 0.22, ease: EASE }}
			className="overflow-hidden"
		>
			{children}
		</motion.div>
	);
}

function Reader() {
	return <span className="h-[10px] w-[10px] shrink-0 animate-spin rounded-full border border-muted border-t-transparent motion-reduce:animate-none" />;
}

function Suggestion({ icon, label, detail, onClick }: { icon: ReactNode; label: string; detail: string; onClick: () => void }) {
	return (
		<button type="button" onClick={onClick} className="group flex h-[40px] w-full items-center gap-[12px] rounded-[7px] px-[12px] text-left hover:bg-raised">
			<span className="grid w-[16px] place-items-center text-muted">{icon}</span>
			<span className="flex-1 truncate type-control">{label}</span>
			<span className="text-muted type-detail">{detail}</span>
			<ArrowRightIcon className="h-[14px] w-[14px] text-muted opacity-0 group-hover:opacity-100" />
		</button>
	);
}

/* ── the reading ───────────────────────────────────────────── */

interface Said {
	cover: ReactNode;
	title: string;
	meta: ReactNode;
	sentence: string;
	where: string;
	action: string | null;
	working?: string;
}

function said(reading: Reading, own: Project[]): Said {
	switch (reading.kind) {
		case "project":
			return {
				cover: <Cover art={reading.art} />,
				title: reading.name,
				meta: <Meta frames={reading.frames} branch={reading.branch} />,
				sentence: "This folder holds a spool project. spool adds it to Home and opens it.",
				where: `${reading.path}/design`,
				action: "Open",
			};
		case "known":
			return {
				cover: <Cover art={reading.project.art} />,
				title: reading.project.name,
				meta: <Meta frames={reading.project.frames} branch={reading.project.place.branch} />,
				sentence: "Already on Home. spool brings its tab forward.",
				where: reading.project.place.kind === "draft" ? reading.project.place.path : `${reading.project.place.path}/design`,
				action: "Open",
			};
		case "inside": {
			const onHome = own.some((project) => project.place.path === reading.root);
			return {
				cover: <Cover art={reading.art} />,
				title: reading.name,
				meta: <Meta frames={reading.frames} />,
				sentence: `${nameOf(reading.path)} sits inside ${nameOf(reading.root)}, whose design/ is at its root. spool opens that project${onHome ? ", which is already on Home" : ""}.`,
				where: `${reading.root}/design`,
				action: "Open the project at its root",
			};
		}
		case "repo":
			return {
				cover: <Glyph><BranchGlyph className="h-[22px] w-[22px]" /></Glyph>,
				title: reading.name,
				meta: (
					<span className="flex items-center gap-[10px]">
						<span className="flex items-center gap-[5px]">
							<BranchGlyph className="h-[11px] w-[11px]" />
							{reading.branch}
						</span>
						<span>{reading.stack.toLowerCase()}</span>
					</span>
				),
				sentence: "A repository with no design/ yet. spool starts one beside the code and opens it empty.",
				where: `${reading.path}/design`,
				action: "Add design/ here",
			};
		case "plain":
			return {
				cover: <Glyph><FolderIcon className="h-[22px] w-[22px]" /></Glyph>,
				title: reading.name,
				meta: <span>no git · no design/</span>,
				sentence: "A plain folder. spool adds design/ inside it; nothing keeps its history until it is a repository.",
				where: `${reading.path}/design`,
				action: "Add design/ here",
			};
		case "clone":
			return {
				cover: reading.art === "blank" ? <Glyph><LinkGlyph className="h-[22px] w-[22px]" /></Glyph> : <Cover art={reading.art} />,
				title: reading.name,
				meta: <span>{reading.frames > 0 ? `${reading.frames} frames in design/` : "read once it arrives"}</span>,
				sentence: `A git link. spool clones ${reading.url} beside your other code, then opens its design/.`,
				where: reading.into,
				action: "Clone and open",
				working: "cloning",
			};
		case "fetch":
			return {
				cover: <Cover art={reading.art} dim />,
				title: reading.name,
				meta: (
					<span className="flex items-center gap-[8px]">
						<TeamMark size={14} />
						{reading.team.toLowerCase()} · {reading.frames} frames
					</span>
				),
				sentence: "Made by Sam in Tidemark and not on this Mac yet. spool fetches its files, then keeps them in step like every team project.",
				where: reading.into,
				action: "Get it",
				working: "fetching",
			};
		case "missing":
			return {
				cover: <Glyph><FolderIcon className="h-[22px] w-[22px] opacity-50" /></Glyph>,
				title: nameOf(reading.path),
				meta: <span>not found</span>,
				sentence: `Nothing is at ${reading.path}. Check the path, or choose the folder instead.`,
				where: reading.path,
				action: null,
			};
	}
}

function Panel({ reading, scope, own, progress, onAct }: { reading: Reading; scope: "own" | "tidemark"; own: Project[]; progress: number | null; onAct: () => void }) {
	const text = said(reading, own);
	const joins = scope === "tidemark" && reading.kind !== "fetch" && reading.kind !== "known" && reading.kind !== "missing";
	return (
		<div className="border-border-raised border-t px-[22px] pt-[18px] pb-[18px]">
			<div className="flex gap-[18px]">
				{text.cover}
				<div className="min-w-0 flex-1">
					<p className="flex items-baseline justify-between gap-[12px]">
						<strong className="truncate type-title font-[500]">{text.title}</strong>
						<span className="shrink-0 text-muted type-detail">{text.meta}</span>
					</p>
					<p className="mt-[8px] text-muted type-label">{text.sentence}</p>
					{joins && <p className="mt-[6px] text-muted type-label">It joins Your projects. A folder project can move into Tidemark later.</p>}
				</div>
			</div>
			<div className="mt-[18px] flex h-[34px] items-center gap-[14px]">
				<span className="flex min-w-0 flex-1 items-center gap-[8px] text-muted type-detail">
					{reading.kind === "fetch" ? <CloudGlyph className="h-[13px] w-[13px] shrink-0" /> : <FolderIcon className="h-[13px] w-[13px] shrink-0" />}
					<span className="truncate">{text.where}</span>
				</span>
				{progress !== null ? (
					<span className="flex w-[200px] flex-col gap-[7px]">
						<span className="flex justify-between type-detail">
							<span>{text.working}</span>
							<span className="text-muted">{Math.round(progress * 100)}%</span>
						</span>
						<Progress value={progress} />
					</span>
				) : (
					text.action && (
						<button type="button" onClick={onAct} className="inline-flex h-[32px] shrink-0 items-center gap-[10px] rounded-[7px] bg-text px-[12px] text-bg type-control">
							{text.action}
							<Kbd className="border-bg/25 text-bg/60">↵</Kbd>
						</button>
					)
				)}
			</div>
		</div>
	);
}

function Cover({ art, dim = false }: { art: Project["art"]; dim?: boolean }) {
	return (
		<span className="block h-[66px] w-[120px] shrink-0 overflow-hidden rounded-[6px] bg-canvas">
			<ProjectArtwork kind={art} className={cn("h-full w-full", dim && "opacity-40 grayscale")} />
		</span>
	);
}

function Glyph({ children }: { children: ReactNode }) {
	return <span className="grid h-[66px] w-[120px] shrink-0 place-items-center rounded-[6px] border border-border-raised border-dashed text-muted">{children}</span>;
}

function Meta({ frames, branch }: { frames: number; branch?: string | undefined }) {
	return (
		<span className="flex items-center gap-[10px]">
			<span>{frames} frames</span>
			{branch && (
				<span className="flex items-center gap-[5px]">
					<BranchGlyph className="h-[11px] w-[11px]" />
					{branch}
				</span>
			)}
		</span>
	);
}
