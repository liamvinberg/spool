import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Finding } from "shared/lib/explore/new-project/places";
import { cn } from "shared/lib/utils";
import { Faces } from "shared/ui/explore/cloud/home/parts";
import { ArrowRightIcon, ChevronIcon, CloseIcon, FolderIcon } from "shared/ui/spool/icons";
import { StateMark } from "shared/ui/spool/play-rail";
import { GIT_LINK, LISTINGS, PATHISH, TIDEMARK } from "./fixture";
import { ENTER, EASE, type Host, Kbd, PlaceGlyph, type Where, whereLabel } from "./marks";

/**
 * The prompt Home opens on. Whatever goes into it is read as one of three things: an
 * ask (words), a path (anything starting with ~/ or /) or a git link. Handing spool a
 * folder by the chooser, a drop or a path attaches what spool read in it above the
 * words, and the ask then goes to that project instead of a new draft.
 */

export type Reading = Finding | { kind: "known"; id: string; name: string; path: string } | { kind: "nameless"; name: string };

export interface Attached {
	reading: Reading;
	/** spool has finished reading it; until then the card says what it is reading */
	settled: boolean;
}

export interface ComposerProps {
	host: Host;
	text: string;
	onText: (text: string) => void;
	where: Where;
	onWhere: (where: Where) => void;
	menu: boolean;
	onMenu: (open: boolean) => void;
	attached: Attached | null;
	onDetach: () => void;
	/** Enter with words or an attachment; `empty` is ⌘⏎, which starts without asking */
	onStart: (empty: boolean) => void;
	onBring: () => void;
	onRead: (pathOrLink: string) => void;
	/** bump to pull focus back into the field */
	focusKey: number;
	/** the --asking frame opens with the menu's cursor on this row */
	initialHighlight?: number;
}

const OPTIONS = ["draft", "team", "folder"] as const;

