import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { Faces, TeamMark } from "shared/ui/explore/cloud/home/parts";
import { HOME_ACTION, HOME_ACTION_PRIMARY } from "shared/ui/spool/home-actions";
import { FolderIcon, FrameIcon } from "shared/ui/spool/icons";
import { Kbd } from "./bar";
import { type Doc, type Known, type SaveTo, designPath } from "./fixture";
import { EASE, SHEET } from "./motion";

/**
 * A sheet hangs from the bar. Hung from a tab it starts at that tab's left edge, so
 * it is plainly about that canvas; hung from the window it is centred. Either way
 * the top edge is the bar's own hairline and nothing floats.
 */
export function Sheet({ left, width, children, label }: { left: number | "center"; width: number; children: ReactNode; label: string }) {
	const still = useReducedMotion() === true;
	return (
		<motion.div
			role="dialog"
			aria-label={label}
			{...(still ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : SHEET)}
			className="absolute top-0 z-30 overflow-hidden rounded-b-[12px] border border-border-raised border-t-0 bg-surface"
			style={left === "center" ? { left: `calc(50% - ${width / 2}px)`, width } : { left, width }}
		>
			{children}
		</motion.div>
	);
}

/** height that follows its content, so a sheet changing what it holds grows rather than jumps */
export function Grow({ children, className }: { children: ReactNode; className?: string }) {
	const inner = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number | "auto">("auto");
	useLayoutEffect(() => {
		const element = inner.current;
		if (!element) return;
		const measure = () => setHeight(element.offsetHeight);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return (
		<motion.div animate={{ height }} initial={false} transition={{ duration: 0.22, ease: EASE }} className={cn("overflow-hidden", className)}>
			<div ref={inner}>{children}</div>
		</motion.div>
	);
}

/** keys a sheet answers while it is up; the root hands the keyboard over */
export function useKeys(handler: (event: KeyboardEvent) => void) {
	const latest = useRef(handler);
	latest.current = handler;
	useEffect(() => {
		const listen = (event: KeyboardEvent) => latest.current(event);
		window.addEventListener("keydown", listen);
		return () => window.removeEventListener("keydown", listen);
	}, []);
}

const mod = (event: KeyboardEvent) => event.metaKey || event.ctrlKey;

/* ── save ──────────────────────────────────────────────────── */

type Kind = SaveTo["kind"];

/**
 * ⌘S on an unsaved canvas. A name, and one of three places. Folder opens a short
 * list of the folders spool has been handed; anything else is one more ⌘O away.
 * The last line always says where design/ will be, in the form a terminal prints.
 */
export function SaveSheet({
	doc,
	known,
	initialKind,
	initialFolder,
	closing,
	onSave,
	onCancel,
	onOther,
}: {
	doc: Doc;
	known: Known[];
	initialKind: Kind;
	initialFolder?: string | undefined;
	/** saved because its tab is closing: the button says so */
	closing?: boolean | undefined;
	onSave: (name: string, to: SaveTo) => void;
	onCancel: () => void;
	onOther: (state: { name: string }) => void;
}) {
	const [name, setName] = useState(doc.saved?.name ?? doc.suggest);
	const [kind, setKind] = useState<Kind>(initialKind);
	const free = known.filter((folder) => !folder.holds);
	const [folder, setFolder] = useState(initialFolder ?? free[0]?.path ?? "");
	const field = useRef<HTMLInputElement>(null);
	useEffect(() => {
		field.current?.focus();
		field.current?.select();
	}, []);
	const picked = known.find((entry) => entry.path === folder && !entry.holds);
	const to: SaveTo | null = kind === "folder" ? (picked ? { kind: "folder", folder: picked } : null) : { kind };
	const ready = to !== null && name.trim() !== "";
	const save = () => ready && to && onSave(name.trim(), to);

	useKeys((event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel();
		} else if (event.key === "Enter") {
			event.preventDefault();
			save();
		} else if (mod(event) && event.key.toLowerCase() === "o" && kind === "folder") {
			event.preventDefault();
			onOther({ name });
		} else if (kind === "folder" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
			event.preventDefault();
			const index = free.findIndex((entry) => entry.path === folder);
			const next = free[(index + (event.key === "ArrowDown" ? 1 : -1) + free.length) % free.length];
			if (next) setFolder(next.path);
		}
	});

	const places: { kind: Kind; label: string; sub: string; mark: ReactNode }[] = [
		{ kind: "draft", label: "Drafts", sub: "~/spool", mark: <FrameIcon className="h-[16px] w-[16px]" /> },
		{ kind: "folder", label: "A folder", sub: "beside code", mark: <FolderIcon className="h-[17px] w-[17px]" /> },
		{ kind: "team", label: "Tidemark", sub: "4 people", mark: <TeamMark size={17} /> },
	];

	return (
		<div className="p-[22px] pt-[20px]">
			<div className="mb-[18px] flex items-baseline justify-between">
				<h2 className="type-title">Save {doc.label}</h2>
				<span className="text-muted type-detail">
					{doc.frames.length} frames · {doc.dir}
				</span>
			</div>

			<label className="mb-[6px] block text-muted type-label" htmlFor="save-name">
				Name
			</label>
			<input
				id="save-name"
				ref={field}
				value={name}
				onChange={(event) => setName(event.target.value)}
				spellCheck={false}
				className="mb-[18px] h-[36px] w-full rounded-[7px] border border-border-raised bg-bg px-[11px] text-text outline-none type-control focus:border-muted"
			/>

			<p className="mb-[6px] text-muted type-label">Where</p>
			<div className="grid grid-cols-3 gap-[8px]" role="radiogroup" aria-label="Where">
				{places.map((place) => {
					const on = kind === place.kind;
					return (
						<button
							key={place.kind}
							type="button"
							role="radio"
							aria-checked={on}
							onClick={() => setKind(place.kind)}
							className={cn("relative flex h-[62px] flex-col justify-between rounded-[8px] border px-[11px] py-[9px] text-left", on ? "border-transparent" : "border-border-raised hover:bg-raised/60")}
						>
							{on && <motion.span layoutId="place-on" transition={{ duration: 0.2, ease: EASE }} className="absolute inset-0 rounded-[8px] border border-text/70 bg-raised" />}
							<span className={cn("relative flex items-center gap-[8px] type-control", on ? "text-text" : "text-muted")}>
								{place.mark}
								<span className={on ? "text-text" : "text-text/80"}>{place.label}</span>
							</span>
							<span className="relative text-muted type-detail">{place.sub}</span>
						</button>
					);
				})}
			</div>

			<Grow>
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.div key={kind} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className="pt-[14px]">
						{kind === "draft" && <p className="text-muted type-label">Only on this Mac, until you move it into a folder or a team.</p>}
						{kind === "team" && (
							<div className="flex items-center gap-[12px]">
								<Faces ids={["jonas", "mira", "sam"]} size={22} ring="border-surface" />
								<p className="text-muted type-label">Jonas, Mira and Sam can open it a second after you save. Every save after that reaches them too.</p>
							</div>
						)}
						{kind === "folder" && (
							<div>
								<div className="overflow-hidden rounded-[8px] border border-border-raised bg-bg" role="listbox" aria-label="Folders spool knows">
									{known.map((entry) => {
										const on = entry.path === folder && !entry.holds;
										return (
											<button
												key={entry.path}
												type="button"
												role="option"
												aria-selected={on}
												disabled={Boolean(entry.holds)}
												onClick={() => setFolder(entry.path)}
												className={cn("relative flex h-[34px] w-full items-center gap-[10px] px-[11px] text-left", entry.holds ? "cursor-default" : "hover:bg-surface", on && "bg-raised hover:bg-raised")}
											>
												<span className={cn("grid h-[12px] w-[12px] shrink-0 place-items-center rounded-full border", on ? "border-text" : "border-border-raised")}>
													{on && <motion.span layoutId="folder-on" transition={{ duration: 0.16, ease: EASE }} className="h-[6px] w-[6px] rounded-full bg-text" />}
												</span>
												<span className={cn("min-w-0 flex-1 truncate type-value", entry.holds ? "text-muted/60" : "text-text")}>{entry.path}</span>
												{entry.holds ? (
													<span className="text-muted/60 type-detail">has design/ · {entry.holds}</span>
												) : (
													<>
														{entry.stack && <span className="text-muted type-caption">{entry.stack}</span>}
														{entry.branch && <Branch name={entry.branch} />}
													</>
												)}
											</button>
										);
									})}
									<button type="button" onClick={() => onOther({ name })} className="flex h-[34px] w-full items-center gap-[10px] border-border border-t px-[11px] text-left text-muted hover:bg-surface hover:text-text">
										<FolderIcon className="h-[12px] w-[12px] shrink-0" />
										<span className="flex-1 type-control">Other folder…</span>
										<Kbd>⌘O</Kbd>
									</button>
								</div>
								<p className="mt-[10px] text-muted type-label">
									{picked ? (picked.branch ? `design/ goes beside the code, on ${picked.branch}. The code is left as it is.` : "design/ goes inside this folder. Nothing else in it changes.") : "Pick a folder for design/ to go in."}
								</p>
							</div>
						)}
					</motion.div>
				</AnimatePresence>
			</Grow>

			<div className="mt-[18px] flex items-center gap-[10px] border-border-raised border-t pt-[16px]">
				<code className="min-w-0 flex-1 truncate text-muted type-detail" title={to ? designPath(to, name) : ""}>
					{to ? (
						<>
							→ <span className="text-text">{designPath(to, name)}</span>
						</>
					) : (
						"→ no folder picked"
					)}
				</code>
				<button type="button" className={HOME_ACTION} onClick={onCancel}>
					Cancel
					<Kbd>esc</Kbd>
				</button>
				<button type="button" className={HOME_ACTION_PRIMARY} onClick={save} disabled={!ready}>
					{closing ? "Save and close" : "Save"}
					<kbd className="type-detail text-bg/55">↵</kbd>
				</button>
			</div>
		</div>
	);
}

export function Branch({ name }: { name: string }) {
	return (
		<span className="flex shrink-0 items-center gap-[5px] rounded-[5px] border border-border-raised px-[6px] py-[1px] text-muted type-detail">
			<svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
				<circle cx="3.5" cy="2.5" r="1.4" stroke="currentColor" />
				<circle cx="3.5" cy="9.5" r="1.4" stroke="currentColor" />
				<circle cx="8.5" cy="4" r="1.4" stroke="currentColor" />
				<path d="M3.5 4v4M8.5 5.4c0 2-5 1.4-5 2.7" stroke="currentColor" />
			</svg>
			{name}
		</span>
	);
}

/* ── close ─────────────────────────────────────────────────── */

/**
 * Closing an unsaved tab is the one moment its frames can be lost, so it asks.
 * Quitting does not ask: every unsaved canvas is kept in spool's scratch and its
 * tab comes back with the app, so a quit loses nothing to warn about.
 */
export function CloseAlert({ doc, onSave, onDiscard, onCancel }: { doc: Doc; onSave: () => void; onDiscard: () => void; onCancel: () => void }) {
	const n = doc.frames.length;
	const frames = `${n} ${n === 1 ? "frame" : "frames"}`;
	useKeys((event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel();
		} else if (event.key === "Enter") {
			event.preventDefault();
			onSave();
		} else if (mod(event) && event.key === "Backspace") {
			event.preventDefault();
			onDiscard();
		}
	});
	return (
		<div className="p-[22px] pt-[20px]">
			<h2 className="type-title">Save {doc.label} before closing?</h2>
			<p className="mt-[8px] text-muted type-label">
				{doc.agent === "writing"
					? `Its agent is still writing. Discarding stops it and moves ${frames} to the Trash.`
					: `Discarding moves its ${frames} to the Trash. Saving keeps them in a place you choose.`}
			</p>
			<div className="mt-[20px] flex items-center gap-[10px]">
				<button type="button" className={cn(HOME_ACTION, "mr-auto")} onClick={onDiscard}>
					Discard {frames}
					<Kbd>⌘⌫</Kbd>
				</button>
				<button type="button" className={HOME_ACTION} onClick={onCancel}>
					Cancel
					<Kbd>esc</Kbd>
				</button>
				<button type="button" className={HOME_ACTION_PRIMARY} onClick={onSave}>
					Save…
					<kbd className="type-detail text-bg/55">↵</kbd>
				</button>
			</div>
		</div>
	);
}

