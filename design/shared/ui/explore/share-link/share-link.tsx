import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { MenuItem, MenuRule } from "shared/ui/spool/context-menu";
import { SpoolShell } from "shared/ui/spool/shell";
import "./share-link.css";

/**
 * The share link, reworked (explore/share/link and explore/share/updates).
 *
 * One thing is true in every take: the link belongs to the frame. It is made
 * from the frame's menu, it is reported on the frame's label, and it is
 * managed from a popover that opens beside the frame. There is no sheet in the
 * middle of the screen and no tray in the corner; the label chip is the
 * progress, the status and the door back in.
 *
 * The link exists before the upload finishes. spool reserves the address the
 * moment you ask, so Copy works at once and the files land behind it. The
 * timings here are the ones to build towards: a first share of kaffe's two
 * frames is 30 files and 560 kb, an update is only the files that changed.
 *
 * Takes: `popover` asks who can open it first, `instant` copies first and asks
 * only the first time. Updates: `manual` waits for Update, `follow` publishes
 * when the agent's turn ends or your edits settle.
 */

const EASE = [0.22, 0.61, 0.36, 1] as const;
const FILES = 30;
const URL = "cart-k7f2q.onspool.page";
const INCLUDED = ["cart", "receipt"];

export type LinkTake = "popover" | "instant";
export type UpdateTake = "manual" | "follow";
export type LinkStage = "none" | "uploading" | "interrupted" | "live" | "behind" | "agent" | "updating";
export type Access = "invited" | "public";
type Panel = "compose" | "manage";

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
	{ name: "site", frames: ["landing", "pricing"] },
	{ name: "directing", frames: [] },
];

export interface ShareLinkProps {
	take: LinkTake;
	updates?: UpdateTake;
	/** where the walk starts */
	stage?: LinkStage;
	menu?: boolean;
	panel?: Panel | undefined;
	stopping?: boolean;
	/** the instant take's first share ever: it has no access to reuse yet */
	first?: boolean;
	access?: Access;
	/** a frozen moment of the upload, 0 to 1, for a still */
	progress?: number;
	copied?: boolean;
	toast?: string | undefined;
	/** a push has just landed: the label says "updated" for a moment */
	fresh?: boolean;
	caption: string;
}

