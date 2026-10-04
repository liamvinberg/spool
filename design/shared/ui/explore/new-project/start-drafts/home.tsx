import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { Faces, TeamMark } from "shared/ui/explore/cloud/home/parts";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { CloseIcon, FolderIcon, PlusIcon, SearchIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { type Item, type Section, type Spot, TEAM, readingOf } from "./fixture";
import { ClockIcon, DraftIcon, EASE, Kbd, PlaceLine } from "./marks";

export type Host = "app" | "web";

/** The drop target: the card a dragged folder will become, already carrying what spool read in it. */
export interface Ghost {
	spot: Spot;
	/** let go already: a browser drop, waiting on the path spool went looking for */
	dropped: boolean;
	/** the places spool tried the dropped name in, when a browser kept the path */
	foundIn?: string[] | undefined;
	/** a browser drag still in the air: it shows nothing of the folder until it lands */
	blind?: boolean | undefined;
	/** drawn with a pointer and a dragged folder, for a still of the moment */
	still?: boolean | undefined;
}

const TITLES: Record<Section, string> = { recents: "Recents", drafts: "Drafts", folders: "Folders", tidemark: TEAM.name };

export function inSection(items: Item[], section: Section): Item[] {
	if (section === "recents") return items.filter((item) => item.onMac);
	if (section === "drafts") return items.filter((item) => item.place.kind === "draft");
	if (section === "folders") return items.filter((item) => item.place.kind === "folder");
	return items.filter((item) => item.place.kind === "team");
}

export function HomeView({
	host,
	items,
	section,
	birthing,
	landed,
	ghost,
	onSection,
	onNew,
	onOpenSheet,
	onOpenItem,
	onDrop,
}: {
	host: Host;
	items: Item[];
	section: Section;
	/** the card just made, standing in the grid for the moment before it grows into its tab */
	birthing: string | null;
	/** the card that just arrived from a folder, wearing its reading */
	landed: string | null;
	ghost: Ghost | null;
	onSection: (section: Section) => void;
	onNew: () => void;
	onOpenSheet: () => void;
	onOpenItem: (id: string) => void;
	onDrop: () => void;
}) {
	const [query, setQuery] = useState("");
	const search = useRef<HTMLInputElement>(null);
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			const typing = event.target instanceof HTMLInputElement;
			if (event.key === "/" && !typing) {
				event.preventDefault();
				search.current?.focus();
			}
			if (event.key === "Escape" && typing) {
				setQuery("");
				(event.target as HTMLInputElement).blur();
			}
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, []);
	const needle = query.trim().toLowerCase();
	const listed = inSection(items, section).filter((item) => needle === "" || item.name.toLowerCase().includes(needle) || item.place.label.toLowerCase().includes(needle));
	const team = section === "tidemark";
	const count = (s: Section) => String(inSection(items, s).length);
	const mod = host === "app" ? "⌘" : "";
	return (
		<div className="grid h-full grid-cols-[208px_minmax(0,1fr)] bg-bg text-text">
			<aside className="flex h-full flex-col border-border border-r px-[16px] pt-[32px] pb-[22px]">
				<div className="mb-[30px] flex h-[32px] items-center gap-[10px] px-[13px] [font:var(--type-mark)] tracking-[-1px]">
					<SpoolMark className="h-[25px] w-[19px] shrink-0 text-thread" />
					<span>spool</span>
				</div>
				<nav aria-label="Home sections" className="flex flex-col gap-[2px]">
					<NavItem icon={<ClockIcon />} label="Recents" current={section === "recents"} onClick={() => onSection("recents")} />
					<NavItem icon={<DraftIcon />} label="Drafts" count={count("drafts")} current={section === "drafts"} onClick={() => onSection("drafts")} />
					<NavItem icon={<FolderIcon />} label="Folders" count={count("folders")} current={section === "folders"} onClick={() => onSection("folders")} />
					<p className="mt-[22px] mb-[6px] px-[12px] text-muted type-caption">Teams</p>
					<NavItem icon={<TeamMark size={18} />} label={TEAM.name} count={count("tidemark")} current={team} onClick={() => onSection("tidemark")} />
					<button type="button" className="flex h-[36px] items-center gap-[12px] rounded-[7px] px-[12px] text-muted type-control hover:text-text">
						<span className="grid h-[18px] w-[18px] place-items-center">
							<PlusIcon className="h-[9px] w-[9px]" />
						</span>
						New team…
					</button>
				</nav>
				<div className="mt-auto flex flex-col gap-[6px] pl-[12px] text-muted type-detail">
					<span>drop a folder to add it</span>
				</div>
			</aside>
			<main className="relative min-w-0 overflow-auto px-[48px] pt-[46px] pb-[40px] [scrollbar-width:thin] [scrollbar-color:var(--color-border-raised)_transparent]">
				<header className="mb-[26px] flex items-center justify-between gap-[25px]">
					<div className="flex items-center gap-[16px]">
						{team && <TeamMark size={30} />}
						<h1 className="type-page">{TITLES[section]}</h1>
						{team && <Faces ids={TEAM.members} />}
					</div>
					<div className="flex items-center gap-[13px]">
						<label className="flex h-[35px] w-[212px] items-center gap-[10px] rounded-[7px] border border-border px-[11px] text-muted focus-within:border-muted">
							<SearchIcon className="h-3 w-3 shrink-0" />
							<input
								ref={search}
								className="w-full min-w-0 bg-transparent text-text outline-none type-control placeholder:text-muted"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder={team ? "Search Tidemark" : "Search projects"}
								aria-label="Search projects"
							/>
							{query ? (
								<button type="button" className="flex" title="Clear search" onClick={() => setQuery("")}>
									<CloseIcon className="h-2 w-2" />
								</button>
							) : (
								<kbd className="type-detail">/</kbd>
							)}
						</label>
						<button type="button" className={HOME_ACTION} onClick={onOpenSheet}>
							Open…
							{host === "app" && <Kbd>⌘O</Kbd>}
						</button>
						<button type="button" className={HOME_ACTION_PRIMARY} onClick={onNew}>
							<PlusIcon className="h-[10px] w-[10px]" />
							{team ? "New in Tidemark" : "New draft"}
							<Kbd className="opacity-50">{mod}N</Kbd>
						</button>
					</div>
				</header>
				<SubRow section={section} n={listed.length} />
				<motion.div layout className="grid grid-cols-3 gap-x-[24px] gap-y-[34px]">
					<AnimatePresence initial={false} mode="popLayout">
						{ghost && <GhostSlot key="ghost" ghost={ghost} onDrop={onDrop} />}
						{listed.map((item) => (
							<Tile
								key={item.id}
								item={item}
								birthing={item.id === birthing}
								landed={item.id === landed}
								dim={ghost !== null}
								showPlace={section === "recents" || section === "folders"}
								onOpen={() => onOpenItem(item.id)}
							/>
						))}
					</AnimatePresence>
				</motion.div>
				{listed.length === 0 && ghost === null && <EmptySection section={section} onNew={onNew} onOpenSheet={onOpenSheet} />}
			</main>
		</div>
	);
}

