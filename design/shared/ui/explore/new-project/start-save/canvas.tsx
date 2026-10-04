import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { ProjectArtwork } from "shared/ui/demo/home-artwork";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { CheckIcon, FolderIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import type { Doc, Item, Shot } from "./fixture";
import { EASE } from "./motion";

const AGENT_W = 360;

/**
 * A canvas, unsaved or not. The unsaved one is a whole project the moment its tab
 * opens: the agent rail is live, the pages rail fills as frames land, and the only
 * thing it lacks is a place. Nothing on the canvas itself changes when it is saved,
 * which is the point: saving is a move, and the agent is told where it moved to.
 */
export function DocCanvas({ doc, onSend, onSave }: { doc: Doc; onSend: (ask: string) => void; onSave: () => void }) {
	const pages = pagesOf(doc.frames);
	const newest = doc.frames[doc.frames.length - 1]?.name;
	const writing = doc.agent === "writing" ? doc.todo[0] : undefined;
	return (
		<CanvasChrome
			pages={pages.map((page, index) => ({
				...page,
				active: index === 0,
				open: true,
				...(newest && newest.startsWith(`${page.name}/`) ? { unseen: { [newest.slice(page.name.length + 1)]: "new" as const } } : {}),
			}))}
			tool={doc.frames.length === 0 ? "none" : "select"}
			railWidth={AGENT_W}
			railLabel="agent"
			rail={<AgentPanel doc={doc} onSend={onSend} />}
		>
			{doc.frames.length === 0 && !writing ? (
				<Empty path={doc.saved ? `${doc.saved.place.path}${doc.saved.place.kind === "folder" ? "/design" : ""}` : doc.dir} unsaved={!doc.saved} onSave={onSave} />
			) : (
				<Field frames={doc.frames} writing={writing} />
			)}
		</CanvasChrome>
	);
}

export function ProjectCanvas({ item }: { item: Item }) {
	const names = ["home", "detail", "flow", "checkout", "settings", "empty"].slice(0, Math.min(item.frames, 6));
	return (
		<CanvasChrome
			pages={item.frames === 0 ? [] : [{ name: "app", frames: names, active: true, open: true }, { name: "site", frames: [] }]}
			tool={item.frames === 0 ? "none" : "select"}
		>
			{item.frames === 0 ? (
				<Empty path={`${item.place.path}${item.place.kind === "folder" ? "/design" : ""}`} unsaved={false} />
			) : (
				<div className="absolute inset-0 grid place-items-center">
					<div className="grid grid-cols-2 gap-[40px]">
						{names.slice(0, 4).map((name, index) => (
							<motion.div key={name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: index * 0.04, ease: EASE }}>
								<p className="mb-[8px] text-muted type-detail">{name}</p>
								<div className="w-[300px] overflow-hidden rounded-[6px]">
									<ProjectArtwork kind={item.art} />
								</div>
							</motion.div>
						))}
					</div>
				</div>
			)}
		</CanvasChrome>
	);
}

function pagesOf(frames: Shot[]): PageRow[] {
	const pages = new Map<string, string[]>();
	for (const frame of frames) {
		const [page, name] = frame.name.split("/");
		pages.set(page!, [...(pages.get(page!) ?? []), name!]);
	}
	return [...pages].map(([name, list]) => ({ name, frames: list }));
}

function Empty({ path, unsaved, onSave }: { path: string; unsaved: boolean; onSave?: () => void }) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="absolute inset-0 flex flex-col items-center justify-center pb-[60px] text-center">
			<SpoolMark className="mb-[24px] h-[38px] w-[30px] text-thread opacity-85" />
			<h1 className="type-heading">Your canvas is ready.</h1>
			<p className="mt-[10px] max-w-[360px] text-muted type-body">Ask your agent on the right, or point Claude Code or Codex at this folder.</p>
			<code className="mt-[26px] text-muted type-detail">{path}</code>
			<button
				type="button"
				className="mt-[14px] inline-flex min-h-[34px] items-center rounded-[7px] border border-border-raised px-[13px] type-control hover:bg-raised"
				onClick={() => void navigator.clipboard?.writeText(path).then(() => setCopied(true))}
			>
				{copied ? "Copied" : "Copy project path"}
			</button>
			{unsaved && (
				<button type="button" onClick={onSave} className="mt-[40px] text-muted type-detail hover:text-text">
					not saved · ⌘S keeps it somewhere you choose
				</button>
			)}
		</div>
	);
}

/* ── the field ─────────────────────────────────────────────── */

const FW = 132;
const FH = 270;

function Field({ frames, writing }: { frames: Shot[]; writing: Shot | undefined }) {
	const slots: (Shot & { pending?: boolean })[] = [...frames, ...(writing ? [{ ...writing, pending: true }] : [])];
	const newest = frames[frames.length - 1]?.name;
	return (
		<div className="absolute inset-0 grid place-items-center pb-[50px]">
			<div className="grid grid-cols-3 gap-x-[44px] gap-y-[34px]">
				<AnimatePresence initial={false}>
					{slots.map((shot) => (
						<motion.div
							key={shot.name}
							layout
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.24, ease: EASE }}
						>
							<p className={cn("mb-[8px] flex h-[16px] items-center gap-[6px] type-detail", shot.pending ? "text-muted" : shot.name === newest ? "text-text" : "text-muted")}>
								{shot.name.split("/")[1]}
								{shot.name === newest && <span className="h-[5px] w-[5px] animate-unseen-in rounded-full bg-text/85" />}
							</p>
							{shot.pending ? (
								<div className="relative grid place-items-center overflow-hidden rounded-[10px] border border-border-raised border-dashed" style={{ width: FW, height: FH }}>
									<span className="text-muted type-detail">writing</span>
									<span className="absolute inset-x-0 top-0 h-px origin-left animate-agent-wind bg-thread" />
								</div>
							) : (
								<motion.div layoutId={`shot-${shot.name}`}>
									<Phone shot={shot} />
								</motion.div>
							)}
						</motion.div>
					))}
				</AnimatePresence>
			</div>
		</div>
	);
}

