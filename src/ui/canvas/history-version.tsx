import {
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { pageName } from "../../page-path";
import { accelLabel } from "../../runtime/platform-keys";
import {
	fetchVersion,
	type HistoryScope,
	type HistoryStretch,
	type RestoreAsk,
	restoreFromHistory,
	type VersionFrame,
	type VersionRead,
} from "../api";
import { cn } from "../cn";
import { ConfirmDialog } from "../confirm-dialog";
import { Button } from "../primitives/actions";
import { Kbd } from "../primitives/display";
import { TextAction, Toast } from "../primitives/feedback";
import { Checkbox } from "../primitives/selection";
import { shellRadius } from "./camera";
import { type CameraStore, useCameraFollow } from "./camera-store";
import { HISTORY_CHANGE } from "./history-pane";
import {
	changeSays,
	didSays,
	framesSays,
	momentSays,
	restoreLabel,
	stepOf,
	tickedAtFirst,
	versionRestore,
} from "./history-restore-model";
import { PRESENCE_INK } from "./presence-faces";

/**
 * History as versions (task 225, spool#214): a row in the History pane is a version, the moment a stretch of saves
 * ended, and picking one draws the page on the canvas as it stood then. What that version changed keeps a chip and
 * an accent ring, the rest step back, and a frame it deleted stands dashed where it was with Bring back. A bar over
 * the canvas names the moment and holds Back to now and Restore this version…, which asks one question listing each
 * frame that differs from now, ticked, so restoring part of it is unticking. ↑ ↓ step through the versions and Esc
 * goes back to now. Once restored, the canvas is back to now, the restored frames ring once, and the toast offers
 * Undo and ⌘Z, which restore the same paths to just before.
 */

const UNDO_CHORD = `${accelLabel()}Z`;
/** How long the toast stands with its Undo: the trash toast's window, and a little more for reading the moment. */
const TOAST_MS = 8000;
/** How long a restored frame's ring stays mounted: its animation's three slower durations, and some. */
const RING_MS = 2000;
/** How long after a change the version shown is read again, so a burst of saves is one read. */
const SETTLE_MS = 1500;
/** The canvas's name row above a frame, in screen pixels: what a version covers with its own. */
const LABEL_PX = 32;

/** A frame on the canvas now, as the canvas has it. */
export interface CanvasFrame {
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

type Box = Omit<CanvasFrame, "name">;

/** The one question: a version's restore, or Bring back for a frame it deleted. */
type Asking =
	| { kind: "version"; stretch: HistoryStretch; read: Extract<VersionRead, { state: "ready" }> }
	| { kind: "bring"; frame: string; stretch: HistoryStretch };

interface Said {
	key: number;
	message: string;
	undo: RestoreAsk | null;
	error: boolean;
}

const sameStretch = (a: HistoryStretch | null, b: HistoryStretch | null) =>
	a !== null && b !== null && a.from === b.from && a.to === b.to && a.by.accountId === b.by.accountId;

/** A keypress meant for a field, not for stepping through versions. */
const typing = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA" ||
		target.tagName === "SELECT");

/**
 * The version shown and what goes with it: the read of it, the question, the toast and the frames just restored.
 * `listed` is the versions the pane lists, newest first, which ↑ ↓ step through.
 */
export function useVersions(project: string, scope: HistoryScope, page: string, you: string | null) {
	const [shown, setShown] = useState<HistoryStretch | null>(null);
	const listed = useRef<HistoryStretch[]>([]);
	const [read, setRead] = useState<{ key: string; read: VersionRead } | null>(null);
	const [asking, setAsking] = useState<Asking | null>(null);
	const [said, setSaid] = useState<Said | null>(null);
	const [rang, setRang] = useState<{ key: number; frames: string[] } | null>(null);
	const [fresh, setFresh] = useState(0);
	const keys = useRef(0);
	const key = shown === null ? null : `${shown.from}\n${shown.to}\n${page}\n${fresh}`;
	const scopeKey = scope.kind === "frame" ? scope.frame : "";

	const show = useCallback((next: HistoryStretch | null) => setShown(next), []);
	// another scope, project or page starts from now
	// biome-ignore lint/correctness/useExhaustiveDependencies: the keys are what changed
	useEffect(() => setShown(null), [project, scopeKey, page]);
	// the version shown, read again a moment after the design changes: what it differs from now may have moved
	useEffect(() => {
		if (shown === null) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const later = () => {
			clearTimeout(timer);
			timer = setTimeout(() => setFresh((was) => was + 1), SETTLE_MS);
		};
		window.addEventListener(HISTORY_CHANGE, later);
		return () => {
			clearTimeout(timer);
			window.removeEventListener(HISTORY_CHANGE, later);
		};
	}, [shown]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the key is what is read
	useEffect(() => {
		if (shown === null || key === null) return;
		let live = true;
		void fetchVersion(project, shown.to, shown.from - 1, page).then((next) => {
			if (live) setRead({ key, read: next });
		});
		return () => {
			live = false;
		};
	}, [project, key]);
	useEffect(() => {
		if (said === null) return;
		const gone = setTimeout(() => setSaid(null), TOAST_MS);
		return () => clearTimeout(gone);
	}, [said]);
	useEffect(() => {
		if (rang === null) return;
		const gone = setTimeout(() => setRang(null), RING_MS);
		return () => clearTimeout(gone);
	}, [rang]);

	const step = useCallback(
		(by: 1 | -1) => {
			const next = stepOf(listed.current, shown, by);
			if (next !== undefined) setShown(next);
		},
		[shown],
	);
	// while a version shows: ↑ ↓ step through the versions and Esc goes back to now, wherever the focus is
	useEffect(() => {
		if (shown === null || asking !== null) return;
		const key = (event: KeyboardEvent) => {
			if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.key === "Escape") setShown(null);
			else if (event.key === "ArrowDown") step(1);
			else if (event.key === "ArrowUp") step(-1);
			else return;
			event.preventDefault();
			event.stopPropagation();
		};
		window.addEventListener("keydown", key, true);
		return () => window.removeEventListener("keydown", key, true);
	}, [shown, asking, step]);

	const say = useCallback((next: Omit<Said, "key"> | null) => {
		setSaid(next === null ? null : { ...next, key: ++keys.current });
	}, []);

	/** Undo a restore: itself a restore, of the same paths to the version just before it. */
	const undo = useCallback(
		async (ask: RestoreAsk) => {
			try {
				await restoreFromHistory(project, ask);
				say(null);
			} catch (error) {
				say({ message: messageOf(error), undo: null, error: true });
			}
			window.dispatchEvent(new CustomEvent(HISTORY_CHANGE));
		},
		[project, say],
	);

	const restore = async (ask: RestoreAsk, frames: readonly string[], at: number) => {
		const done = await restoreFromHistory(project, ask);
		const what = frames.length > 0 ? framesSays(frames) : "the shared files";
		setShown(null);
		setRang({ key: ++keys.current, frames: [...frames] });
		say({
			message:
				done.setAside.length > 0
					? `Restored ${what} to ${momentSays(at)}; ${done.setAside.length} set aside`
					: `Restored ${what} to ${momentSays(at)}`,
			undo: done.undo,
			error: false,
		});
		window.dispatchEvent(new CustomEvent(HISTORY_CHANGE));
	};

	const current = read !== null && read.key === key ? read.read : null;
	const ready = current?.state === "ready" ? current : null;

	const question =
		asking === null ? null : asking.kind === "version" ? (
			<VersionQuestion
				key={`${asking.stretch.from}\n${asking.stretch.to}`}
				asking={asking}
				scope={scope}
				onClose={() => setAsking(null)}
				onRestore={(frames, also) =>
					restore(versionRestore(asking.stretch.to, frames, also), frames, asking.stretch.end)
				}
			/>
		) : (
			<ConfirmDialog
				title={`Bring back ${pageName(asking.frame)}?`}
				description={`It comes back as it was at ${momentSays(asking.stretch.start)}, just before it was deleted. Nothing else changes, and Undo puts it back.`}
				confirmLabel="Bring back"
				onClose={() => setAsking(null)}
				onConfirm={() =>
					restore(
						versionRestore(asking.stretch.from - 1, [asking.frame], []),
						[asking.frame],
						asking.stretch.start,
					)
				}
			/>
		);

	const toast =
		said === null ? null : (
			<Toast
				key={said.key}
				data-restored=""
				message={said.message}
				tone={said.error ? "error" : "default"}
				action={
					said.undo === null ? undefined : (
						<TextAction
							onClick={() => {
								const next = said.undo;
								if (next !== null) void undo(next);
							}}
						>
							Undo
						</TextAction>
					)
				}
				keys={said.undo === null ? undefined : UNDO_CHORD}
				drain={said.undo === null ? undefined : TOAST_MS}
			/>
		);

	/** ⌘Z while the toast stands undoes the restore it says; false when there is none to undo. */
	const undoLast = () => {
		if (said === null || said.undo === null) return false;
		void undo(said.undo);
		return true;
	};

	/** What the version shown did on this page, frame by frame, for its row: `cart changed · promo deleted here`. */
	const did =
		ready === null
			? null
			: ready.frames
					.flatMap((frame) => (frame.did === null ? [] : [`${pageName(frame.name)} ${didSays(frame.did)}`]))
					.join(" · ") || null;

	return {
		shown,
		show,
		listed,
		did,
		question,
		toast,
		undoLast,
		/** the layer over the canvas: the version drawn, its bar, and the frames a restore just put back */
		layer: (frames: readonly CanvasFrame[], camera: CameraStore) => (
			<VersionLayer
				shown={shown}
				read={current}
				frames={frames}
				camera={camera}
				rang={rang}
				you={you}
				at={shown === null ? 0 : listed.current.findIndex((each) => sameStretch(each, shown))}
				of={listed.current.length}
				onBack={() => setShown(null)}
				onStep={step}
				onRestore={
					ready === null || shown === null
						? undefined
						: () => setAsking({ kind: "version", stretch: shown, read: ready })
				}
				onBringBack={(frame) => {
					if (shown !== null) setAsking({ kind: "bring", frame, stretch: shown });
				}}
			/>
		),
	};
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : "The restore couldn't be made. Try again.";
}

/** The camera's world, followed: what a version's frames stand in. */
function World({ camera, children }: { camera: CameraStore; children: ReactNode }) {
	const field = useRef<HTMLDivElement | null>(null);
	useCameraFollow(
		camera,
		({ x, y, k }) => {
			if (field.current === null) return;
			field.current.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
			field.current.style.setProperty("--compare-k", String(k));
			// a frame's corner, as its shell rounds it at this zoom
			field.current.style.setProperty("--compare-radius", `${shellRadius(k)}px`);
		},
		[],
	);
	return (
		<div ref={field} className="pointer-events-none absolute top-0 left-0" style={{ transformOrigin: "0 0" }}>
			{children}
		</div>
	);
}

const sameBox = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** How a frame stands while a version shows, worked out from the read and the canvas now. */
interface Standing {
	name: string;
	/** today's frame and its name row, hidden under the canvas's ground */
	cover: Box | null;
	/** what is drawn in its place: the old document, or today's frame left showing */
	drawn: { box: Box; url: string | null; ghost: boolean } | null;
	did: VersionFrame["did"];
	/** stepped back: nothing about it changed in this version */
	quiet: boolean;
	/** a frame the version deleted that isn't back since: Bring back is offered */
	bring: boolean;
}

function standingOf(frame: VersionFrame, now: CanvasFrame | undefined): Standing {
	const today: Box | null = now === undefined ? null : { x: now.x, y: now.y, w: now.w, h: now.h };
	const base = { name: frame.name, did: frame.did, quiet: frame.did === null, bring: false };
	if (frame.stood !== null) {
		const place = frame.stood.place ?? today;
		if (place === null) return { ...base, cover: today, drawn: null };
		// standing as it did then, in the same place: today's frame is the version's
		if (frame.same && today !== null && sameBox(place, today))
			return { ...base, cover: null, drawn: { box: place, url: null, ghost: false } };
		return { ...base, cover: today, drawn: { box: place, url: frame.stood.url, ghost: false } };
	}
	if (frame.did === "deleted" && frame.before !== null) {
		const place = frame.before.place ?? today;
		return {
			...base,
			cover: today,
			drawn: place === null ? null : { box: place, url: frame.before.url, ghost: true },
			bring: !frame.now,
		};
	}
	return { ...base, cover: today, drawn: null };
}

/** A frame's name row as a version draws it, over today's: its name, and what the version did to it. */
function Label({ name, did }: { name: string; did: VersionFrame["did"] }) {
	return (
		<div
			className="absolute bottom-full left-0 flex origin-bottom-left items-center gap-1.5 pb-2.5 type-value"
			style={{ transform: "scale(calc(1 / var(--compare-k, 1)))" }}
		>
			<span className={cn("min-w-0 truncate", did === null ? "text-tertiary" : "text-secondary")}>
				{pageName(name)}
			</span>
			{did === null ? null : (
				<span
					className={cn(
						"shrink-0 whitespace-nowrap rounded-xs border px-1.5 type-detail",
						did === "deleted" ? "border-danger text-danger-strong" : "border-accent text-accent-strong",
					)}
					data-version-chip=""
				>
					{didSays(did)}
				</span>
			)}
		</div>
	);
}

/** Pressing anywhere on a version is not the canvas's: nothing under it is moved, picked or edited. */
const held = {
	onPointerDown: (event: ReactPointerEvent) => event.stopPropagation(),
	onPointerUp: (event: ReactPointerEvent) => event.stopPropagation(),
	onMouseDown: (event: ReactMouseEvent) => event.stopPropagation(),
	onClick: (event: ReactMouseEvent) => event.stopPropagation(),
	onDoubleClick: (event: ReactMouseEvent) => event.stopPropagation(),
	onContextMenu: (event: ReactMouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
	},
};

function VersionLayer({
	shown,
	read,
	frames,
	camera,
	rang,
	you,
	at,
	of,
	onBack,
	onStep,
	onRestore,
	onBringBack,
}: {
	shown: HistoryStretch | null;
	read: VersionRead | null;
	frames: readonly CanvasFrame[];
	camera: CameraStore;
	rang: { key: number; frames: string[] } | null;
	you: string | null;
	at: number;
	of: number;
	onBack: () => void;
	onStep: (by: 1 | -1) => void;
	/** undefined while the version is read */
	onRestore: (() => void) | undefined;
	onBringBack: (frame: string) => void;
}) {
	// the last read stays drawn while the next is read, so stepping never flashes today's canvas
	const [drawn, setDrawn] = useState<Extract<VersionRead, { state: "ready" }> | null>(null);
	useEffect(() => {
		if (shown === null) setDrawn(null);
		else if (read?.state === "ready") setDrawn(read);
	}, [shown, read]);
	const rings =
		rang === null ? null : (
			<World key={rang.key} camera={camera}>
				{frames
					.filter((frame) => rang.frames.includes(frame.name))
					.map((frame) => (
						<span
							key={frame.name}
							aria-hidden="true"
							data-version-rang={frame.name}
							className="absolute animate-history-ring"
							style={{
								left: frame.x,
								top: frame.y,
								width: frame.w,
								height: frame.h,
								borderRadius: "var(--compare-radius)",
							}}
						/>
					))}
			</World>
		);
	if (shown === null) return rings;
	const standing = (drawn?.frames ?? []).map((frame) =>
		standingOf(
			frame,
			frames.find((each) => each.name === frame.name),
		),
	);
	const differs = drawn === null ? null : drawn.differs.length + drawn.shared.length;
	const whose = you !== null && shown.by.accountId === you ? "your" : `${shown.by.name}'s`;
	return (
		<>
			<div className="absolute inset-0 overflow-hidden" data-version={shown.to} {...held}>
				<World camera={camera}>
					{standing.map(({ name, cover }) =>
						cover === null ? null : (
							<div
								key={`cover:${name}`}
								className="absolute bg-surface-canvas"
								style={{
									left: cover.x,
									top: `calc(${cover.y}px - ${LABEL_PX}px / var(--compare-k, 1))`,
									width: cover.w,
									height: `calc(${cover.h}px + ${LABEL_PX}px / var(--compare-k, 1))`,
								}}
							/>
						),
					)}
					{standing.map(({ name, drawn: box, did, quiet, bring }) =>
						box === null ? null : (
							<div
								key={`then:${name}`}
								data-version-frame={name}
								data-version-did={did ?? ""}
								className="absolute"
								style={{ left: box.box.x, top: box.box.y, width: box.box.w, height: box.box.h }}
							>
								{/* today's name row under the version's own */}
								<div
									className="absolute left-0 w-full bg-surface-canvas"
									style={{
										top: `calc(-${LABEL_PX}px / var(--compare-k, 1))`,
										height: `calc(${LABEL_PX}px / var(--compare-k, 1))`,
									}}
								/>
								<Label name={name} did={did} />
								<div
									className={cn(
										"relative h-full w-full transition-opacity duration-base ease-out motion-reduce:transition-none",
										box.ghost
											? "opacity-45 outline-1 outline-line-strong outline-dashed outline-offset-2"
											: quiet
												? "opacity-55"
												: "opacity-100",
										box.url !== null && "overflow-hidden bg-surface-panel",
									)}
									style={{
										borderRadius: "var(--compare-radius)",
										boxShadow:
											!quiet && !box.ghost
												? "0 0 0 calc(2px / var(--compare-k, 1)) var(--color-accent)"
												: undefined,
										// today's frame left showing steps back under a veil of the canvas's ground
										...(box.url === null && quiet
											? {
													background: "color-mix(in srgb, var(--color-surface-canvas) 45%, transparent)",
													opacity: 1,
												}
											: {}),
									}}
								>
									{box.url === null ? null : (
										<iframe
											key={box.url}
											title={`${pageName(name)} at this version`}
											aria-hidden="true"
											tabIndex={-1}
											sandbox="allow-scripts"
											src={box.url}
											className="block h-full w-full border-0 bg-white"
											style={{ pointerEvents: "none" }}
										/>
									)}
								</div>
								{bring && onRestore !== undefined ? (
									<div className="absolute inset-0 flex items-center justify-center">
										<div
											className="pointer-events-auto"
											style={{ transform: "scale(calc(1 / var(--compare-k, 1)))" }}
										>
											<Button
												size="sm"
												variant="primary"
												data-version-bring-back={name}
												onClick={() => onBringBack(name)}
											>
												Bring back
											</Button>
										</div>
									</div>
								) : null}
							</div>
						),
					)}
				</World>
				{/* showing a version, the canvas's edge says so */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0"
					style={{ boxShadow: "inset 0 0 0 2px var(--color-accent)" }}
				/>
			</div>
			<div
				className="absolute top-4 left-1/2 z-30 flex h-11 -translate-x-1/2 animate-chrome-in items-center gap-3 whitespace-nowrap rounded-md border border-line-strong bg-surface-raised pr-1.5 pl-3 shadow-float"
				data-version-bar=""
				{...held}
			>
				<span
					aria-hidden="true"
					className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full font-semibold text-2xs uppercase leading-none"
					style={{ background: shown.by.color, color: PRESENCE_INK }}
				>
					{shown.by.name.charAt(0)}
				</span>
				<span className="flex items-baseline gap-2">
					<span className="text-primary type-control" data-version-moment="">
						{momentSays(shown.end)}
					</span>
					<span className="text-secondary type-detail">
						{shown.restore === null || shown.restore === undefined
							? `after ${whose} saves`
							: `${shown.by.name}'s restore`}
					</span>
				</span>
				{at === -1 ? null : (
					<span className="flex items-center gap-1 text-tertiary type-detail">
						<button type="button" aria-label="Newer version" onClick={() => onStep(-1)}>
							<Kbd>↑</Kbd>
						</button>
						<button type="button" aria-label="Older version" onClick={() => onStep(1)}>
							<Kbd>↓</Kbd>
						</button>
						<span className="pl-0.5">
							{at + 1} of {of}
						</span>
					</span>
				)}
				<span aria-hidden="true" className="h-5 w-px bg-line-default" />
				<Button size="sm" onClick={onBack}>
					Back to now
				</Button>
				<Button
					size="sm"
					variant="primary"
					disabled={onRestore === undefined || differs === 0}
					onClick={onRestore}
					data-version-restore=""
				>
					{differs === 0 ? "Same as now" : "Restore this version…"}
				</Button>
			</div>
			{read?.state === "failed" ? (
				<div className="absolute top-18 left-1/2 z-30 -translate-x-1/2" {...held}>
					<Toast tone="error" message={read.message} />
				</div>
			) : null}
		</>
	);
}

/** One question: each frame that differs from now, ticked, and the shared files that changed, off. */
function VersionQuestion({
	asking,
	scope,
	onClose,
	onRestore,
}: {
	asking: Extract<Asking, { kind: "version" }>;
	scope: HistoryScope;
	onClose: () => void;
	onRestore: (frames: string[], also: string[]) => Promise<void>;
}) {
	const { differs, shared } = asking.read;
	const [ticked, setTicked] = useState<string[]>(() => tickedAtFirst(differs, scope));
	// with no frame to restore, the shared files are what it is for
	const [also, setAlso] = useState<string[]>(() => (differs.length === 0 ? [...shared] : []));
	const count = ticked.length + also.length;
	const tick = (list: string[], item: string, on: boolean) =>
		on ? [...list, item] : list.filter((each) => each !== item);
	return (
		<ConfirmDialog
			title={`Restore ${momentSays(asking.stretch.end)}?`}
			description="Ticked frames go back to how they were then; unticked ones stay as they are. The team gets it as new saves, and Undo puts it back."
			confirmLabel={differs.length === 0 ? "Restore" : restoreLabel(ticked.length, differs.length)}
			disabled={count === 0}
			onClose={onClose}
			onConfirm={() =>
				onRestore(
					differs.map(({ frame }) => frame).filter((frame) => ticked.includes(frame)),
					also,
				)
			}
		>
			<div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto" data-version-question="">
				{differs.map(({ frame, change }) => (
					<Checkbox
						key={frame}
						data-version-tick={frame}
						checked={ticked.includes(frame)}
						onCheckedChange={(on) => setTicked((was) => tick(was, frame, on))}
						label={
							<span className="flex items-baseline gap-2">
								<span className="text-primary type-value">{frame}</span>
								<span className="text-secondary type-label">{changeSays(change)}</span>
							</span>
						}
					/>
				))}
				{shared.map((path) => (
					<Checkbox
						key={path}
						data-version-tick={path}
						checked={also.includes(path)}
						onCheckedChange={(on) => setAlso((was) => tick(was, path, on))}
						label={
							<span className="flex items-baseline gap-2">
								<span className="text-primary type-value">{path}</span>
								<span className="text-secondary type-label">shared, changed since</span>
							</span>
						}
					/>
				))}
			</div>
		</ConfirmDialog>
	);
}