function SubRow({ section, n }: { section: Section; n: number }) {
	const right: Record<Section, ReactNode> = {
		recents: <span>Everything you opened lately, wherever it lives.</span>,
		drafts: (
			<span>
				Kept on this Mac at <code className="type-detail">~/spool</code>. Move one into a folder or a team when it is ready.
			</span>
		),
		folders: <span>Projects living in a design/ beside their code.</span>,
		tidemark: <span>Every member holds the files. Saves reach everyone in about a second.</span>,
	};
	const noun = section === "drafts" ? "draft" : "project";
	return (
		<div className="mb-[24px] flex h-[23px] items-center justify-between gap-[24px] text-muted">
			<span className="type-detail">
				{n} {n === 1 ? noun : `${noun}s`}
			</span>
			<span className="truncate type-caption">{right[section]}</span>
		</div>
	);
}

function NavItem({ label, icon, current, count, onClick }: { label: string; icon: ReactNode; current: boolean; count?: string; onClick: () => void }) {
	return (
		<button
			type="button"
			aria-current={current ? "page" : undefined}
			onClick={onClick}
			className={cn(
				"relative flex h-[36px] w-full items-center gap-[12px] rounded-[7px] px-[12px] text-left type-control [&_svg]:h-[16px] [&_svg]:w-[16px]",
				current ? "text-text" : "text-muted hover:text-text",
			)}
		>
			{current && <motion.span layoutId="sd-nav" className="absolute inset-0 rounded-[7px] bg-surface" transition={{ duration: 0.2, ease: EASE }} />}
			<span className="relative grid h-[18px] w-[18px] place-items-center">{icon}</span>
			<span className="relative flex-1">{label}</span>
			{count && <span className="relative text-muted type-detail">{count}</span>}
		</button>
	);
}

