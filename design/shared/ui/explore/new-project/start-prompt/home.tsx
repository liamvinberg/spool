import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Project } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { Face, Faces, TeamMark, member } from "shared/ui/explore/cloud/home/parts";
import { ChevronIcon, FrameIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { StateMark } from "shared/ui/spool/play-rail";
import { Composer, type ComposerProps } from "./composer";
import { FRAMES, TIDEMARK } from "./fixture";
import { ENTER, EASE, type Host, PlaceGlyph } from "./marks";
import { EbbScreen } from "./screens";

/** a Home card: a shared-world project, or one this walk started */
export type Card = Project & { cover?: "ebb" | "empty"; working?: boolean };

export type Scope = "own" | "tidemark";

export function HomeView({
	host,
	scope,
	onScope,
	cards,
	born,
	onOpen,
	composer,
	onDropFolder,
}: {
	host: Host;
	scope: Scope;
	onScope: (scope: Scope) => void;
	cards: Card[];
	/** the card this walk just made, which arrives in the grid rather than appearing */
	born: string | null;
	onOpen: (card: Card) => void;
	composer: ComposerProps;
	/** a folder let go over the window: its name, and whether a path came with it */
	onDropFolder: (name: string) => void;
}) {
	const [over, setOver] = useState(false);
	return (
		<div
			className="relative h-full overflow-hidden bg-bg text-text"
			onDragOver={(event) => {
				event.preventDefault();
				setOver(true);
			}}
			onDragLeave={(event) => {
				if (event.currentTarget === event.target) setOver(false);
			}}
			onDrop={(event) => {
				event.preventDefault();
				setOver(false);
				const item = event.dataTransfer.items[0];
				const entry = item?.webkitGetAsEntry?.();
				onDropFolder(entry?.name ?? event.dataTransfer.files[0]?.name ?? "moodboard");
			}}
		>
			<div className="grid h-full grid-cols-[208px_minmax(0,1fr)]">
				<Sidebar scope={scope} onScope={onScope} />
				<main className="min-w-0 overflow-y-auto px-[48px] pb-[40px] [scrollbar-width:thin] [scrollbar-color:var(--color-border-raised)_transparent]">
					<section className="mx-auto flex w-full max-w-[760px] flex-col pt-[72px] pb-[52px]">
						<h1 className="mb-[22px] type-page">What are we making?</h1>
						<Composer {...composer} />
						<p className="mt-[14px] pl-[2px] text-muted type-label">
							{host === "app"
								? "Drop a folder on this window, or paste a path or a git link, and spool reads what is in it."
								: "Paste a path or a git link and spool reads what is in it. A folder dropped on a browser tab arrives without its path."}
						</p>
					</section>
					<div className="mb-[22px] flex items-baseline justify-between">
						<span className="flex items-baseline gap-[12px]">
							<h2 className="type-title">{scope === "own" ? "Your projects" : TIDEMARK.name}</h2>
							<span className="text-muted type-detail">
								{cards.length} {cards.length === 1 ? "project" : "projects"}
							</span>
						</span>
						<span className="text-muted type-detail">{scope === "own" ? "on this Mac" : "relayed by spool cloud"}</span>
					</div>
					<motion.div layout className="grid grid-cols-3 gap-x-[24px] gap-y-[34px]">
						<AnimatePresence initial={false}>
							{cards.map((card) => (
								<Tile key={card.id} card={card} born={born === card.id} onOpen={() => onOpen(card)} />
							))}
						</AnimatePresence>
					</motion.div>
				</main>
			</div>
			<AnimatePresence>
				{over && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.14 }}
						className="pointer-events-none absolute inset-[10px] z-50 grid place-items-center rounded-[14px] border border-muted border-dashed bg-bg/80"
					>
						<span className="type-heading">Let go to read it</span>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

/* ── the sidebar ────────────────────────────────────────────── */

function Sidebar({ scope, onScope }: { scope: Scope; onScope: (scope: Scope) => void }) {
	const [open, setOpen] = useState(false);
	return (
		<aside className="relative flex h-full flex-col border-border border-r px-[16px] pt-[32px] pb-[22px]">
			<div className="mb-[26px] flex h-[32px] items-center gap-[10px] px-[13px] [font:var(--type-mark)] tracking-[-1px]">
				<SpoolMark className="h-[25px] w-[19px] shrink-0 text-thread" />
				<span>spool</span>
			</div>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="mb-[14px] flex h-[40px] w-full items-center gap-[10px] rounded-[7px] border border-border-raised px-[10px] text-left hover:bg-surface"
			>
				{scope === "own" ? <Face id="ada" size={20} ring="border-transparent" /> : <TeamMark size={20} />}
				<span className="flex-1 type-control">{scope === "own" ? "Your projects" : TIDEMARK.name}</span>
				<ChevronIcon className="h-[10px] w-[10px] rotate-90 text-muted" />
			</button>
			<AnimatePresence>
				{open && (
					<>
						<button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
						<motion.div
							initial={{ opacity: 0, y: -4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
							transition={{ duration: 0.16, ease: EASE }}
							className="absolute top-[134px] right-[16px] left-[16px] z-40 rounded-[9px] border border-border-raised bg-raised p-[4px]"
						>
							{(["own", "tidemark"] as const).map((id) => (
								<button
									key={id}
									type="button"
									onClick={() => {
										onScope(id);
										setOpen(false);
									}}
									className="flex h-[36px] w-full items-center gap-[10px] rounded-[6px] px-[8px] text-left type-control hover:bg-[#ffffff0a]"
								>
									{id === "own" ? <Face id="ada" size={20} ring="border-transparent" /> : <TeamMark size={20} />}
									<span className="flex-1">{id === "own" ? "Your projects" : TIDEMARK.name}</span>
									{scope === id && <span className="h-[6px] w-[6px] rounded-full bg-text" />}
								</button>
							))}
						</motion.div>
					</>
				)}
			</AnimatePresence>
			<nav className="flex flex-col gap-[2px]">
				<span className="flex h-[36px] items-center gap-[12px] rounded-[7px] bg-surface px-[12px] type-control [&>svg]:h-[16px] [&>svg]:w-[16px]">
					<FrameIcon />
					Projects
				</span>
			</nav>
			<div className="mt-auto flex flex-col gap-[10px] pl-[12px] text-muted type-detail">
				{scope === "tidemark" ? (
					<>
						<Faces ids={TIDEMARK.members} size={22} />
						<span>4 members</span>
					</>
				) : (
					<span>On this Mac</span>
				)}
			</div>
		</aside>
	);
}

/* ── a card ─────────────────────────────────────────────────── */

function Tile({ card, born, onOpen }: { card: Card; born: boolean; onOpen: () => void }) {
	const away = card.place.kind === "team" && card.onMac === false;
	const here = card.here ?? [];
	return (
		<motion.article
			layout
			initial={born ? { opacity: 0, scale: 0.94, y: 8 } : false}
			animate={{ opacity: 1, scale: 1, y: 0 }}
			exit={{ opacity: 0, scale: 0.96 }}
			transition={ENTER}
			className="group/tile min-w-0"
		>
			<button type="button" className="block w-full text-left" onClick={onOpen}>
				<div className={cn("relative aspect-[1.82] overflow-hidden rounded-[8px] bg-canvas", born && "ring-1 ring-muted/40")}>
					{card.cover === "ebb" ? (
						<EbbCover />
					) : card.cover === "empty" ? (
						<span className="absolute inset-0 grid place-items-center text-muted type-detail">no frames yet</span>
					) : (
						<ProjectArtwork kind={card.art} className={cn("h-full w-full object-cover object-top", away && "opacity-35 grayscale")} />
					)}
					{card.working && (
						<span className="absolute top-[10px] left-[10px] flex items-center gap-[7px] rounded-full bg-bg py-[3px] pr-[10px] pl-[6px]">
							<StateMark state="running" className="h-3 w-3" />
							<span className="type-detail">agent drawing</span>
						</span>
					)}
					{here.length > 0 && (
						<span className="absolute bottom-[10px] left-[10px] flex items-center gap-[8px] rounded-full bg-bg py-[3px] pr-[10px] pl-[3px]">
							<Faces ids={here} size={22} />
							<span className="type-detail">{here.length === 1 ? `${member(here[0]!).first} is here` : `${here.length} here`}</span>
						</span>
					)}
					{away && (
						<span className="absolute inset-0 grid place-items-center">
							<span className="rounded-[7px] border border-border-raised bg-bg px-[12px] py-[6px] type-control group-hover/tile:bg-raised">Get it</span>
						</span>
					)}
				</div>
				<div className="flex items-baseline justify-between gap-[9px] pt-[14px]">
					<strong className="flex min-w-0 items-center gap-[8px] truncate type-title font-[500]">{card.name}</strong>
					<span className="shrink-0 text-muted type-detail">{card.frames === 0 ? "no frames yet" : `${card.frames} frames`}</span>
				</div>
				<span className="mt-[6px] flex items-center gap-[7px] text-muted type-detail">
					{card.place.kind !== "team" && <PlaceGlyph kind={card.place.kind} size={12} className="h-[12px] w-[12px]" />}
					<span className="truncate">
						{away ? "not on this Mac yet" : card.place.kind === "team" ? card.edited : `${card.place.kind === "draft" ? "Drafts" : card.place.label} · ${card.edited}`}
					</span>
				</span>
			</button>
		</motion.article>
	);
}

/** what the agent drew, as Home's cover: the three Ebb frames on the canvas tone */
export function EbbCover() {
	return (
		<div className="absolute inset-0 flex items-center justify-center gap-[14px] bg-canvas">
			{FRAMES.map((name) => (
				<div key={name} className="relative h-[152px] w-[70px] overflow-hidden rounded-[5px]">
					<div className="origin-top-left" style={{ transform: "scale(0.18)" }}>
						<EbbScreen name={name} />
					</div>
				</div>
			))}
		</div>
	);
}
