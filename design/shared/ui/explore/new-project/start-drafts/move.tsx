import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Place } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { TeamMark } from "shared/ui/explore/cloud/home/parts";
import { CheckIcon, FolderIcon, PanelCaret } from "shared/ui/spool/icons";
import { designPath, draftPlace, type Item, readingOf, slugOf, spotsFor, TEAM, teamPlace } from "./fixture";
import type { Host } from "./home";
import { DraftIcon, EASE, Kbd } from "./marks";

type Choice = "drafts" | "folder" | "team";

/**
 * Move to…, under the place chip. Every row says what happens to the files,
 * because the files are the thing an agent is writing into while you choose.
 */
export function MovePopover({ item, host, onMove, onClose }: { item: Item; host: Host; onMove: (place: Place) => void; onClose: () => void }) {
	const [step, setStep] = useState<"list" | "folder">("list");
	const current: Choice = item.place.kind === "draft" ? "drafts" : item.place.kind === "folder" ? "folder" : "team";
	const [at, setAt] = useState<Choice>(current === "drafts" ? "team" : current);
	const choices: Choice[] = ["drafts", "folder", "team"];
	const from = designPath(item);
	const choose = (choice: Choice) => {
		if (choice === "folder") setStep("folder");
		else if (choice === current) onClose();
		else if (choice === "team") onMove(teamPlace(item.name));
		else onMove(draftPlace(item.name));
	};
	useEffect(() => {
		if (step !== "list") return;
		const key = (event: KeyboardEvent) => {
			if (event.target instanceof HTMLInputElement) return;
			const index = choices.indexOf(at);
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setAt(choices[Math.min(choices.length - 1, index + 1)]!);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setAt(choices[Math.max(0, index - 1)]!);
			} else if (event.key === "Enter") {
				event.preventDefault();
				choose(at);
			} else if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			} else if (["1", "2", "3"].includes(event.key)) {
				setAt(choices[Number(event.key) - 1]!);
			}
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	});
	return (
		<>
			<button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={onClose} />
			<motion.div
				role="dialog"
				aria-label="Move to"
				className="absolute top-[40px] right-0 z-40 w-[420px] origin-top-right overflow-hidden rounded-[10px] border border-border-raised bg-surface"
				initial={{ opacity: 0, y: -4, scale: 0.97 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } }}
				transition={{ duration: 0.16, ease: EASE }}
			>
				<AnimatePresence mode="popLayout" initial={false}>
					{step === "list" ? (
						<motion.div key="list" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18, ease: EASE }}>
							<div className="flex items-baseline justify-between border-border-raised border-b px-[16px] pt-[14px] pb-[12px]">
								<span className="type-title">Move {item.name} to…</span>
								<span className="text-muted type-detail">{from}</span>
							</div>
							<div className="p-[6px]">
								<Row
									icon={<DraftIcon className="h-[16px] w-[16px] text-muted" />}
									title="Keep in Drafts"
									n="1"
									current={current === "drafts"}
									at={at === "drafts"}
									onHover={() => setAt("drafts")}
									onPick={() => choose("drafts")}
									says="Stays where it is, on this Mac only."
									files={`${from}`}
								/>
								<Row
									icon={<FolderIcon className="h-[16px] w-[16px] text-muted" />}
									title="Into a folder…"
									n="2"
									current={current === "folder"}
									at={at === "folder"}
									onHover={() => setAt("folder")}
									onPick={() => choose("folder")}
									says="design/ moves beside that folder's code, and its git sees the frames from then on."
									files={`${from} → <folder>/design`}
									more
								/>
								<Row
									icon={<TeamMark size={18} />}
									title={TEAM.name}
									n="3"
									current={current === "team"}
									at={at === "team"}
									onHover={() => setAt("team")}
									onPick={() => choose("team")}
									says="Becomes a team project. jonas, mira and sam get the files, and each save reaches them in about a second. A team project stays in Tidemark."
									files={`${from} → ~/spool/${TEAM.id}/${slugOf(item.name)}`}
								/>
							</div>
							<div className="flex items-center justify-between border-border-raised border-t px-[16px] py-[10px] text-muted type-caption">
								<span>The old path stays as a link, so an agent mid-turn keeps writing.</span>
								<span className="flex gap-[10px]">
									<Kbd>↑↓</Kbd>
									<Kbd>↵</Kbd>
									<Kbd>esc</Kbd>
								</span>
							</div>
						</motion.div>
					) : (
						<motion.div key="folder" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18, ease: EASE }}>
							<FolderStep item={item} host={host} onBack={() => setStep("list")} onMove={onMove} onClose={onClose} />
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</>
	);
}