export function ShareLink({
	take,
	updates = "manual",
	stage: initialStage = "none",
	menu: initialMenu = false,
	panel: initialPanel,
	stopping: initialStopping = false,
	first = false,
	access: initialAccess = "invited",
	progress: initialProgress,
	copied: initialCopied = false,
	toast: initialToast,
	fresh: initialFresh = false,
	caption,
}: ShareLinkProps) {
	const reduced = useReducedMotion() ?? false;
	const [stage, setStage] = useState<LinkStage>(initialStage);
	const [menu, setMenu] = useState<{ x: number; y: number } | null>(initialMenu ? { x: 420, y: 300 } : null);
	const [panel, setPanel] = useState<Panel | undefined>(initialPanel);
	const [stopping, setStopping] = useState(initialStopping);
	const [access, setAccess] = useState<Access>(initialAccess);
	const [recipients, setRecipients] = useState<string[]>(
		first || take === "popover" ? ["alex@kaffe.se"] : ["alex@kaffe.se", "sam@kaffe.se"],
	);
	const [known, setKnown] = useState(!first);
	const [files, setFiles] = useState(Math.round((initialProgress ?? (initialStage === "none" ? 0 : 1)) * FILES));
	const [total, setTotal] = useState(initialStage === "updating" ? 3 : FILES);
	const [copied, setCopied] = useState(initialCopied);
	const [changes, setChanges] = useState(initialStage === "behind" ? 3 : 0);
	const [following, setFollowing] = useState(updates === "follow");
	const [updated, setUpdated] = useState<"just now" | "2 min ago">("2 min ago");
	// the label says "updated" for a moment after a push lands, then settles back to "shared"
	const [fresh, setFresh] = useState(initialFresh);
	const [toast, setToast] = useState<string | undefined>(initialToast);
	const [running, setRunning] = useState(initialProgress === undefined && !initialFresh && !initialCopied);
	const shared = stage !== "none";

	// the upload, simulated at the speed the rework aims for
	useEffect(() => {
		if (!running || (stage !== "uploading" && stage !== "updating")) return;
		if (files >= total) {
			const settle = window.setTimeout(() => {
				setStage("live");
				setUpdated("just now");
				setFresh(total !== FILES);
				setChanges(0);
			}, 260);
			return () => window.clearTimeout(settle);
		}
		const step = window.setTimeout(() => setFiles((count) => Math.min(total, count + (total > 5 ? 2 : 1))), 90);
		return () => window.clearTimeout(step);
	}, [running, stage, files, total]);

	// the agent's turn, simulated: it writes for a while, then stops
	useEffect(() => {
		if (stage !== "agent") return;
		const done = window.setTimeout(() => {
			if (following) startUpload(3);
			else {
				setStage("behind");
				setChanges(3);
			}
		}, 2600);
		return () => window.clearTimeout(done);
	}, [stage, following]);

	useEffect(() => {
		if (!copied || !running) return;
		const fade = window.setTimeout(() => setCopied(false), 1600);
		return () => window.clearTimeout(fade);
	}, [copied, running]);

	useEffect(() => {
		if (!fresh || !running) return;
		const settle = window.setTimeout(() => setFresh(false), 2400);
		return () => window.clearTimeout(settle);
	}, [fresh, running]);

	useEffect(() => {
		if (toast === undefined || !running) return;
		const fade = window.setTimeout(() => setToast(undefined), 2600);
		return () => window.clearTimeout(fade);
	}, [toast, running]);

	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (stopping) setStopping(false);
			else if (panel !== undefined) setPanel(undefined);
			else setMenu(null);
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, [stopping, panel]);

	function startUpload(count: number) {
		setRunning(true);
		setTotal(count);
		setFiles(0);
		setStage(count === FILES ? "uploading" : "updating");
	}
	function create() {
		setKnown(true);
		startUpload(FILES);
		setPanel(take === "instant" ? undefined : "manage");
		copyNow();
	}
	function copyNow() {
		setCopied(true);
		setRunning(true);
		void navigator.clipboard?.writeText(`https://${URL}`).catch(() => undefined);
	}
	function stop() {
		setStopping(false);
		setPanel(undefined);
		setStage("none");
		setFiles(0);
		setChanges(0);
		setToast("Stopped sharing cart");
		setRunning(true);
	}
	function restart() {
		setStage("none");
		setPanel(undefined);
		setMenu({ x: 420, y: 300 });
		setStopping(false);
		setFiles(0);
		setChanges(0);
		setCopied(false);
		setToast(undefined);
		setKnown(!first);
		setRunning(true);
	}

	const menuItems = menu && (
		<ShareMenu
			at={menu}
			take={take}
			shared={shared}
			onShare={() => {
				setMenu(null);
				if (take === "instant" && known) {
					copyNow();
					startUpload(FILES);
				} else setPanel("compose");
			}}
			onCopy={() => {
				setMenu(null);
				copyNow();
			}}
			onManage={() => {
				setMenu(null);
				setPanel("manage");
			}}
			onStop={() => {
				setMenu(null);
				setPanel("manage");
				setStopping(true);
			}}
		/>
	);

	return (
		<div className="relative h-full" onPointerDown={() => setMenu(null)}>
			<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]}>
				<CanvasChrome pages={PAGES} selected="cart" tool="select" rail={null}>
					<Frame left={16} top={130} screen="menu" />
					<Frame
						left={290}
						top={150}
						screen="cart"
						selected
						writing={stage === "agent"}
						chip={
							<Chip
								stage={stage}
								copied={copied}
								files={files}
								total={total}
								changes={changes}
								fresh={fresh}
								reduced={reduced}
								onOpen={() => setPanel("manage")}
							/>
						}
						onMenu={(at) => setMenu(at)}
					/>
					<Frame left={876} top={110} screen="receipt" />
					{menuItems}
					<AnimatePresence>
						{panel !== undefined && (
							<Popover key="popover" reduced={reduced} onClose={() => setPanel(undefined)}>
								{panel === "compose" && !shared ? (
									<Compose
										take={take}
										access={access}
										onAccess={setAccess}
										recipients={recipients}
										onRecipients={setRecipients}
										onCreate={create}
									/>
								) : (
									<Manage
										stage={stage}
										files={files}
										total={total}
										copied={copied}
										changes={changes}
										updated={updated}
										access={access}
										onAccess={setAccess}
										recipients={recipients}
										onRecipients={setRecipients}
										updates={updates}
										following={following}
										onFollowing={setFollowing}
										stopping={stopping}
										onStopping={setStopping}
										reduced={reduced}
										onCopy={copyNow}
										onUpdate={() => startUpload(3)}
										onRetry={() => {
											setStage(total === FILES ? "uploading" : "updating");
											setRunning(true);
										}}
										onStop={stop}
									/>
								)}
							</Popover>
						)}
					</AnimatePresence>
					<AnimatePresence>
						{toast !== undefined && (
							<motion.div
								key={toast}
								role="status"
								initial={{ opacity: 0, y: reduced ? 0 : 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0 }}
								transition={{ duration: reduced ? 0 : 0.22, ease: EASE }}
								className="absolute bottom-[96px] left-1/2 z-30 -ml-[96px] w-[192px] rounded-md border border-border-raised bg-raised px-3.5 py-2.5 text-center text-text type-control"
							>
								{toast}
							</motion.div>
						)}
					</AnimatePresence>
				</CanvasChrome>
			</SpoolShell>
			<DemoBar caption={caption}>
				{stage !== "none" && stage !== "agent" && stage !== "uploading" && stage !== "updating" && (
					<button type="button" onClick={() => setStage("agent")}>
						Agent edits cart
					</button>
				)}
				{(stage === "uploading" || stage === "updating") && (
					<button
						type="button"
						onClick={() => {
							setRunning(false);
							setStage("interrupted");
						}}
					>
						Drop the connection
					</button>
				)}
				<button type="button" onClick={restart}>
					Restart
				</button>
			</DemoBar>
		</div>
	);
}

