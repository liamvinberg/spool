import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { AgentIcon, ArrowRightIcon, ChevronIcon, FolderIcon, FrameIcon, PanelCaret, PropertiesIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { BRAND_FRAMES, type BrandFrame, designPath, type Item, TEAM } from "./fixture";
import { EASE, placeName } from "./marks";

/**
 * The project's canvas as a tab opens it: the pages rail, the viewport and the
 * dock strip. The viewport's ground shares the card cover's layoutId, so the
 * canvas grows out of the card it was opened from.
 */
export function CanvasView({ item, fetched, onCopy }: { item: Item; fetched: number | null; onCopy: (path: string) => void }) {
	const frames = fetched === null ? framesOf(item) : BRAND_FRAMES.slice(0, fetched).map((frame) => frame.name);
	return (
		<div className="flex h-full w-full overflow-hidden bg-bg">
			<motion.aside
				className="flex w-[248px] shrink-0 flex-col border-border border-r bg-bg"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.2, ease: EASE, delay: 0.08 }}
			>
				<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
					<div className="flex items-baseline gap-2">
						<h2 className="font-semibold type-control">Pages</h2>
						<span className="text-muted type-value">{frames.length === 0 ? 0 : 1}</span>
					</div>
					<span className="flex h-7 w-7 items-center justify-center text-muted">
						<PanelCaret dir="left" className="h-3.5 w-2.5" />
					</span>
				</div>
				{frames.length === 0 ? (
					<p className="px-3.5 py-3 text-muted type-detail">{fetched === null ? "no frames yet" : "fetching…"}</p>
				) : (
					<div className="py-2">
						<div className="relative flex h-8 items-center bg-surface pr-1.5">
							<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
							<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
								<ChevronIcon open className="h-2.5 w-2.5" />
							</span>
							<FolderIcon className="mr-2 h-3.5 w-3.5 shrink-0 text-thread" />
							<span className="flex-1 truncate type-value">{pageOf(item)}</span>
							<span className="pr-1 text-muted type-detail">{frames.length}</span>
						</div>
						<div className="relative">
							<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
							<AnimatePresence initial={false}>
								{frames.map((frame) => (
									<motion.div
										key={frame}
										className="relative flex h-7 items-center"
										initial={{ opacity: 0, height: 0 }}
										animate={{ opacity: 1, height: 28 }}
										transition={{ duration: 0.2, ease: EASE }}
									>
										<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
										<span className="flex min-w-0 flex-1 items-center gap-2 pl-[34px]">
											<FrameIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
											<span className="truncate text-muted type-value">{frame}</span>
										</span>
									</motion.div>
								))}
							</AnimatePresence>
						</div>
					</div>
				)}
			</motion.aside>
			<div className="relative min-w-0 flex-1 overflow-hidden bg-bg">
				<motion.div layoutId={`sd-cover-${item.id}`} className="absolute inset-0 bg-canvas" style={{ borderRadius: 0 }} transition={{ duration: 0.28, ease: EASE }} />
				<motion.div
					className="absolute inset-0"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.2, ease: EASE, delay: 0.18 }}
				>
					{fetched !== null ? (
						<Fetching item={item} fetched={fetched} />
					) : item.frames === 0 ? (
						<EmptyProject item={item} onCopy={onCopy} />
					) : (
						<Frames item={item} />
					)}
				</motion.div>
			</div>
			<motion.aside
				className="flex w-11 shrink-0 flex-col items-center gap-1 border-border border-l bg-bg pt-2"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.2, ease: EASE, delay: 0.08 }}
			>
				<span className="flex h-8 w-8 items-center justify-center rounded-sm text-muted">
					<PropertiesIcon className="h-4 w-4" />
				</span>
				<span className="flex h-8 w-8 items-center justify-center rounded-sm text-muted">
					<AgentIcon className="h-4 w-4" />
				</span>
			</motion.aside>
		</div>
	);
}

const ART_FRAMES: Record<string, string[]> = {
	coast: ["home", "stay", "visit", "booking"],
	coffee: ["menu", "cart", "receipt", "loyalty"],
	notes: ["inbox", "note", "archive"],
	studio: ["home", "menu", "cart", "receipt"],
	system: ["home", "pricing", "about"],
	slack: ["channel", "thread", "release"],
};

