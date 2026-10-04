import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { Face, Faces, TeamMark } from "shared/ui/explore/cloud/home/parts";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { CheckIcon, ChevronIcon, CloseIcon, FrameIcon, PlusIcon, SearchIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { TEAMS } from "shared/lib/explore/new-project/places";
import { Kbd } from "./bar";
import { Phone } from "./canvas";
import { type Doc, type Item, SCRATCH } from "./fixture";
import { EASE, SETTLE } from "./motion";

export type Team = "own" | "tidemark";

/**
 * Home lists projects, and an unsaved canvas is not one yet. It shows in a strip
 * above the grid instead: every canvas sitting in spool's scratch, open as a tab,
 * with the one thing it is waiting for. Saving one takes it out of the strip and a
 * card is born in the grid of the place it went to.
 */
export function Home({
	team,
	projects,
	docs,
	onTeam,
	onNew,
	onOpen,
	onProject,
	onDoc,
	onSaveDoc,
	onCloseDoc,
	onSeen,
}: {
	team: Team;
	projects: Item[];
	docs: Doc[];
	onTeam: (team: Team) => void;
	onNew: () => void;
	onOpen: () => void;
	onProject: (item: Item) => void;
	onDoc: (id: string) => void;
	onSaveDoc: (id: string) => void;
	onCloseDoc: (id: string) => void;
	onSeen: () => void;
}) {
	const [menu, setMenu] = useState(false);
	const shown = projects.filter((item) => (team === "own" ? item.place.kind !== "team" : item.place.kind === "team"));
	useEffect(() => {
		if (!projects.some((item) => item.born)) return;
		const timer = setTimeout(onSeen, 1800);
		return () => clearTimeout(timer);
	}, [projects, onSeen]);

	return (
		<div className="grid h-full grid-cols-[208px_minmax(0,1fr)] overflow-hidden bg-bg text-text">
			<aside className="relative flex h-full flex-col border-border border-r px-[16px] pt-[32px] pb-[22px]">
				<div className="mb-[26px] flex h-[32px] items-center gap-[10px] px-[13px] [font:var(--type-mark)] tracking-[-1px]">
					<SpoolMark className="h-[25px] w-[19px] shrink-0 text-thread" />
					<span>spool</span>
				</div>
				<button
					type="button"
					onClick={() => setMenu((open) => !open)}
					aria-expanded={menu}
					className="mb-[18px] flex h-[40px] w-full items-center gap-[10px] rounded-[7px] border border-border-raised px-[10px] text-left hover:bg-surface"
				>
					{team === "own" ? <Face id="ada" size={20} ring="border-transparent" /> : <TeamMark />}
					<span className="flex-1 type-control">{team === "own" ? "Your projects" : "Tidemark"}</span>
					<ChevronIcon open={menu} className="h-[10px] w-[10px] text-muted" />
				</button>
				<AnimatePresence>
					{menu && (
						<motion.div
							initial={{ opacity: 0, y: -4, scale: 0.98 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, transition: { duration: 0.1 } }}
							transition={{ duration: 0.16, ease: EASE }}
							className="absolute top-[140px] left-[16px] z-30 w-[244px] origin-top-left rounded-[9px] border border-border-raised bg-raised p-[5px]"
						>
							<SwitchRow mark={<Face id="ada" size={20} ring="border-transparent" />} label="Your projects" detail={`${projects.filter((item) => item.place.kind !== "team").length}`} checked={team === "own"} onPick={() => { onTeam("own"); setMenu(false); }} />
							<SwitchRow mark={<TeamMark />} label="Tidemark" detail={`${TEAMS[0]!.members.length} people`} checked={team === "tidemark"} onPick={() => { onTeam("tidemark"); setMenu(false); }} />
						</motion.div>
					)}
				</AnimatePresence>
				<nav className="flex flex-col gap-[2px]">
					<span aria-current="page" className="flex h-[36px] items-center gap-[12px] rounded-[7px] bg-surface px-[12px] type-control [&>svg]:h-[16px] [&>svg]:w-[16px]">
						<FrameIcon />
						Projects
					</span>
				</nav>
				<span className="mt-auto pl-[12px] text-muted type-detail">On this Mac</span>
			</aside>

			<main className="min-w-0 overflow-y-auto px-[48px] pt-[46px] pb-[40px] [scrollbar-width:thin]">
				<header className="mb-[30px] flex items-center justify-between gap-[25px]">
					<div className="flex items-center gap-[16px]">
						<h1 className="type-page">Projects</h1>
						{team === "tidemark" && <Faces ids={TEAMS[0]!.members} />}
					</div>
					<div className="flex items-center gap-[13px]">
						<label className="flex h-[35px] w-[200px] items-center gap-[10px] rounded-[7px] border border-border px-[11px] text-muted">
							<SearchIcon className="h-3 w-3 shrink-0" />
							<span className="flex-1 type-control">{team === "own" ? "Search projects" : "Search Tidemark"}</span>
							<Kbd>/</Kbd>
						</label>
						<button type="button" className={HOME_ACTION} onClick={onOpen}>
							Open…
							<Kbd>⌘O</Kbd>
						</button>
						<button type="button" className={HOME_ACTION_PRIMARY} onClick={onNew}>
							<PlusIcon className="h-[10px] w-[10px]" />
							New project
							<kbd className="type-detail text-bg/55">N</kbd>
						</button>
					</div>
				</header>

				<AnimatePresence initial={false}>
					{docs.length > 0 && (
						<motion.section
							key="strip"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.26, ease: EASE }}
							className="overflow-hidden"
						>
							<div className="mb-[12px] flex items-baseline justify-between">
								<h2 className="flex items-baseline gap-[8px] type-title">
									Unsaved
									<span className="text-muted type-detail">{docs.length}</span>
								</h2>
								<span className="text-muted type-detail">{SCRATCH} · kept when spool quits</span>
							</div>
							<div className="flex flex-wrap gap-[12px] pb-[34px]">
								<AnimatePresence initial={false} mode="popLayout">
									{docs.map((doc) => (
										<DocChip key={doc.id} doc={doc} onOpen={() => onDoc(doc.id)} onSave={() => onSaveDoc(doc.id)} onClose={() => onCloseDoc(doc.id)} />
									))}
								</AnimatePresence>
							</div>
						</motion.section>
					)}
				</AnimatePresence>

				<p className="mb-[22px] text-muted type-detail">
					{shown.length} {shown.length === 1 ? "project" : "projects"}
					{team === "tidemark" && " · saves relay to everyone in Tidemark"}
				</p>
				<motion.div layout className="grid grid-cols-3 gap-x-[24px] gap-y-[34px]">
					<AnimatePresence initial={false}>
						{shown.map((item) => (
							<Card key={item.id} item={item} onOpen={() => onProject(item)} />
						))}
					</AnimatePresence>
				</motion.div>
			</main>
		</div>
	);
}