/** A screen of the coffee cart's app, drawn at canvas size. It is the demo product, in its own clothes. */
export function Phone({ shot }: { shot: Shot }) {
	return (
		<div className="flex flex-col overflow-hidden rounded-[10px] border border-[#E4E4E7] bg-[#FEFEFE] px-[12px] pt-[16px] pb-[12px] font-[Instrument_Sans] text-[#17171A]" style={{ width: FW, height: FH }}>
			<p className="font-semibold text-[13px] leading-[16px] tracking-tight">{shot.title}</p>
			<p className="mt-[2px] text-[#86868B] text-[8px] leading-[11px]">{shot.sub}</p>
			{shot.step !== null && (
				<div className="mt-[12px] flex gap-[3px]">
					{[0, 1, 2, 3].map((index) => (
						<span key={index} className={cn("h-[3px] flex-1 rounded-full", index <= shot.step! ? "bg-[#17171A]" : "bg-[#E4E4E7]")} />
					))}
				</div>
			)}
			{shot.step === 2 && <span className="mx-auto mt-[22px] h-[46px] w-[46px] rounded-full border-[5px] border-[#17171A]" />}
			<div className="mt-[14px] flex flex-col gap-[6px]">
				{Array.from({ length: shot.rows }, (_, index) => (
					<span key={index} className="flex items-center gap-[6px] rounded-[5px] bg-[#EFEFF1] p-[6px]">
						<span className="h-[14px] w-[14px] rounded-full bg-[#D9D9DE]" />
						<span className="h-[4px] flex-1 rounded-full bg-[#D9D9DE]" />
					</span>
				))}
			</div>
			<span className="mt-auto flex h-[24px] items-center justify-center rounded-[5px] bg-[#17171A] font-medium text-[#FEFEFE] text-[9px]">{shot.cta}</span>
		</div>
	);
}

/* ── the agent ─────────────────────────────────────────────── */

function AgentPanel({ doc, onSend }: { doc: Doc; onSend: (ask: string) => void }) {
	const [draft, setDraft] = useState(doc.ask);
	const box = useRef<HTMLTextAreaElement>(null);
	const asked = doc.agent !== "idle";
	const end = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!asked) box.current?.focus();
	}, [asked]);
	useEffect(() => {
		end.current?.scrollIntoView({ block: "end" });
	}, [doc.frames.length, doc.saved]);
	const writing = doc.agent === "writing" ? doc.todo[0] : undefined;
	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			<div className="flex h-11 shrink-0 items-center border-border border-b px-4">
				<span className="truncate text-muted type-value">{asked ? doc.ask : "new thread"}</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-4 pb-4 [scrollbar-width:none]">
				{asked && (
					<>
						<p className="mb-[18px] border-border-raised border-l-2 pl-[12px] type-body">{doc.ask}</p>
						<div className="flex flex-col gap-[10px]">
							{doc.log.map((line, index) =>
								line.kind === "write" ? (
									<motion.p key={line.text} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: EASE }} className="flex items-center gap-[10px] text-muted type-value">
										<CheckIcon className="h-[11px] w-[11px] shrink-0" />
										<span>
											write <span className="text-text">{line.text}</span>
										</span>
									</motion.p>
								) : (
									<motion.p key={`moved-${index}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: EASE }} className="flex items-start gap-[10px] text-muted type-value">
										<FolderIcon className="mt-[2px] h-[12px] w-[12px] shrink-0 text-text" />
										<span>
											moved to <span className="text-text">{line.text}</span>
										</span>
									</motion.p>
								),
							)}
							{writing && (
								<p className="flex items-center gap-[10px] text-muted type-value">
									<span className="h-[11px] w-[11px] shrink-0 animate-agent-spin rounded-full border-[1.5px] border-muted border-t-transparent" />
									<span>
										write <span className="text-text">{writing.name}</span>
									</span>
								</p>
							)}
							{doc.agent === "done" && (
								<motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-[8px] type-body">
									{doc.summary}
								</motion.p>
							)}
						</div>
					</>
				)}
				<div ref={end} />
			</div>
			<div className="shrink-0 border-border border-t p-4">
				<div className={cn("rounded-[10px] border bg-surface p-[12px]", asked ? "border-border" : "border-border-raised")}>
					<textarea
						ref={box}
						value={asked ? "" : draft}
						placeholder={asked ? "say what to change" : "say what to design"}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							event.stopPropagation();
							if (event.key === "Enter" && !event.shiftKey && !asked && draft.trim()) {
								event.preventDefault();
								onSend(draft.trim());
							}
							if ((event.metaKey || event.ctrlKey) && (event.key === "s" || event.key === "o")) {
								event.currentTarget.blur();
								window.dispatchEvent(new KeyboardEvent("keydown", { key: event.key, metaKey: true }));
								event.preventDefault();
							}
						}}
						rows={3}
						className="w-full resize-none bg-transparent text-text outline-none type-body placeholder:text-muted"
					/>
					<div className="mt-[6px] flex items-center justify-between text-muted type-detail">
						<span>Opus · high</span>
						<span>{asked ? (writing ? "writing" : "") : "↵ send"}</span>
					</div>
				</div>
			</div>
		</div>
	);
}