function framesOf(item: Item): string[] {
	if (item.frames === 0 || item.art === null) return [];
	return ART_FRAMES[item.art] ?? ["home"];
}

function pageOf(item: Item): string {
	return item.name.replace(/\s+/g, "-");
}

function EmptyProject({ item, onCopy }: { item: Item; onCopy: (path: string) => void }) {
	const path = designPath(item);
	const [copied, setCopied] = useState(false);
	const where =
		item.place.kind === "draft"
			? "A draft lives on this Mac until it has a place. Drafts, at the top right, moves it into a folder or to Tidemark."
			: item.place.kind === "team"
				? `${TEAM.name} can open it already. Each save reaches jonas, mira and sam in about a second.`
				: item.place.branch
					? `It sits beside the code in ${placeName(item.place)}, so git sees design/ as new files on ${item.place.branch}.`
					: `It sits inside ${placeName(item.place)}. That folder has no git, so nothing keeps its history until you add it.`;
	return (
		<div className="flex h-full flex-col items-center justify-center px-[40px] pb-[60px] text-center">
			<SpoolMark className="mb-[24px] h-[38px] w-[30px] text-thread opacity-85" />
			<h1 className="type-heading">Your canvas is ready.</h1>
			<p className="mt-[10px] max-w-[360px] text-muted type-body">Ask your agent here, or point Claude Code or Codex at this folder and say what you want to design.</p>
			<div className="mt-[26px] flex flex-col items-center gap-[14px]">
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.code
						key={path}
						className="select-text text-muted type-detail"
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.18, ease: EASE }}
					>
						{path}
					</motion.code>
				</AnimatePresence>
				<button
					type="button"
					className="inline-flex min-h-[34px] items-center gap-[9px] rounded-[7px] border border-border-raised px-[13px] text-text type-control hover:bg-raised [&>svg]:h-[14px] [&>svg]:w-[14px]"
					onClick={() => {
						onCopy(path);
						setCopied(true);
					}}
				>
					{copied ? "Copied" : "Copy project path"}
					<ArrowRightIcon />
				</button>
			</div>
			<p className="mt-[44px] max-w-[400px] border-border border-t pt-[18px] text-muted type-label">{where}</p>
		</div>
	);
}

function Frames({ item }: { item: Item }) {
	const names = framesOf(item).slice(0, 3);
	return (
		<div className="flex h-full items-center justify-center gap-[40px] px-[40px]">
			{names.map((name) => (
				<div key={name} className="w-[300px]">
					<p className="mb-[8px] text-muted type-detail">{name}</p>
					<div className="aspect-[1.6] overflow-hidden rounded-[3px] bg-bg">
						{item.art && <ProjectArtwork kind={item.art} className="h-full w-full" />}
					</div>
				</div>
			))}
		</div>
	);
}

/**
 * A teammate's project arriving on this Mac. The frames land on the canvas as
 * their files land on disk, so the first ones are usable before the last.
 */