function DemoBar({ caption, children }: { caption: string; children: ReactNode }) {
	return (
		<div className="absolute inset-x-0 bottom-0 z-40 flex h-10 items-center justify-between border-border-raised border-t bg-bg px-[18px] text-muted type-detail">
			<span>prototype · simulated upload</span>
			<span>{caption}</span>
			<div className="flex gap-4 [&_button]:cursor-pointer [&_button]:text-text [&_button:hover]:text-thread">
				{children}
			</div>
		</div>
	);
}

function Frame({
	left,
	top,
	screen,
	selected = false,
	writing = false,
	chip,
	onMenu,
}: {
	left: number;
	top: number;
	screen: CoffeeScreenName;
	selected?: boolean;
	writing?: boolean;
	chip?: ReactNode;
	onMenu?: (at: { x: number; y: number }) => void;
}) {
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top }}>
			<div className="flex h-4 w-[240px] min-w-0 items-center gap-2 type-value">
				<span className={cn("min-w-0 truncate", selected ? "text-thread" : "text-muted")}>{screen}</span>
				{chip}
			</div>
			<div
				className="relative h-[520px] w-[240px]"
				onContextMenu={(event) => {
					if (onMenu === undefined) return;
					event.preventDefault();
					const box = event.currentTarget.offsetParent?.getBoundingClientRect();
					onMenu({
						x: event.clientX - (box?.left ?? 0) + left,
						y: event.clientY - (box?.top ?? 0) + top,
					});
				}}
			>
				<CoffeeScreen screen={screen} />
				{writing && <div className="sl-writing pointer-events-none absolute inset-[17.5%_3%_74%] rounded-md border-[1.5px] border-thread bg-thread/10" />}
				{selected && <Selection />}
			</div>
		</div>
	);
}