export function Composer(props: ComposerProps) {
	const { host, text, onText, where, menu, onMenu, attached, onDetach, onStart, onBring, onRead, focusKey } = props;
	const field = useRef<HTMLTextAreaElement>(null);
	const [focused, setFocused] = useState(false);
	const [hit, setHit] = useState(0);
	const [highlight, setHighlight] = useState(props.initialHighlight ?? OPTIONS.indexOf(where.kind as (typeof OPTIONS)[number]));

	const single = !text.includes("\n");
	const pathMode = single && PATHISH.test(text);
	const linkMode = single && GIT_LINK.test(text.trim());
	const completions = useMemo(() => (pathMode ? complete(text) : null), [pathMode, text]);
	const reading = attached?.reading;
	const blocked = reading?.kind === "nameless";

	useEffect(() => {
		field.current?.focus({ preventScroll: true });
	}, [focusKey]);
	useEffect(() => setHit(0), [text]);
	useLayoutEffect(() => {
		const element = field.current;
		if (element === null) return;
		element.style.height = "auto";
		element.style.height = `${Math.max(56, Math.min(element.scrollHeight, 168))}px`;
	}, [text, attached]);

	const primary = primaryLabel(attached, pathMode || linkMode);
	const ready = pathMode ? (completions?.hits.length ?? 0) > 0 || text.length > 2 : linkMode || (attached?.settled === true && !blocked) || text.trim() !== "";

	const submit = (empty: boolean) => {
		if (pathMode) {
			const pick = completions?.hits[hit];
			onRead(pick !== undefined && completions !== null ? join(completions.parent, pick) : text.trim());
			return;
		}
		if (linkMode) {
			onRead(text.trim());
			return;
		}
		if (blocked) return;
		if (!empty && text.trim() === "" && attached === null) return;
		onStart(empty);
	};

	const pickOption = (option: (typeof OPTIONS)[number]) => {
		onMenu(false);
		if (option === "folder") onBring();
		else props.onWhere({ kind: option });
		field.current?.focus({ preventScroll: true });
	};

	const onKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.nativeEvent.isComposing) return;
		if (menu) {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				setHighlight((index) => (index + (event.key === "ArrowDown" ? 1 : OPTIONS.length - 1)) % OPTIONS.length);
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				pickOption(OPTIONS[highlight] ?? "draft");
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				onMenu(false);
				return;
			}
		}
		if (completions !== null && completions.hits.length > 0) {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				const n = completions.hits.length;
				setHit((index) => (index + (event.key === "ArrowDown" ? 1 : n - 1)) % n);
				return;
			}
			if (event.key === "Tab") {
				event.preventDefault();
				const pick = completions.hits[hit];
				if (pick !== undefined) onText(`${join(completions.parent, pick)}/`);
				return;
			}
		}
		if (event.key === "Escape") {
			event.preventDefault();
			if (text !== "") onText("");
			else if (attached !== null) onDetach();
			return;
		}
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			submit(event.metaKey || event.ctrlKey);
		}
	};

	return (
		<div className="relative">
			<motion.div
				layout
				transition={ENTER}
				className={cn(
					"relative overflow-hidden rounded-[12px] border bg-surface transition-colors duration-150",
					focused || menu ? "border-muted/50" : "border-border-raised",
				)}
			>
				<AnimatePresence initial={false}>
					{attached !== null && (
						<motion.div
							key="card"
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={ENTER}
						>
							<ReadingCard attached={attached} onDetach={onDetach} />
						</motion.div>
					)}
				</AnimatePresence>
				<div className="relative px-[18px] pt-[16px]">
					<textarea
						ref={field}
						aria-label="What are we making?"
						value={text}
						rows={2}
						spellCheck={false}
						placeholder={placeholder(attached)}
						onChange={(event) => onText(event.target.value)}
						onKeyDown={onKey}
						onFocus={() => setFocused(true)}
						onBlur={() => setFocused(false)}
						className={cn(
							"block w-full resize-none bg-transparent text-text outline-none placeholder:text-muted/80",
							pathMode || linkMode ? "font-mono text-md leading-md [font-feature-settings:var(--font-mono--font-feature-settings)]" : "text-lg leading-lg",
						)}
						style={{ height: 56 }}
					/>
				</div>
				<AnimatePresence initial={false}>
					{completions !== null && (
						<motion.div key="paths" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={ENTER}>
							<Completions host={host} parent={completions.parent} hits={completions.hits} at={hit} onPick={(name) => onRead(join(completions.parent, name))} />
						</motion.div>
					)}
					{linkMode && (
						<motion.div key="link" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={ENTER}>
							<p className="px-[18px] pb-[4px] text-muted type-detail">a git link · ⏎ clones it and reads what arrives</p>
						</motion.div>
					)}
				</AnimatePresence>
				<div className="flex items-center justify-between gap-[12px] px-[12px] pt-[8px] pb-[12px]">
					<div className="flex min-w-0 items-center gap-[6px]">
						{attached === null ? (
							<InControl where={where} open={menu} onToggle={() => onMenu(!menu)} />
						) : (
							<Destination reading={attached.reading} />
						)}
						{attached === null && (
							<button
								type="button"
								onClick={onBring}
								className="flex h-[30px] items-center gap-[8px] rounded-[7px] px-[9px] text-muted type-control hover:bg-raised hover:text-text"
							>
								<FolderIcon className="h-[14px] w-[14px]" />
								Bring a folder
								<Kbd>⌘O</Kbd>
							</button>
						)}
					</div>
					<div className="flex shrink-0 items-center gap-[12px]">
						<span className="text-muted type-detail">{hint(attached, pathMode, linkMode, text)}</span>
						<button
							type="button"
							disabled={!ready}
							onClick={() => submit(false)}
							className="flex h-[32px] items-center gap-[8px] rounded-[8px] bg-text pr-[10px] pl-[13px] text-bg type-control transition-opacity duration-150 disabled:opacity-30"
						>
							<AnimatePresence mode="popLayout" initial={false}>
								<motion.span key={primary} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16, ease: EASE }}>
									{primary}
								</motion.span>
							</AnimatePresence>
							<ArrowRightIcon className="h-[14px] w-[14px]" />
						</button>
					</div>
				</div>
			</motion.div>
			<AnimatePresence>
				{menu && attached === null && (
					<InMenu
						where={where}
						highlight={highlight}
						onHighlight={setHighlight}
						onPick={pickOption}
						onClose={() => onMenu(false)}
						host={host}
					/>
				)}
			</AnimatePresence>
		</div>
	);
}

