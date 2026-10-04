import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { type Place, type PlaceKind, type Project, UNTITLED } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { Faces } from "shared/ui/explore/cloud/home/parts";
import { ArrowRightIcon } from "shared/ui/spool/icons";
import { FinderSheet, SpoolBrowser } from "./choosers";
import { DISK, isSafeName, nameOf, read } from "./fixture";
import { BIRTH, BranchGlyph, EASE, type Host, Kbd, PlaceGlyph, Sheet, Swap } from "./parts";

const slug = (name: string) => name.trim().replace(/\s+/g, "-").toLowerCase();

/**
 * New project, in one step: a name and a place, then Create. The place is a
 * segmented control because the three answers are the whole set, and the path
 * under it is the honest receipt: it is the folder agents start writing into
 * the moment Create is pressed.
 *
 * Folder… is the only segment that asks a second question. In the app macOS's
 * own panel drops over the window; in a web page spool's browser opens inside
 * the sheet, because a page cannot ask the Finder for a path.
 */
export function NewSheet({
	host,
	initialPlace,
	initialFolder = null,
	own,
	team,
	onCreate,
	onOpenInstead,
	onClose,
}: {
	host: Host;
	initialPlace: PlaceKind;
	initialFolder?: string | null;
	own: Project[];
	team: Project[];
	onCreate: (project: { name: string; place: Place }) => void;
	/** the chosen folder already holds a project: hand it to Open… */
	onOpenInstead: (path: string) => void;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	const [place, setPlace] = useState<PlaceKind>(initialPlace);
	const [folder, setFolder] = useState<string | null>(initialFolder);
	const [choosing, setChoosing] = useState(false);
	const before = useRef<PlaceKind>(initialPlace);
	const input = useRef<HTMLInputElement>(null);
	const segments = useRef<(HTMLButtonElement | null)[]>([]);

	const reading = folder ? read(folder, own) : null;
	const taken = reading && (reading.kind === "project" || reading.kind === "known" || reading.kind === "inside");
	const typed = name.trim();
	const finalName = place === "folder" && folder ? nameOf(folder) : typed || freeUntitled(own, team, place);
	const path =
		place === "draft" ? `~/spool/${slug(finalName)}` : place === "team" ? `~/spool/tidemark/${slug(finalName)}` : folder ? `${folder}/design` : null;
	const problem =
		place !== "folder" && typed !== "" && !isSafeName(typed)
			? "Use a name without slashes or a leading dot."
			: place === "draft" && typed !== "" && `~/spool/${slug(typed)}` in DISK
				? `~/spool/${slug(typed)} is already a project.`
				: place === "team" && team.some((project) => project.name === typed)
					? `Tidemark already has a project called ${typed}.`
					: null;
	const ready = path !== null && problem === null && !taken && !choosing;

	useEffect(() => {
		input.current?.focus();
	}, []);

	/** a click on Folder… asks for the folder at once; arrowing past it only selects it */
	const pick = (next: PlaceKind, ask = true) => {
		if (next === "folder") {
			before.current = place === "folder" ? before.current : place;
			setPlace("folder");
			if (ask) setChoosing(true);
			return;
		}
		setChoosing(false);
		setPlace(next);
	};
	const create = () => {
		if (place === "folder" && folder === null && !choosing) {
			setChoosing(true);
			return;
		}
		if (!ready || path === null) return;
		const kind = place;
		const where: Place =
			kind === "draft"
				? { kind, label: "Drafts", path }
				: kind === "team"
					? { kind, label: "Tidemark", path }
					: { kind, label: folder!, path: folder!, ...(reading?.kind === "repo" ? { branch: reading.branch } : {}) };
		onCreate({ name: finalName, place: where });
	};
	const order: PlaceKind[] = ["draft", "folder", "team"];
	const arrows = (event: KeyboardEvent) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		event.preventDefault();
		const index = order.indexOf(place) + (event.key === "ArrowRight" ? 1 : -1);
		const next = order[(index + order.length) % order.length]!;
		if (document.activeElement?.getAttribute("role") === "radio") segments.current[order.indexOf(next)]?.focus();
		pick(next, false);
	};

	return (
		<Sheet label="New project" title="New project" onClose={onClose} birth={BIRTH} width={560}>
			<div
				onKeyDown={(event) => {
					const target = event.target as HTMLElement;
					if (event.key === "Enter" && !event.nativeEvent.isComposing && target.tagName !== "BUTTON") {
						event.preventDefault();
						create();
					}
					if (target instanceof HTMLInputElement && target.value !== "" && !target.readOnly) return;
					arrows(event);
				}}
			>
				<div className="px-[22px] pt-[18px]">
					<input
						ref={input}
						value={place === "folder" && folder ? nameOf(folder) : name}
						readOnly={place === "folder" && folder !== null}
						onChange={(event) => setName(event.target.value)}
						placeholder={freeUntitled(own, team, place)}
						aria-label="Project name"
						spellCheck={false}
						autoComplete="off"
						className="h-[40px] w-full bg-transparent text-text caret-thread outline-none [font:var(--type-heading)] placeholder:text-muted read-only:text-muted"
					/>
				</div>
				<div className="px-[22px] pt-[12px]">
					<div role="radiogroup" aria-label="Place" className="relative grid grid-cols-3 rounded-[8px] border border-border-raised bg-bg p-[3px]">
						{order.map((kind, index) => {
							const on = place === kind;
							const label = kind === "draft" ? "Drafts" : kind === "team" ? "Tidemark" : folder ? nameOf(folder) : "Folder…";
							return (
								<button
									key={kind}
									ref={(node) => {
										segments.current[index] = node;
									}}
									type="button"
									role="radio"
									aria-checked={on}
									tabIndex={on ? 0 : -1}
									onClick={() => pick(kind)}
									className={cn("relative flex h-[32px] items-center justify-center gap-[8px] rounded-[6px] type-control", on ? "text-text" : "text-muted hover:text-text")}
								>
									{on && <motion.span layoutId="start-sheet-segment" className="absolute inset-0 rounded-[6px] border border-border-raised bg-raised" transition={{ duration: 0.2, ease: EASE }} />}
									<span className="relative flex min-w-0 items-center gap-[8px]">
										<PlaceGlyph kind={kind} className="shrink-0" />
										<span className="truncate">{label}</span>
									</span>
								</button>
							);
						})}
					</div>
				</div>

				<AnimatePresence initial={false}>
					{choosing && host === "web" && (
						<motion.div
							key="browser"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.22, ease: EASE }}
							className="mt-[16px] overflow-hidden"
						>
							<SpoolBrowser
								start={folder ?? "~/code"}
								known={own.map((project) => project.place.path)}
								onChoose={(path) => {
									setFolder(path);
									setChoosing(false);
								}}
								onCancel={() => {
									setChoosing(false);
									if (!folder) setPlace(before.current);
								}}
							/>
						</motion.div>
					)}
				</AnimatePresence>

				{!(choosing && host === "web") && (
					<div className="px-[22px] pt-[18px] pb-[20px]">
						<Swap id={`${place}:${folder ?? ""}:${choosing}`}>
							<Receipt place={place} path={path} reading={reading} choosing={choosing} host={host} />
						</Swap>
						{taken && folder && (
							<p className="mt-[12px] flex items-center justify-between gap-[12px] rounded-[8px] border border-border-raised px-[12px] py-[10px] type-label">
								<span>{nameOf(folder)} already holds a spool project.</span>
								<button type="button" onClick={() => onOpenInstead(folder)} className="shrink-0 text-text underline underline-offset-[3px]">
									Open it instead
								</button>
							</p>
						)}
						{problem && <p className="mt-[10px] text-thread type-label">{problem}</p>}
					</div>
				)}

				{!(choosing && host === "web") && <footer className="flex h-[56px] items-center justify-between border-border-raised border-t px-[16px] pl-[22px]">
					<span className="flex items-center gap-[14px] text-muted type-caption">
						<span className="flex items-center gap-[5px]">
							<Kbd>←</Kbd>
							<Kbd>→</Kbd>
							place
						</span>
						<span className="flex items-center gap-[5px]">
							<Kbd>↵</Kbd>
							create
						</span>
					</span>
					<span className="flex items-center gap-[8px]">
						<button type="button" onClick={onClose} className="h-[32px] rounded-[7px] px-[12px] text-muted type-control hover:text-text">
							Cancel
						</button>
						<button
							type="button"
							onClick={create}
							disabled={!ready && !(place === "folder" && folder === null)}
							className="inline-flex h-[32px] items-center gap-[10px] rounded-[7px] bg-text px-[12px] text-bg type-control disabled:opacity-35"
						>
							{place === "team" ? "Create in Tidemark" : place === "folder" && folder === null ? "Choose folder…" : "Create"}
							<ArrowRightIcon className="h-[14px] w-[14px]" />
						</button>
					</span>
				</footer>}
			</div>
			<AnimatePresence>
				{choosing && host === "app" && (
					<FinderSheet
						start={folder ?? "~/code"}
						prompt="Choose"
						onChoose={(path) => {
							setFolder(path);
							setChoosing(false);
							input.current?.focus();
						}}
						onCancel={() => {
							setChoosing(false);
							if (!folder) setPlace(before.current);
							input.current?.focus();
						}}
					/>
				)}
			</AnimatePresence>
		</Sheet>
	);
}