function Selection() {
	return (
		<>
			<div className="pointer-events-none absolute -inset-[3px] rounded-[14px] border-[1.5px] border-thread" />
			{[
				"-left-[7px] -top-[7px]",
				"-right-[7px] -top-[7px]",
				"-bottom-[7px] -left-[7px]",
				"-bottom-[7px] -right-[7px]",
			].map((position) => (
				<span
					key={position}
					className={cn(
						"pointer-events-none absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread",
						position,
					)}
				/>
			))}
		</>
	);
}

/**
 * The right-click menu with sharing in it. Before the link exists it is one
 * row; after, the row becomes the three verbs a live link has, so ending it
 * is never buried inside the thing that made it.
 */
function ShareMenu({
	at,
	take,
	shared,
	onShare,
	onCopy,
	onManage,
	onStop,
}: {
	at: { x: number; y: number };
	take: LinkTake;
	shared: boolean;
	onShare: () => void;
	onCopy: () => void;
	onManage: () => void;
	onStop: () => void;
}) {
	return (
		<div
			role="menu"
			className="absolute z-30 flex w-[200px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit"
			style={{ left: at.x, top: at.y }}
			onPointerDown={(event) => event.stopPropagation()}
			onContextMenu={(event) => event.preventDefault()}
		>
			<MenuItem label="Play from here" keys="P" />
			<MenuItem label="Copy path" />
			<MenuItem label="Reload frame" keys="R" />
			<MenuRule />
			<MenuItem label="Tidy page" keys="⇧A" />
			<MenuItem label="Export as PNG" />
			<MenuRule />
			{shared ? (
				<>
					<MenuItem label="Copy link" keys="⇧S" onClick={onCopy} />
					<MenuItem label="Sharing…" onClick={onManage} />
					<MenuItem label="Stop sharing…" onClick={onStop} />
				</>
			) : (
				<MenuItem label={take === "instant" ? "Copy share link" : "Share link…"} keys="⇧S" onClick={onShare} />
			)}
			<MenuRule />
			<MenuItem label="Move to Trash" keys="⌫" />
		</div>
	);
}

/**
 * What the label says about the link, at the one size the canvas keeps
 * legible at any zoom. It is the whole progress surface: a ring that fills as
 * the files land, a dot once the link opens, a hollow dot while your work has
 * moved past what the link shows. Pressing it opens the popover.
 */
function Chip({
	stage,
	copied,
	files,
	total,
	changes,
	fresh,
	reduced,
	onOpen,
}: {
	stage: LinkStage;
	copied: boolean;
	files: number;
	total: number;
	changes: number;
	fresh: boolean;
	reduced: boolean;
	onOpen: () => void;
}) {
	if (stage === "none") return null;
	const busy = stage === "uploading" || stage === "updating";
	const word = copied
		? "link copied"
		: stage === "uploading"
			? `uploading ${Math.round((files / total) * 100)}%`
			: stage === "updating"
				? "updating"
				: stage === "interrupted"
					? "paused · retry"
					: stage === "behind"
						? `${changes} changes`
						: stage === "agent"
							? "agent editing"
							: fresh
								? "updated"
								: "shared";
	const glyph = copied ? (
		<Check />
	) : busy ? (
		<Ring fraction={files / total} />
	) : stage === "agent" ? (
		<Spinner />
	) : (
		<Dot hollow={stage === "behind" || stage === "interrupted"} />
	);
	return (
		<motion.button
			type="button"
			layout={!reduced}
			transition={{ duration: reduced ? 0 : 0.18, ease: EASE }}
			initial={{ opacity: 0, x: reduced ? 0 : -4 }}
			animate={{ opacity: 1, x: 0 }}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={onOpen}
			aria-label={`Sharing: ${word}`}
			className={cn(
				"flex h-4 shrink-0 cursor-pointer items-center gap-1.5 rounded-xs px-1 -mx-1 type-detail transition-colors hover:bg-surface",
				copied || stage === "interrupted" ? "text-thread" : stage === "live" ? "text-text" : "text-muted",
			)}
		>
			<span className="flex h-2.5 w-2.5 items-center justify-center text-thread">{glyph}</span>
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.span
					key={word.replace(/\d+%/u, "%")}
					initial={{ opacity: 0, y: reduced ? 0 : 3 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: reduced ? 0 : -3 }}
					transition={{ duration: reduced ? 0 : 0.17, ease: EASE }}
				>
					{word}
				</motion.span>
			</AnimatePresence>
		</motion.button>
	);
}