function Fetching({ item, fetched }: { item: Item; fetched: number }) {
	const done = fetched >= BRAND_FRAMES.length;
	return (
		<div className="relative h-full">
			<div className="absolute top-[20px] left-1/2 z-10 -translate-x-1/2">
				<div className="flex h-[32px] items-center gap-[10px] overflow-hidden rounded-full border border-border-raised bg-bg pr-[14px] pl-[12px]">
					<span className={cn("h-[6px] w-[6px] rounded-full", done ? "bg-text" : "animate-pulse bg-muted")} />
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={done ? "done" : "fetching"}
							className="type-detail"
							initial={{ opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -6 }}
							transition={{ duration: 0.18, ease: EASE }}
						>
							{done ? `on this Mac · ${designPath(item)}` : `fetching · ${fetched} of ${BRAND_FRAMES.length} frames`}
						</motion.span>
					</AnimatePresence>
				</div>
			</div>
			<div className="grid h-full place-items-center">
				<div className="grid grid-cols-3 gap-x-[44px] gap-y-[34px]">
					{BRAND_FRAMES.map((frame, index) => (
						<div key={frame.name} className="w-[236px]">
							<p className={cn("mb-[7px] type-detail", index < fetched ? "text-muted" : "text-[#3a3a3a]")}>{frame.name}</p>
							<div className="relative aspect-[1.6] overflow-hidden rounded-[3px] bg-[#1b1b1b]">
								<AnimatePresence>
									{index < fetched && (
										<motion.div
											className="absolute inset-0"
											initial={{ opacity: 0, scale: 0.98 }}
											animate={{ opacity: 1, scale: 1 }}
											transition={{ duration: 0.24, ease: EASE }}
										>
											<BrandArt frame={frame} />
										</motion.div>
									)}
								</AnimatePresence>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/** Tidemark's brand refresh, drawn as Tidemark: its own deep sea blue and sand. */
function BrandArt({ frame }: { frame: BrandFrame }) {
	const sea = "#21485A";
	const sand = "#EDE6D8";
	const tide = "#7FB3C8";
	switch (frame.look) {
		case "mark":
			return (
				<div className="grid h-full place-items-center" style={{ background: sea }}>
					<span className="font-semibold text-[34px] tracking-[-1.5px]" style={{ color: sand }}>
						tidemark
					</span>
				</div>
			);
		case "palette":
			return (
				<div className="flex h-full">
					{[sea, "#2F6278", tide, sand, "#D9774B"].map((hue) => (
						<span key={hue} className="flex-1" style={{ background: hue }} />
					))}
				</div>
			);
		case "type":
			return (
				<div className="flex h-full flex-col justify-center gap-[2px] px-[18px]" style={{ background: sand, color: sea }}>
					<span className="text-[40px] leading-none tracking-[-2px]">Aa</span>
					<span className="text-[10px]">Order ahead. Skip the line.</span>
				</div>
			);
		case "buttons":
			return (
				<div className="flex h-full items-center justify-center gap-[8px]" style={{ background: sand }}>
					<span className="rounded-full px-[12px] py-[6px] text-[10px]" style={{ background: sea, color: sand }}>
						Order now
					</span>
					<span className="rounded-full border px-[12px] py-[6px] text-[10px]" style={{ borderColor: sea, color: sea }}>
						Menu
					</span>
				</div>
			);
		case "card":
			return (
				<div className="flex h-full items-center justify-center" style={{ background: tide }}>
					<div className="h-[70%] w-[62%] rounded-[8px] p-[10px]" style={{ background: sand }}>
						<span className="block h-[30%] rounded-[4px]" style={{ background: sea }} />
						<span className="mt-[8px] block h-[6px] w-[70%] rounded-full" style={{ background: sea, opacity: 0.4 }} />
						<span className="mt-[5px] block h-[6px] w-[45%] rounded-full" style={{ background: sea, opacity: 0.25 }} />
					</div>
				</div>
			);
		case "post":
			return (
				<div className="flex h-full flex-col justify-end p-[14px]" style={{ background: "#D9774B", color: sand }}>
					<span className="text-[18px] leading-[1.05] tracking-[-0.5px]">
						New menu,
						<br />
						same harbour.
					</span>
				</div>
			);
		case "email":
			return (
				<div className="flex h-full flex-col gap-[6px] p-[14px]" style={{ background: "#F6F2EA" }}>
					<span className="h-[8px] w-[40%] rounded-full" style={{ background: sea }} />
					<span className="h-[46%] rounded-[4px]" style={{ background: tide }} />
					<span className="h-[5px] w-[80%] rounded-full" style={{ background: sea, opacity: 0.3 }} />
					<span className="h-[5px] w-[60%] rounded-full" style={{ background: sea, opacity: 0.3 }} />
				</div>
			);
		case "deck":
			return (
				<div className="flex h-full flex-col justify-between p-[14px]" style={{ background: sea, color: sand }}>
					<span className="text-[9px] opacity-70">Brand refresh · 2026</span>
					<span className="text-[20px] leading-none tracking-[-0.8px]">Calmer, closer.</span>
				</div>
			);
		case "sign":
			return (
				<div className="flex h-full items-end" style={{ background: "#3B3B3B" }}>
					<div className="mb-[18%] ml-[14%] rounded-[3px] px-[14px] py-[8px] text-[14px] tracking-[-0.4px]" style={{ background: sand, color: sea }}>
						tidemark ⟶
					</div>
				</div>
			);
	}
}