function Row({
	icon,
	title,
	n,
	says,
	files,
	current,
	at,
	more = false,
	onHover,
	onPick,
}: {
	icon: ReactNode;
	title: string;
	n: string;
	says: string;
	files: string;
	current: boolean;
	at: boolean;
	more?: boolean;
	onHover: () => void;
	onPick: () => void;
}) {
	return (
		<button
			type="button"
			className={cn("relative flex w-full items-start gap-[12px] rounded-[7px] px-[10px] py-[11px] text-left", at && "bg-raised")}
			onMouseEnter={onHover}
			onFocus={onHover}
			onClick={onPick}
		>
			<span className="grid h-[20px] w-[20px] shrink-0 place-items-center">{icon}</span>
			<span className="flex min-w-0 flex-1 flex-col gap-[4px]">
				<span className="flex items-center gap-[8px] type-control">
					{title}
					{current && <span className="text-muted type-detail">here now</span>}
				</span>
				<span className="text-muted type-label">{says}</span>
				<span className="truncate text-muted type-detail">{files}</span>
			</span>
			<span className="flex h-[20px] items-center gap-[8px] text-muted">
				{current ? <CheckIcon className="h-[12px] w-[12px] text-text" /> : more ? <PanelCaret dir="right" className="h-3 w-2" /> : null}
				<Kbd>{n}</Kbd>
			</span>
		</button>
	);
}

/**
 * Choosing the folder. The list is the folder the field names, read by spool the
 * way the shipped picker reads one; a folder that already holds design/ is a
 * project of its own and is not a place to move into.
 */
function FolderStep({ item, host, onBack, onMove, onClose }: { item: Item; host: Host; onBack: () => void; onMove: (place: Place) => void; onClose: () => void }) {
	const [query, setQuery] = useState("~/code/");
	const field = useRef<HTMLInputElement>(null);
	const { spots } = spotsFor(query);
	const open = (kind: string) => kind === "repo" || kind === "plain";
	const usable = spots.filter((spot) => open(spot.finding.kind));
	const [at, setAt] = useState(0);
	const chosen = usable[Math.min(at, usable.length - 1)];
	useEffect(() => {
		field.current?.focus();
	}, []);
	const pick = (key: string) => {
		const spot = spots.find((candidate) => candidate.key === key);
		if (spot === undefined || !open(spot.finding.kind)) return;
		const branch = spot.finding.kind === "repo" ? spot.finding.branch : undefined;
		onMove({ kind: "folder", label: spot.path, path: spot.path, ...(branch ? { branch } : {}) });
	};
	return (
		<div>
			<div className="flex items-center gap-[8px] border-border-raised border-b px-[10px] pt-[10px] pb-[10px]">
				<button type="button" className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] text-muted hover:bg-raised hover:text-text" onClick={onBack} aria-label="Back">
					<PanelCaret dir="left" className="h-3.5 w-2.5" />
				</button>
				<input
					ref={field}
					value={query}
					spellCheck={false}
					aria-label="Folder path"
					className="h-[30px] min-w-0 flex-1 rounded-[6px] bg-bg px-[10px] text-text outline-none type-value"
					onChange={(event) => {
						setQuery(event.target.value);
						setAt(0);
					}}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setAt((value) => Math.min(usable.length - 1, value + 1));
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							setAt((value) => Math.max(0, value - 1));
						}
						if (event.key === "Enter" && chosen) {
							event.preventDefault();
							pick(chosen.key);
						}
						if (event.key === "Escape") {
							event.preventDefault();
							if (query === "~/code/") onBack();
							else setQuery("~/code/");
						}
						if (event.key === "Backspace" && query === "") onBack();
					}}
				/>
			</div>
			<div className="p-[6px]">
				{spots.map((spot) => {
					const can = open(spot.finding.kind);
					const lit = can && chosen?.key === spot.key;
					return (
						<button
							key={spot.key}
							type="button"
							disabled={!can}
							className={cn("flex h-[40px] w-full items-center gap-[10px] rounded-[7px] px-[10px] text-left", lit && "bg-raised", !can && "cursor-default")}
							onMouseEnter={() => can && setAt(usable.indexOf(spot))}
							onClick={() => pick(spot.key)}
						>
							<FolderIcon className={cn("h-[14px] w-[14px] shrink-0", can ? "text-text" : "text-muted opacity-50")} />
							<span className={cn("flex-1 truncate type-control", !can && "text-muted opacity-60")}>{spot.name}</span>
							<span className={cn("type-detail", can ? "text-muted" : "text-muted opacity-60")}>{can ? readingOf(spot.finding) : "has its own design/"}</span>
						</button>
					);
				})}
				{spots.length === 0 && <p className="px-[10px] py-[10px] text-muted type-label">No folder by that name here.</p>}
			</div>
			<div className="border-border-raised border-t px-[16px] py-[11px]">
				{chosen ? (
					<p className="text-muted type-label">
						<span className="text-text">{item.name}</span> moves to <code className="type-detail text-text">{chosen.path}/design</code>. git sees new files there; nothing is committed for you.
					</p>
				) : (
					<p className="text-muted type-label">Pick a folder without its own design/.</p>
				)}
				<div className="mt-[10px] flex items-center justify-between">
					{host === "app" ? (
						<button type="button" className="text-muted type-label hover:text-text" onClick={onClose}>
							Choose in Finder…
						</button>
					) : (
						<span className="text-muted type-caption">These are the folders on the Mac spool runs on.</span>
					)}
					<span className="flex gap-[10px] text-muted">
						<Kbd>↵ move</Kbd>
						<Kbd>esc back</Kbd>
					</span>
				</div>
			</div>
		</div>
	);
}