function Dot({ hollow }: { hollow: boolean }) {
	return <span className={cn("h-1.5 w-1.5 rounded-full", hollow ? "border border-thread" : "bg-thread")} />;
}
function Ring({ fraction }: { fraction: number }) {
	return (
		<svg viewBox="0 0 10 10" className="h-2.5 w-2.5 -rotate-90" fill="none" aria-hidden="true">
			<circle cx="5" cy="5" r="3.75" strokeWidth="1.5" className="sl-ring-track" />
			<circle
				cx="5"
				cy="5"
				r="3.75"
				strokeWidth="1.5"
				pathLength={1}
				strokeDasharray="1"
				strokeDashoffset={1 - Math.max(0.06, fraction)}
				className="sl-ring-fill"
			/>
		</svg>
	);
}
function Spinner() {
	return (
		<svg viewBox="0 0 10 10" className="sl-spin h-2.5 w-2.5" fill="none" aria-hidden="true">
			<circle cx="5" cy="5" r="3.75" strokeWidth="1.5" className="sl-ring-track" />
			<circle cx="5" cy="5" r="3.75" strokeWidth="1.5" pathLength={1} strokeDasharray="0.3 0.7" stroke="currentColor" />
		</svg>
	);
}
function Check() {
	return (
		<svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
			<motion.path
				d="M1.8 5.2 4 7.3 8.2 2.8"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				initial={{ pathLength: 0 }}
				animate={{ pathLength: 1 }}
				transition={{ duration: 0.22, ease: EASE }}
			/>
		</svg>
	);
}

/**
 * Beside the frame, level with its label: the popover grows out of the
 * label's row, so it reads as the frame's own and never as a modal over the
 * canvas. The canvas stays live under it and clicking away closes it.
 */