function SwitchRow({ mark, label, detail, checked, onPick }: { mark: React.ReactNode; label: string; detail: string; checked: boolean; onPick: () => void }) {
	return (
		<button type="button" onClick={onPick} className={cn("flex h-[36px] w-full items-center gap-[10px] rounded-[6px] px-[9px] text-left hover:bg-surface", checked && "bg-surface")}>
			<span className="grid w-[20px] place-items-center">{mark}</span>
			<span className="flex-1 type-control">{label}</span>
			<span className="text-muted type-detail">{detail}</span>
			<span className="grid w-[12px] place-items-center">{checked && <CheckIcon className="h-[12px] w-[12px]" />}</span>
		</button>
	);
}

/** An unsaved canvas, small: its frames as a contact sheet, what it is waiting on, and Save. */
function DocChip({ doc, onOpen, onSave, onClose }: { doc: Doc; onOpen: () => void; onSave: () => void; onClose: () => void }) {
	const writing = doc.agent === "writing";
	return (
		<motion.div
			layout
			initial={{ opacity: 0, scale: 0.96 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
			transition={{ duration: 0.22, ease: EASE }}
			className="group/doc relative flex h-[76px] w-[372px] items-center gap-[14px] rounded-[9px] border border-border p-[8px] pr-[12px] hover:border-border-raised"
		>
			<button type="button" onClick={onOpen} className="absolute inset-0 rounded-[9px]" aria-label={`Open ${doc.label}`} />
			<Contact frames={doc.frames.length} className="h-[58px] w-[100px]" />
			<div className="pointer-events-none min-w-0 flex-1">
				<p className="flex items-center gap-[7px] type-control">
					<span className="truncate">{doc.label}</span>
					<span className="h-[6px] w-[6px] shrink-0 rounded-full bg-text/80" />
				</p>
				<p className="mt-[3px] truncate text-muted type-detail">
					{doc.frames.length === 0 ? "no frames yet" : `${doc.frames.length} frames`}
					{" · "}
					{writing ? "agent writing" : doc.since}
				</p>
			</div>
			<div className="absolute right-[10px] flex items-center gap-[4px] bg-bg pl-[8px] opacity-0 transition-opacity duration-100 group-focus-within/doc:opacity-100 group-hover/doc:opacity-100">
				<button type="button" onClick={onSave} className={cn(HOME_ACTION, "min-h-[28px] px-[10px]")}>
					Save…
				</button>
				<button type="button" onClick={onClose} aria-label={`Close ${doc.label}`} className="grid h-[28px] w-[28px] place-items-center rounded-[6px] text-muted hover:bg-raised hover:text-text">
					<CloseIcon className="h-[9px] w-[9px]" />
				</button>
			</div>
		</motion.div>
	);
}

/** A canvas too small to read, which is the point: how many frames, laid out. */
export function Contact({ frames, className }: { frames: number; className?: string }) {
	return (
		<div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-[6px] bg-canvas", className)}>
			{frames === 0 ? (
				<span className="text-muted/50 type-detail">empty</span>
			) : (
				<div className="grid grid-cols-4 gap-[4px]">
					{Array.from({ length: Math.min(frames, 8) }, (_, index) => (
						<motion.span
							key={index}
							initial={{ opacity: 0, scale: 0.6 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.2, ease: EASE }}
							className="block h-[20px] w-[11px] rounded-[2px] bg-[#EDEDEB]"
						/>
					))}
				</div>
			)}
		</div>
	);
}

/** Home's cover tile. A teammate's project not on this Mac yet is dimmed and still opens: opening it is fetching it. */
function Card({ item, onOpen }: { item: Item; onOpen: () => void }) {
	const away = item.place.kind === "team" && item.onMac === false;
	const where =
		item.place.kind === "draft"
			? "drafts"
			: item.place.kind === "folder"
				? `${item.place.path.split("/").pop()}${item.place.branch ? ` · ${item.place.branch}` : ""}`
				: null;
	return (
		<motion.article
			layout
			initial={item.born ? { opacity: 0, scale: 0.94 } : false}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.28, ease: SETTLE, layout: { duration: 0.28, ease: SETTLE } }}
			className="group/card min-w-0"
		>
			<button type="button" className="block w-full text-left" onClick={onOpen}>
				<div className="relative aspect-[1.82] overflow-hidden rounded-[8px] bg-canvas">
					{item.shots && item.shots.length > 0 ? (
						<div className="absolute inset-0 flex items-center justify-center gap-[14px]">
							{item.shots.slice(0, 4).map((shot) => (
								<div key={shot.name} className="h-[149px] w-[73px] shrink-0 overflow-hidden">
									<div className="origin-top-left scale-[0.55]">
										<Phone shot={shot} />
									</div>
								</div>
							))}
						</div>
					) : item.frames === 0 ? (
						<span className="absolute inset-0 grid place-items-center text-muted/60 type-detail">no frames yet</span>
					) : (
						<ProjectArtwork kind={item.art} className={cn("h-full w-full object-cover object-top", away && "opacity-35 grayscale")} />
					)}
					{item.born && (
						<motion.span
							initial={{ opacity: 1 }}
							animate={{ opacity: 0 }}
							transition={{ delay: 1, duration: 0.6 }}
							className="pointer-events-none absolute inset-0 rounded-[8px] ring-1 ring-text/70 ring-inset"
						/>
					)}
					{item.here && item.here.length > 0 && (
						<span className="absolute bottom-[10px] left-[10px] flex items-center gap-[8px] rounded-full bg-bg py-[3px] pr-[10px] pl-[3px]">
							<Faces ids={item.here} size={22} />
							<span className="type-detail">{item.here.length === 1 ? `${item.here[0]} is here` : `${item.here.length} here`}</span>
						</span>
					)}
					{away && (
						<span className="absolute inset-0 grid place-items-center">
							<span className="rounded-[7px] border border-border-raised bg-bg px-[12px] py-[6px] type-control group-hover/card:border-muted">Get it</span>
						</span>
					)}
				</div>
				<div className="flex items-baseline justify-between gap-[9px] pt-[14px]">
					<strong className="truncate type-title font-[500]">{item.name}</strong>
					<span className="shrink-0 text-muted type-detail">{item.frames === 0 ? "no frames yet" : `${item.frames} frames`}</span>
				</div>
				<span className="mt-[6px] block truncate text-muted type-detail">
					{away ? "not on this Mac yet" : where ? `${where} · ${item.edited}` : item.edited}
				</span>
			</button>
		</motion.article>
	);
}