function freeUntitled(own: Project[], team: Project[], place: PlaceKind): string {
	const names = new Set((place === "team" ? team : own).map((project) => project.name));
	if (!names.has(UNTITLED)) return UNTITLED;
	let n = 2;
	while (names.has(`${UNTITLED}-${n}`)) n++;
	return `${UNTITLED}-${n}`;
}

/** The path line and the one sentence that says what living there means. */
function Receipt({
	place,
	path,
	reading,
	choosing,
	host,
}: {
	place: PlaceKind;
	path: string | null;
	reading: ReturnType<typeof read> | null;
	choosing: boolean;
	host: Host;
}) {
	if (path === null) {
		return (
			<>
				<p className="text-muted type-value">{choosing ? (host === "app" ? "choosing in Finder…" : "choose a folder") : "no folder chosen"}</p>
				<p className="mt-[8px] text-muted type-label">design/ goes inside the folder you choose, beside whatever is already there. A repository keeps it in git with the code.</p>
			</>
		);
	}
	const cut = path.lastIndexOf("/") + 1;
	return (
		<>
			<p className="flex items-center gap-[8px] type-value">
				<span className="truncate">
					<span className="text-muted">{path.slice(0, cut)}</span>
					<span className="text-text">{path.slice(cut)}</span>
				</span>
				{reading?.kind === "repo" && (
					<span className="flex shrink-0 items-center gap-[5px] text-muted type-detail">
						<BranchGlyph className="h-[11px] w-[11px]" />
						{reading.branch}
					</span>
				)}
			</p>
			<p className="mt-[8px] flex items-center gap-[10px] text-muted type-label">
				{place === "draft" && "Kept on this Mac, outside any repository. It can move into a folder or Tidemark later."}
				{place === "folder" &&
					(reading?.kind === "repo"
						? `Beside the ${reading.stack} code in ${reading.name}. It is committed with the repository.`
						: reading?.kind === "plain"
							? `Inside ${reading.name}. There is no git here, so nothing keeps its history yet.`
							: null)}
				{place === "team" && (
					<>
						<Faces ids={["jonas", "mira", "sam"]} size={18} ring="border-surface" />
						<span>Jonas, Mira and Sam get it too. Each save reaches them in about a second.</span>
					</>
				)}
			</p>
		</>
	);
}