function Popover({ children, reduced, onClose }: { children: ReactNode; reduced: boolean; onClose: () => void }) {
	const body = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number | "auto">("auto");
	useEffect(() => {
		const node = body.current;
		if (node === null) return;
		// offsetHeight, not the bounding box: the box is scaled while the popover grows in
		const measure = () => setHeight(node.offsetHeight);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return (
		<>
			<button
				type="button"
				aria-label="Close sharing"
				tabIndex={-1}
				className="absolute inset-0 z-20 cursor-default"
				onPointerDown={(event) => {
					event.stopPropagation();
					onClose();
				}}
			/>
			<motion.section
				role="dialog"
				aria-label="Share cart"
				initial={{ opacity: 0, scale: reduced ? 1 : 0.97, x: reduced ? 0 : -6 }}
				animate={{ opacity: 1, scale: 1, x: 0, height }}
				exit={{ opacity: 0, scale: reduced ? 1 : 0.98, transition: { duration: reduced ? 0 : 0.12 } }}
				transition={{ duration: reduced ? 0 : 0.2, ease: EASE }}
				style={{ left: 546, top: 150, transformOrigin: "top left" }}
				className="absolute z-30 w-[312px] overflow-hidden rounded-md border border-border-raised bg-raised"
				onPointerDown={(event) => event.stopPropagation()}
			>
				<div ref={body}>{children}</div>
			</motion.section>
		</>
	);
}

function Header({ status }: { status?: ReactNode }) {
	return (
		<header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-3">
			<div className="flex min-w-0 flex-col">
				<h2 className="text-text type-title">Share cart</h2>
				<Scope />
			</div>
			{status}
		</header>
	);
}

/** what the link carries, said once: the entry and every frame a walk from it can reach */
function Scope() {
	const [open, setOpen] = useState(false);
	return (
		<button
			type="button"
			className="flex cursor-pointer items-center gap-1 text-left text-muted type-detail hover:text-text"
			aria-expanded={open}
			onClick={() => setOpen(!open)}
		>
			{open ? INCLUDED.join(" → ") : `from cart · ${INCLUDED.length} frames`}
		</button>
	);
}

function Compose({
	take,
	access,
	onAccess,
	recipients,
	onRecipients,
	onCreate,
}: {
	take: LinkTake;
	access: Access;
	onAccess: (access: Access) => void;
	recipients: string[];
	onRecipients: (next: string[]) => void;
	onCreate: () => void;
}) {
	return (
		<>
			<Header />
			<div className="flex flex-col gap-3 px-4 pb-4">
				<AccessField access={access} onAccess={onAccess} recipients={recipients} onRecipients={onRecipients} />
				<button
					type="button"
					disabled={access === "invited" && recipients.length === 0}
					className="h-8 cursor-pointer rounded-sm bg-thread text-on-thread type-control transition-transform active:scale-[0.98] disabled:cursor-default disabled:opacity-50"
					onClick={onCreate}
				>
					{take === "instant" ? "Create and copy link" : "Create link"}
				</button>
				{take === "instant" && (
					<p className="text-muted type-caption">Next time, Copy share link reuses who you picked here.</p>
				)}
			</div>
		</>
	);
}

/**
 * Who can open it: two answers side by side, because there are only two and
 * a select hides the one you did not pick. Invited shows its people as chips
 * you can take out; typing an address and pressing Enter or comma adds one.
 */
function AccessField({
	access,
	onAccess,
	recipients,
	onRecipients,
}: {
	access: Access;
	onAccess: (access: Access) => void;
	recipients: string[];
	onRecipients: (next: string[]) => void;
}) {
	const [draft, setDraft] = useState("");
	const [problem, setProblem] = useState(false);
	const add = () => {
		const next = draft
			.split(/[\s,;]+/u)
			.map((value) => value.trim().toLowerCase())
			.filter(Boolean);
		if (next.length === 0) return;
		if (next.some((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value))) {
			setProblem(true);
			return;
		}
		onRecipients([...new Set([...recipients, ...next])]);
		setDraft("");
		setProblem(false);
	};
	return (
		<div className="flex flex-col gap-2">
			<div className="grid grid-cols-2 rounded-sm border border-border-raised bg-surface p-[2px]" role="radiogroup">
				{(["invited", "public"] as const).map((value) => (
					<button
						key={value}
						type="button"
						role="radio"
						aria-checked={access === value}
						className={cn(
							"relative h-7 cursor-pointer rounded-xs type-label transition-colors",
							access === value ? "text-text" : "text-muted hover:text-text",
						)}
						onClick={() => onAccess(value)}
					>
						{access === value && (
							<motion.span
								layoutId="sl-access"
								className="absolute inset-0 rounded-xs bg-raised"
								transition={{ duration: 0.18, ease: EASE }}
							/>
						)}
						<span className="relative">{value === "invited" ? "Invited people" : "Anyone with the link"}</span>
					</button>
				))}
			</div>
			{access === "invited" ? (
				<div
					className={cn(
						"flex min-h-8 flex-wrap items-center gap-1 rounded-sm border bg-surface px-1.5 py-1",
						problem ? "border-thread" : "border-border-raised focus-within:border-muted",
					)}
				>
					{recipients.map((email) => (
						<span key={email} className="flex h-5 items-center gap-1 rounded-xs bg-raised pr-1 pl-1.5 text-text type-detail">
							{email}
							<button
								type="button"
								aria-label={`Remove ${email}`}
								className="cursor-pointer text-muted hover:text-text"
								onClick={() => onRecipients(recipients.filter((value) => value !== email))}
							>
								×
							</button>
						</span>
					))}
					<input
						aria-label="Add an email address"
						placeholder={recipients.length === 0 ? "name@company.com" : "Add another"}
						value={draft}
						onChange={(event) => {
							setDraft(event.target.value);
							setProblem(false);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === ",") {
								event.preventDefault();
								add();
							}
							if (event.key === "Backspace" && draft === "") onRecipients(recipients.slice(0, -1));
						}}
						onBlur={add}
						className="h-5 min-w-[96px] flex-1 bg-transparent px-1 text-text type-detail outline-none placeholder:text-muted/60"
					/>
				</div>
			) : null}
			<p className={cn("type-caption", problem ? "text-thread" : "text-muted")}>
				{problem
					? "That address is missing something."
					: access === "invited"
						? "They sign in with that address to open it."
						: "Anyone who has the link can open it, no sign-in."}
			</p>
		</div>
	);
}

function Manage({
	stage,
	files,
	total,
	copied,
	changes,
	updated,
	access,
	onAccess,
	recipients,
	onRecipients,
	updates,
	following,
	onFollowing,
	stopping,
	onStopping,
	reduced,
	onCopy,
	onUpdate,
	onRetry,
	onStop,
}: {
	stage: LinkStage;
	files: number;
	total: number;
	copied: boolean;
	changes: number;
	updated: string;
	access: Access;
	onAccess: (access: Access) => void;
	recipients: string[];
	onRecipients: (next: string[]) => void;
	updates: UpdateTake;
	following: boolean;
	onFollowing: (next: boolean) => void;
	stopping: boolean;
	onStopping: (next: boolean) => void;
	reduced: boolean;
	onCopy: () => void;
	onUpdate: () => void;
	onRetry: () => void;
	onStop: () => void;
}) {
	const [editing, setEditing] = useState(false);
	const busy = stage === "uploading" || stage === "updating";
	const fraction = files / total;
	const status =
		stage === "uploading"
			? `${files} of ${total} files`
			: stage === "updating"
				? `${changes || 3} changes`
				: stage === "interrupted"
					? "paused"
					: stage === "behind"
						? `${changes} changes`
						: stage === "agent"
							? "agent editing"
							: `updated ${updated}`;
	const fade = {
		initial: { opacity: 0, y: reduced ? 0 : 4 },
		animate: { opacity: 1, y: 0 },
		exit: { opacity: 0 },
		transition: { duration: reduced ? 0 : 0.17, ease: EASE },
	};
	return (
		<>
			<Header status={<span className="shrink-0 text-muted type-detail">{status}</span>} />
			<div className="flex flex-col gap-3 px-4 pb-3">
				{/* the link, usable from the moment it was asked for */}
				<div className="relative flex h-8 items-center overflow-hidden rounded-sm border border-border-raised bg-surface pl-2.5">
					<span className={cn("min-w-0 flex-1 truncate type-detail", busy ? "text-muted" : "text-text")}>{URL}</span>
					<button
						type="button"
						className="relative flex h-full w-[68px] shrink-0 cursor-pointer items-center justify-center border-border-raised border-l text-text type-label transition-colors hover:bg-raised"
						onClick={onCopy}
					>
						<AnimatePresence mode="popLayout" initial={false}>
							<motion.span key={copied ? "copied" : "copy"} {...fade} className="flex items-center gap-1">
								{copied ? (
									<>
										<span className="flex h-2.5 w-2.5 text-thread">
											<Check />
										</span>
										Copied
									</>
								) : (
									"Copy"
								)}
							</motion.span>
						</AnimatePresence>
					</button>
					<span
						className="sl-hairline absolute inset-x-0 bottom-0 h-px bg-thread"
						style={{ transform: `scaleX(${busy || stage === "interrupted" ? fraction : 1})`, opacity: busy || stage === "interrupted" ? 1 : 0 }}
					/>
				</div>
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.div key={stage === "updating" ? "uploading" : stage} {...fade}>
						{busy ? (
							<p className="text-muted type-caption">
								{stage === "uploading"
									? "It opens for them once the last file lands."
									: "People on the old version keep it until they reload."}
							</p>
						) : stage === "interrupted" ? (
							<div className="flex items-center justify-between gap-3">
								<p className="text-muted type-caption">Dropped at {files} of {total} files.</p>
								<SmallButton onClick={onRetry}>Retry</SmallButton>
							</div>
						) : stage === "behind" ? (
							<div className="flex items-center justify-between gap-3">
								<p className="text-muted type-caption">cart changed since the link was updated.</p>
								<SmallButton primary onClick={onUpdate}>
									Update
								</SmallButton>
							</div>
						) : stage === "agent" ? (
							<p className="text-muted type-caption">
								{following ? "The link updates when the agent's turn ends." : "The agent is changing cart."}
							</p>
						) : null}
					</motion.div>
				</AnimatePresence>
			</div>
			<div className="flex flex-col border-border-raised border-t">
				<Row
					label={access === "invited" ? "Invited people" : "Anyone with the link"}
					value={access === "invited" ? `${recipients.length}` : "public"}
					open={editing}
					onClick={() => setEditing(!editing)}
				/>
				<AnimatePresence initial={false}>
					{editing && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: reduced ? 0 : 0.2, ease: EASE }}
							className="overflow-hidden"
						>
							<div className="px-4 pt-1 pb-3">
								<AccessField
									access={access}
									onAccess={onAccess}
									recipients={recipients}
									onRecipients={onRecipients}
								/>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
				{updates === "follow" && (
					<label className="flex h-9 cursor-pointer items-center justify-between px-4 text-text type-label hover:bg-surface/60">
						Keep it up to date
						<Toggle on={following} onChange={onFollowing} />
					</label>
				)}
			</div>
			<footer className="flex h-10 items-center justify-between border-border-raised border-t px-4">
				<AnimatePresence mode="popLayout" initial={false}>
					{stopping ? (
						<motion.div key="stopping" {...fade} className="flex w-full items-center justify-between gap-2">
							<span className="text-text type-label">Stop it for everyone?</span>
							<div className="flex gap-1.5">
								<SmallButton onClick={() => onStopping(false)}>Keep</SmallButton>
								<SmallButton primary onClick={onStop}>
									Stop link
								</SmallButton>
							</div>
						</motion.div>
					) : (
						<motion.div key="rest" {...fade} className="flex w-full items-center justify-between">
							<a
								href={`https://${URL}`}
								data-go="explore/share/share-guest"
								className="text-muted type-label hover:text-text"
								onClick={(event) => event.preventDefault()}
							>
								Open link ↗
							</a>
							<button
								type="button"
								className="cursor-pointer text-muted type-label transition-colors hover:text-thread"
								onClick={() => onStopping(true)}
							>
								Stop sharing
							</button>
						</motion.div>
					)}
				</AnimatePresence>
			</footer>
		</>
	);
}