/* ── the in control ─────────────────────────────────────────── */

function InControl({ where, open, onToggle }: { where: Where; open: boolean; onToggle: () => void }) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={open}
			className={cn(
				"flex h-[30px] items-center gap-[8px] rounded-[7px] border pr-[8px] pl-[9px] type-control",
				open ? "border-border-raised bg-raised text-text" : "border-border-raised text-text hover:bg-raised",
			)}
		>
			<span className="text-muted">in</span>
			<motion.span layout="position" className="flex items-center gap-[7px]">
				<PlaceGlyph kind={where.kind} size={14} />
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.span key={whereLabel(where)} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.16, ease: EASE }} className={where.kind === "folder" ? "type-value" : undefined}>
						{whereLabel(where)}
					</motion.span>
				</AnimatePresence>
			</motion.span>
			<ChevronIcon className="h-[10px] w-[10px] rotate-90 text-muted" />
		</button>
	);
}

function InMenu({
	where,
	highlight,
	onHighlight,
	onPick,
	onClose,
	host,
}: {
	where: Where;
	highlight: number;
	onHighlight: (index: number) => void;
	onPick: (option: (typeof OPTIONS)[number]) => void;
	onClose: () => void;
	host: Host;
}) {
	const rows = [
		{ id: "draft" as const, title: "Drafts", path: "~/spool", body: "Only you. Give it a place once it has earned one.", side: null },
		{ id: "team" as const, title: TIDEMARK.name, path: "~/spool/tidemark", body: "Jonas, Mira and Sam see it as the agent draws it.", side: <Faces ids={["jonas", "mira", "sam"]} size={18} ring="border-raised" /> },
		{
			id: "folder" as const,
			title: "A folder…",
			path: "<folder>/design",
			body: host === "app" ? "design/ beside the code, in a repo you choose." : "design/ beside the code. Type the repo's path.",
			side: <Kbd>⌘O</Kbd>,
		},
	];
	return (
		<>
			<button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={onClose} />
			<motion.div
				initial={{ opacity: 0, y: -4, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
				transition={{ duration: 0.18, ease: EASE }}
				className="absolute top-[calc(100%-6px)] left-[12px] z-40 w-[380px] origin-top-left rounded-[10px] border border-border-raised bg-raised p-[4px]"
			>
				<p className="px-[10px] pt-[8px] pb-[6px] text-muted type-detail">where it lives · change it any time</p>
				{rows.map((row, index) => (
					<button
						key={row.id}
						type="button"
						onMouseEnter={() => onHighlight(index)}
						onClick={() => onPick(row.id)}
						className={cn("relative flex w-full items-start gap-[12px] rounded-[7px] px-[10px] py-[9px] text-left", highlight === index && "bg-[#ffffff0a]")}
					>
						{index === 2 && <span className="absolute -top-[2px] right-[10px] left-[10px] h-px bg-border-raised" />}
						<span className="mt-[3px] grid w-[16px] place-items-center">
							<PlaceGlyph kind={row.id} size={16} className="h-[14px] w-[14px]" />
						</span>
						<span className="flex min-w-0 flex-1 flex-col gap-[2px]">
							<span className="flex items-center gap-[8px]">
								<span className="type-control text-text">{row.title}</span>
								<span className="truncate text-muted type-detail">{row.path}</span>
							</span>
							<span className="text-muted type-label">{row.body}</span>
						</span>
						<span className="mt-[2px] flex h-[18px] shrink-0 items-center gap-[8px]">
							{row.side}
							{where.kind === row.id && <span className="h-[6px] w-[6px] rounded-full bg-text" />}
						</span>
					</button>
				))}
				<div className="mt-[2px] flex items-center gap-[10px] border-border-raised border-t px-[10px] pt-[8px] pb-[6px] text-muted type-detail">
					<span>↑↓ choose</span>
					<span>⏎ pick</span>
					<span>esc close</span>
				</div>
			</motion.div>
		</>
	);
}

/** where an attached folder's project lands, said instead of the in control */
function Destination({ reading }: { reading: Reading }) {
	const text =
		reading.kind === "repo" || reading.kind === "plain"
			? `in ${reading.path}/design`
			: reading.kind === "clone"
				? `into ${reading.into}`
				: reading.kind === "fetch"
					? `into ${reading.into}`
					: reading.kind === "nameless"
						? "path unknown"
						: reading.kind === "inside"
							? `opens ${reading.root}`
							: `opens ${reading.path}`;
	return (
		<span className="flex h-[30px] items-center gap-[8px] rounded-[7px] border border-border border-dashed px-[9px] text-muted type-value">
			<FolderIcon className="h-[14px] w-[14px]" />
			{text}
		</span>
	);
}

/* ── the reading ────────────────────────────────────────────── */

function ReadingCard({ attached, onDetach }: { attached: Attached; onDetach: () => void }) {
	const { reading, settled } = attached;
	const said = describe(reading);
	return (
		<div className="relative flex gap-[14px] border-border border-b px-[18px] py-[16px]">
			<span className="relative mt-[2px] grid h-[36px] w-[36px] shrink-0 place-items-center rounded-[8px] border border-border-raised bg-bg">
				{settled ? (
					<motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={ENTER} className="grid place-items-center">
						{reading.kind === "fetch" ? <PlaceGlyph kind="team" size={18} /> : <FolderIcon className="h-[16px] w-[16px] text-text" />}
					</motion.span>
				) : (
					<StateMark state="running" />
				)}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-[3px] pr-[28px]">
				<span className="type-title">{said.title}</span>
				<span className="truncate text-muted type-detail">{settled ? said.meta : `reading ${said.where}…`}</span>
				<AnimatePresence initial={false}>
					{settled && (
						<motion.p
							initial={{ opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ ...ENTER, delay: 0.04 }}
							className="mt-[6px] text-text type-body"
						>
							{said.sentence}
						</motion.p>
					)}
				</AnimatePresence>
			</div>
			<button
				type="button"
				onClick={onDetach}
				title="Take it out (esc)"
				className="absolute top-[14px] right-[14px] grid h-[24px] w-[24px] place-items-center rounded-[6px] text-muted hover:bg-raised hover:text-text"
			>
				<CloseIcon className="h-[9px] w-[9px]" />
			</button>
		</div>
	);
}

export function describe(reading: Reading): { title: string; meta: string; where: string; sentence: string } {
	switch (reading.kind) {
		case "repo":
			return {
				title: reading.name,
				where: reading.path,
				meta: `${reading.path} · ${reading.branch} · ${reading.stack}`,
				sentence: `${reading.name} has no design/ yet. Start one beside the code?`,
			};
		case "project":
			return {
				title: reading.name,
				where: reading.path,
				meta: `${reading.path} · ${reading.branch ?? "no git"} · ${reading.frames} frames`,
				sentence: `${reading.name} already has a design/ with ${reading.frames} frames. Opening it puts it on Home.`,
			};
		case "inside":
			return {
				title: reading.path.split("/").pop() ?? reading.name,
				where: reading.path,
				meta: `${reading.path} · inside ${reading.root}`,
				sentence: `This folder is inside ${reading.name}, which keeps its design/ at ${reading.root} and is already on Home. Open ${reading.name}?`,
			};
		case "plain":
			return {
				title: reading.name,
				where: reading.path,
				meta: `${reading.path} · no git`,
				sentence: `${reading.name} is a plain folder with no git. spool can start design/ in it all the same.`,
			};
		case "clone":
			return {
				title: reading.name,
				where: reading.url,
				meta: `${reading.url} · ${reading.frames} frames`,
				sentence: `${reading.name} is a spool project. Clone it into ${reading.into} and open it?`,
			};
		case "fetch":
			return {
				title: reading.name,
				where: reading.team,
				meta: `${reading.team} · ${reading.frames} frames · not on this Mac`,
				sentence: `Sam made ${reading.name} and it is not on this Mac yet. Get its files into ${reading.into}?`,
			};
		case "known":
			return { title: reading.name, where: reading.path, meta: reading.path, sentence: `${reading.name} is already on Home. Enter opens its tab.` };
		case "nameless":
			return {
				title: reading.name,
				where: reading.name,
				meta: "dropped in a browser · path unknown",
				sentence: `A browser hands spool the folder's name and keeps its path. Type where ${reading.name} is, starting with ~/, or run spool open inside it.`,
			};
	}
}

function primaryLabel(attached: Attached | null, reads: boolean): string {
	if (reads) return "Read";
	if (attached === null) return "Start";
	const reading = attached.reading;
	switch (reading.kind) {
		case "repo":
		case "plain":
			return "Start design/";
		case "project":
		case "inside":
		case "known":
			return `Open ${reading.name}`;
		case "clone":
			return "Clone and open";
		case "fetch":
			return "Get it";
		case "nameless":
			return "Read";
	}
}

function placeholder(attached: Attached | null): string {
	if (attached === null) return "A booking flow for tvärsö's cabins: dates, cabin, pay";
	switch (attached.reading.kind) {
		case "repo":
		case "plain":
			return "What should its first frames be? Enter alone starts design/ empty.";
		case "project":
			return "Enter opens it and puts it on Home.";
		case "nameless":
			return "~/";
		case "clone":
		case "fetch":
			return "Enter gets it and opens it.";
		default:
			return "Enter opens its tab.";
	}
}

function hint(attached: Attached | null, path: boolean, link: boolean, text: string): string {
	if (path) return "tab completes";
	if (link) return "";
	if (attached !== null) return "esc takes it out";
	return text.trim() === "" ? "⌘⏎ starts empty" : "⇧⏎ new line";
}

/* ── paths ──────────────────────────────────────────────────── */

function complete(text: string): { parent: string; hits: string[] } {
	const value = text.trim() === "~" ? "~/" : text.trim();
	const cut = value.lastIndexOf("/");
	const parent = value.slice(0, cut) || "/";
	const partial = value.slice(cut + 1).toLowerCase();
	const listing = LISTINGS[parent] ?? [];
	return { parent, hits: listing.filter((name) => name.toLowerCase().startsWith(partial)) };
}

function join(parent: string, name: string): string {
	return parent.endsWith("/") ? `${parent}${name}` : `${parent}/${name}`;
}

function Completions({ host, parent, hits, at, onPick }: { host: Host; parent: string; hits: string[]; at: number; onPick: (name: string) => void }) {
	return (
		<div className="mx-[10px] mt-[4px] mb-[2px] rounded-[8px] border border-border bg-bg p-[4px]">
			<p className="flex justify-between px-[8px] pt-[4px] pb-[4px] text-muted type-detail">
				<span>{parent}</span>
				<span>{host === "web" ? "listed by spool, since a browser has no folder dialog" : "listed by spool"}</span>
			</p>
			{hits.length === 0 ? (
				<p className="px-[8px] py-[6px] text-muted type-detail">nothing here by that name</p>
			) : (
				hits.map((name, index) => (
					<button
						key={name}
						type="button"
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => onPick(name)}
						className={cn("flex h-[28px] w-full items-center gap-[10px] rounded-[5px] px-[8px] text-left type-value", index === at ? "bg-raised text-text" : "text-muted hover:text-text")}
					>
						<FolderIcon className="h-[13px] w-[13px] shrink-0" />
						<span className="flex-1">{name}</span>
						{index === at && <span className="text-muted type-detail">⏎ read · tab goes in</span>}
					</button>
				))
			)}
		</div>
	);
}