/**
 * A project's card. Its cover carries a layoutId the open canvas shares, so
 * opening one grows the cover into the canvas and Home shrinks it back.
 */
function Tile({ item, birthing, landed, dim, showPlace, onOpen }: { item: Item; birthing: boolean; landed: boolean; dim: boolean; showPlace: boolean; onOpen: () => void }) {
	const away = !item.onMac;
	return (
		<motion.article
			layout="position"
			className={cn("group/tile min-w-0 transition-opacity duration-200", dim && "opacity-40")}
			initial={{ opacity: 0, scale: 0.94 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
			transition={{ duration: 0.24, ease: EASE }}
		>
			<button type="button" className="block w-full text-left" aria-label={`Open ${item.name}`} onClick={onOpen}>
				<motion.div
					layoutId={`sd-cover-${item.id}`}
					transition={{ duration: 0.28, ease: EASE }}
					className={cn(
						"relative aspect-[1.82] overflow-hidden rounded-[8px] bg-canvas",
						(birthing || landed) && "outline outline-1 outline-offset-[3px] outline-muted",
					)}
				>
					{item.art === null ? (
						<EmptyCover />
					) : (
						<ProjectArtwork kind={item.art} className={cn("h-full w-full object-cover object-top", away && "opacity-30 grayscale")} />
					)}
					{item.here.length > 0 && (
						<span className="absolute bottom-[10px] left-[10px] flex items-center gap-[8px] rounded-full bg-bg py-[3px] pr-[10px] pl-[3px]">
							<Faces ids={item.here} size={22} ring="border-bg" />
							<span className="type-detail">{item.here.length === 1 ? `${item.here[0]} is here` : `${item.here.length} here`}</span>
						</span>
					)}
					{away && (
						<span className="absolute inset-0 grid place-items-center">
							<span className="rounded-[7px] border border-border-raised bg-bg px-[12px] py-[6px] type-control opacity-0 transition-opacity duration-150 group-hover/tile:opacity-100">
								Open fetches it
							</span>
						</span>
					)}
					{item.arriving && <ArrivingBar />}
				</motion.div>
				<div className="flex items-baseline justify-between gap-[9px] pt-[14px]">
					<motion.strong layoutId={birthing ? `sd-name-${item.id}` : undefined} className="truncate type-title font-[500]">
						{item.name}
					</motion.strong>
					<span className="shrink-0 text-muted type-detail">{item.frames === 0 ? "no frames yet" : `${item.frames} frames`}</span>
				</div>
				<div className={cn("mt-[7px] flex items-center gap-[12px]", showPlace && "justify-between")}>
					{showPlace && <PlaceLine place={item.place} className="min-w-0" />}
					<span className={cn("shrink-0 type-detail", item.reading ? "text-text" : "text-muted")}>
						{item.reading ?? (away ? "not on this Mac yet" : item.edited)}
					</span>
				</div>
			</button>
		</motion.article>
	);
}

function EmptyCover() {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-[12px] bg-canvas">
			<SpoolMark className="h-[30px] w-[23px] text-thread opacity-80" />
			<span className="text-muted type-detail">no frames yet</span>
		</div>
	);
}

function ArrivingBar() {
	return (
		<span className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-border">
			<motion.span
				className="block h-full bg-text"
				initial={{ width: "8%" }}
				animate={{ width: "100%" }}
				transition={{ duration: 1.6, ease: "linear" }}
			/>
		</span>
	);
}

/**
 * Where a dragged folder will land, drawn before it is let go: the card it
 * becomes, with what spool read inside it. Releasing anywhere drops it here.
 */
function GhostSlot({ ghost, onDrop }: { ghost: Ghost; onDrop: () => void }) {
	const { spot, foundIn, blind, dropped, still } = ghost;
	const finding = spot.finding;
	const starts = finding.kind === "repo" || finding.kind === "plain";
	const verb = dropped ? (starts ? `Start design/ in ${spot.name}` : `Add ${spot.name}`) : starts ? `Drop to start design/ in ${spot.name}` : `Drop to add ${spot.name}`;
	return (
		<motion.article
			layout="position"
			className="relative min-w-0"
			initial={{ opacity: 0, scale: 0.94 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, transition: { duration: 0.1 } }}
			transition={{ duration: 0.22, ease: EASE }}
		>
			<button
				type="button"
				onClick={onDrop}
				className={cn(
					"relative flex aspect-[1.82] w-full flex-col justify-between rounded-[8px] border border-dashed p-[18px] text-left",
					dropped ? "border-border-raised bg-surface" : "border-muted bg-[#ffffff05]",
				)}
			>
				{blind ? (
					<>
						<FolderIcon className="h-[18px] w-[18px] text-text" />
						<span className="type-control text-muted">Let go to add it. The browser shows spool what is inside once it lands.</span>
					</>
				) : (
					<>
						<span className="flex items-center gap-[10px]">
							<FolderIcon className="h-[18px] w-[18px] text-text" />
							<span className="type-heading">{spot.name}</span>
						</span>
						<span className="flex flex-col gap-[6px]">
							<span className="type-detail text-text">{readingOf(finding)}</span>
							<span className="type-detail text-muted">{foundIn ? `found at ${spot.path}` : spot.path}</span>
						</span>
						<span
							className={cn(
								"flex w-max items-center gap-[8px] type-control",
								dropped ? "h-[30px] rounded-[7px] bg-text px-[12px] text-bg" : "text-text",
							)}
						>
							{!dropped && <span className="h-[6px] w-[6px] rounded-full bg-thread" />}
							{verb}
						</span>
					</>
				)}
				{still && !dropped && <DragImage name={spot.name} />}
			</button>
			{foundIn && (
				<p className="mt-[14px] text-muted type-caption">
					A browser hands spool the folder and keeps where it sits. spool tried the name in {foundIn.join(" and ")}, beside folders it already knows, and found it.
				</p>
			)}
		</motion.article>
	);
}

/** the folder under the pointer, as Finder drags it */
function DragImage({ name }: { name: string }) {
	return (
		<span className="pointer-events-none absolute right-[36px] bottom-[22px] flex items-start">
			<svg width="16" height="20" viewBox="0 0 14 16" aria-hidden="true" className="relative z-10">
				<path d="M1 1 13 8.2 7.4 9.3 4.6 14.6Z" fill="#f0efed" stroke="#111" strokeWidth="1" strokeLinejoin="round" />
			</svg>
			<span className="mt-[14px] -ml-[4px] flex items-center gap-[8px] rounded-[7px] border border-border-raised bg-raised py-[6px] pr-[12px] pl-[9px] opacity-90 [transform:rotate(-2deg)]">
				<svg width="18" height="15" viewBox="0 0 18 15" aria-hidden="true">
					<path d="M1 2.2C1 1.5 1.5 1 2.2 1h4.4l1.6 1.8h7.6c.7 0 1.2.5 1.2 1.2v9c0 .7-.5 1.2-1.2 1.2H2.2C1.5 14.2 1 13.7 1 13Z" fill="#5AA5E6" />
					<path d="M1 4.6h16v8.4c0 .7-.5 1.2-1.2 1.2H2.2C1.5 14.2 1 13.7 1 13Z" fill="#7BBDF2" />
				</svg>
				<span className="type-control">{name}</span>
			</span>
		</span>
	);
}

function EmptySection({ section, onNew, onOpenSheet }: { section: Section; onNew: () => void; onOpenSheet: () => void }) {
	return (
		<div className="flex flex-col items-start gap-[14px] pt-[40px]">
			<p className="text-muted type-body">{section === "folders" ? "No folders yet." : "Nothing here yet."}</p>
			<div className="flex gap-[10px]">
				<button type="button" className={HOME_ACTION} onClick={onOpenSheet}>
					Open…
				</button>
				<button type="button" className={HOME_ACTION} onClick={onNew}>
					New draft
				</button>
			</div>
		</div>
	);
}