function Row({ label, value, open, onClick }: { label: string; value: string; open: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			aria-expanded={open}
			className="flex h-9 cursor-pointer items-center justify-between px-4 text-left text-text type-label hover:bg-surface/60"
			onClick={onClick}
		>
			{label}
			<span className="flex items-center gap-2 text-muted type-detail">
				{value}
				<svg
					viewBox="0 0 10 10"
					className={cn("h-2 w-2 transition-transform", open && "rotate-180")}
					fill="none"
					aria-hidden="true"
				>
					<path d="m2 3.5 3 3 3-3" stroke="currentColor" strokeWidth="1.3" />
				</svg>
			</span>
		</button>
	);
}

function Toggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			className={cn(
				"relative h-4 w-7 cursor-pointer rounded-full transition-colors",
				on ? "bg-thread" : "bg-border-raised",
			)}
			onClick={() => onChange(!on)}
		>
			<motion.span
				className="absolute top-[2px] left-[2px] h-3 w-3 rounded-full bg-on-thread"
				animate={{ x: on ? 12 : 0 }}
				transition={{ duration: 0.16, ease: EASE }}
			/>
		</button>
	);
}

function SmallButton({
	primary = false,
	onClick,
	children,
}: {
	primary?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className={cn(
				"h-6 shrink-0 cursor-pointer rounded-xs px-2.5 type-label transition-[transform,background-color] active:scale-[0.97]",
				primary ? "bg-thread text-on-thread" : "bg-surface text-text hover:bg-border-raised",
			)}
			onClick={onClick}
		>
			{children}
		</button>
	);
}
