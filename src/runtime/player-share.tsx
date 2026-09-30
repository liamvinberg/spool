import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
	PlayerPublicationClient,
	PlayerPublicationJob,
	PlayerPublicationModel,
} from "./player-publication-client";
import { jobFraction, type ShareAccessMode, type ShareChip, ShareChipButton, SharePanel } from "./share-panel";
import { shareStyles } from "./share-styles";

export { shareStyles };

export interface PlayerShareView {
	/** open the popover; `stop` opens it already asking to stop the link */
	show(view?: "stop"): void;
	close(): void;
	/**
	 * One press from a menu: copy the link, making it first when there is none.
	 * A frame never shared before reuses the last access this machine chose, and
	 * opens the popover to ask only when there is nothing to reuse.
	 */
	copyShare(): void;
	chip: ShareChip | undefined;
	/** the link is out there or on its way: the menu offers its verbs */
	shared: boolean;
	available: boolean;
	connected: string[] | undefined;
	open: boolean;
	trigger: ReactNode;
	surface: ReactNode;
}

export interface PlayerShareOptions {
	/** what the popover stands beside; it follows the element while open */
	anchor?: () => Element | null;
	/** `beside` sits right of the anchor (a frame), `below` hangs under it (a bar button) */
	placement?: "beside" | "below";
}

const COPIED_MS = 1600;
const UPDATED_MS = 2400;
const ACCESS_KEY = "spool:share-access";

interface LastAccess {
	mode: ShareAccessMode;
	emails: string[];
}

function readLastAccess(): LastAccess | undefined {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(ACCESS_KEY) ?? "null");
		if (typeof value !== "object" || value === null) return;
		const { mode, emails } = value as Record<string, unknown>;
		if (
			(mode !== "invited" && mode !== "public") ||
			!Array.isArray(emails) ||
			!emails.every((email) => typeof email === "string")
		)
			return;
		if (mode === "invited" && emails.length === 0) return;
		return { mode, emails };
	} catch {
		return;
	}
}
function writeLastAccess(access: LastAccess): void {
	try {
		localStorage.setItem(ACCESS_KEY, JSON.stringify(access));
	} catch {}
}

/**
 * The clipboard write is asked for inside the press, before the link has an
 * address: a first share learns its URL only once the cloud has made the
 * publication. A promised ClipboardItem keeps the press's permission while the
 * address arrives; where that is unsupported the write waits and tries plainly.
 */
async function writeWhenReady(url: Promise<string>): Promise<boolean> {
	try {
		if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function") {
			await navigator.clipboard.write([
				new ClipboardItem({ "text/plain": url.then((value) => new Blob([value], { type: "text/plain" })) }),
			]);
			return true;
		}
	} catch {}
	try {
		await navigator.clipboard.writeText(await url);
		return true;
	} catch {
		return false;
	}
}

export function usePlayerShare(
	client: PlayerPublicationClient | undefined,
	options: PlayerShareOptions = {},
): PlayerShareView {
	const [mode, setMode] = useState<ShareAccessMode>("invited");
	const [starting, setStarting] = useState(false);
	const pendingStart = useRef(false);
	const [model, setModel] = useState<PlayerPublicationModel>();
	const [open, setOpen] = useState(false);
	const [recipients, setRecipients] = useState<string[]>([]);
	const [job, setJob] = useState<PlayerPublicationJob>();
	const [problem, setProblem] = useState("");
	const [copied, setCopied] = useState(false);
	const [fresh, setFresh] = useState(false);
	const [stopping, setStopping] = useState(false);
	const [authorityUncertain, setAuthorityUncertain] = useState(false);
	const [mutation, setMutation] = useState<"grant" | "stop">();
	const trigger = useRef<HTMLSpanElement>(null);
	const freshness = useRef(0);
	const refreshing = useRef<Promise<PlayerPublicationModel | undefined> | undefined>(undefined);
	const trailing = useRef(false);
	const uncertainStop = useRef<string | undefined>(undefined);
	const draftIdentity = useRef("");
	const wasAvailable = useRef(false);
	const pendingCopy = useRef<{ resolve: (url: string) => void; reject: () => void } | undefined>(undefined);
	const pendingInstant = useRef(false);
	const lastEntry = useRef<string | undefined>(undefined);

	const settleCopy = useCallback((url: string | undefined, failed = false) => {
		const pending = pendingCopy.current;
		if (pending === undefined) return;
		if (url !== undefined) {
			pendingCopy.current = undefined;
			pending.resolve(url);
		} else if (failed) {
			pendingCopy.current = undefined;
			pending.reject();
		}
	}, []);

	const apply = useCallback(
		(next: PlayerPublicationModel) => {
			const uncertainPublicationId = uncertainStop.current;
			uncertainStop.current = undefined;
			setAuthorityUncertain(false);
			const identity = `${next.available}:${next.publication?.id ?? next.association}:${next.publication?.state ?? ""}`;
			if (draftIdentity.current !== identity) {
				draftIdentity.current = identity;
				const last = next.recipients.length === 0 && next.access === undefined ? readLastAccess() : undefined;
				setRecipients(next.recipients.length > 0 ? next.recipients : (last?.emails ?? []));
				setMode(next.access?.mode ?? last?.mode ?? "invited");
			}
			if (!next.available || next.association === "mismatched" || next.association === "superseded") {
				setRecipients([]);
				setCopied(false);
			}
			if (
				uncertainPublicationId !== undefined &&
				(next.publication?.id !== uncertainPublicationId || next.publication.state !== "active")
			) {
				setOpen(false);
			}
			setModel((current) => {
				const sameRunningJob =
					next.available &&
					next.association === "current" &&
					next.job?.state === "running" &&
					current?.job?.state === "running" &&
					next.job.id === current.job.id;
				return sameRunningJob && next.publication === undefined && current?.publication !== undefined
					? { ...next, publication: current.publication, source: "unavailable" }
					: next;
			});
			setJob((current) => {
				if (
					next.available &&
					next.association === "current" &&
					next.job === undefined &&
					current?.state === "running"
				)
					return current;
				if (
					next.available &&
					current?.state === "succeeded" &&
					next.publication?.id === current.publication.id &&
					next.publication.state === "active"
				)
					return current;
				return next.job;
			});
			if (next.job !== undefined && "email" in next.job && next.job.email !== undefined)
				setRecipients(next.job.email.split(/[\s,;]+/u).filter(Boolean));
			setProblem(next.job?.state === "failed" ? next.job.message : (next.problem ?? ""));
			if (next.publication?.state === "active") settleCopy(next.publication.url);
			if (!next.available && wasAvailable.current) {
				setOpen(false);
			}
			wasAvailable.current = next.available;
		},
		[settleCopy],
	);

	const refresh = useCallback(
		(force = false): Promise<PlayerPublicationModel | undefined> => {
			if (client === undefined) return Promise.resolve(undefined);
			if (refreshing.current !== undefined) {
				if (force) freshness.current++;
				trailing.current = true;
				return refreshing.current;
			}
			const run = Promise.resolve()
				.then(async () => {
					let result: PlayerPublicationModel | undefined;
					do {
						trailing.current = false;
						const request = ++freshness.current;
						try {
							const next = await client.model();
							if (request === freshness.current) {
								apply(next);
								result = next;
							}
						} catch {
							if (request === freshness.current) {
								if (uncertainStop.current !== undefined) {
									setAuthorityUncertain(true);
									setModel(undefined);
									setJob(undefined);
									setRecipients([]);
									setCopied(false);
									setOpen(true);
								} else {
									setModel(undefined);
									setOpen(false);
								}
								result = undefined;
							}
						}
					} while (trailing.current);
					return result;
				})
				.finally(() => {
					if (refreshing.current === run) refreshing.current = undefined;
					if (trailing.current) {
						trailing.current = false;
						void refresh();
					}
				});
			refreshing.current = run;
			return run;
		},
		[client, apply],
	);

	useEffect(() => {
		void refresh();
	}, [refresh]);
	useEffect(() => {
		if (client === undefined) return;
		let timer: number | undefined;
		const unsubscribe = client.subscribe(() => {
			if (timer !== undefined) window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				timer = undefined;
				void refresh();
			}, 80);
		});
		return () => {
			if (timer !== undefined) window.clearTimeout(timer);
			unsubscribe();
		};
	}, [client, refresh]);
	const runningJobId = job?.state === "running" ? job.id : undefined;
	useEffect(() => {
		if (client === undefined || runningJobId === undefined) return;
		let cancelled = false;
		let timer: number;
		const schedule = () => {
			if (!cancelled) timer = window.setTimeout(() => void observe(), 250);
		};
		async function observe(): Promise<void> {
			if (client === undefined || runningJobId === undefined) return;
			const request = freshness.current;
			try {
				const next = await client.job(runningJobId);
				if (cancelled) return;
				if (next.state === "running" && next.url !== undefined) settleCopy(next.url);
				if (request !== freshness.current) {
					if (next.state !== "running") void refresh();
					schedule();
					return;
				}
				setJob(next);
				if (next.state === "running") {
					schedule();
					return;
				}
				// A model captured before completion cannot replace the completed publication.
				freshness.current++;
				if (next.state === "failed") {
					setProblem(next.message);
					settleCopy(undefined, true);
				}
				if (next.state === "succeeded") {
					setProblem("");
					settleCopy(next.publication.url);
					if (next.kind === "update") setFresh(true);
					setModel((current) =>
						current === undefined ||
						!current.available ||
						current.association === "superseded" ||
						current.association === "mismatched" ||
						(next.kind === "update" &&
							current.association !== "current" &&
							!(current.association === "incomplete" && current.job?.id === next.id)) ||
						(current.publication !== undefined && current.publication.id !== next.publication.id)
							? current
							: {
									...current,
									association: "current",
									source: next.source,
									recipients: next.publication.invitedEmails,
									publication: next.publication,
									job: next,
								},
					);
				}
				void refresh();
			} catch {
				if (!cancelled) {
					await refresh(true);
					schedule();
				}
			}
		}
		schedule();
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [client, runningJobId, refresh, settleCopy]);

	useEffect(() => {
		if (!copied) return;
		const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
		return () => window.clearTimeout(timer);
	}, [copied]);
	useEffect(() => {
		if (!fresh) return;
		const timer = window.setTimeout(() => setFresh(false), UPDATED_MS);
		return () => window.clearTimeout(timer);
	}, [fresh]);

	const close = useCallback(() => {
		setOpen(false);
		setStopping(false);
	}, []);
	const active = model?.association === "current" && model.publication?.state === "active";
	const running = starting || job?.state === "running";
	const updating = job?.kind === "update" && job.state === "running";
	const retrying = job?.kind === "update" && job.state === "failed";
	const changed = active && !updating && (model.source === "changed" || retrying);
	const continuingUnavailable = model?.association === "current" && model.publication === undefined;
	// a link that already has an address keeps it through an update or a restart
	const url = active
		? model.publication?.url
		: ((job?.state === "running" ? job.url : undefined) ?? model?.publication?.url);

	async function publish(list?: string[], accessMode?: ShareAccessMode): Promise<boolean> {
		if (client === undefined || model === undefined || pendingStart.current) return false;
		const chosen = accessMode ?? mode;
		const needsInvitation = !active && !continuingUnavailable && model.recipients.length === 0;
		const addresses = list ?? [];
		if (needsInvitation && chosen !== "public" && addresses.length === 0) {
			setProblem("Add at least one email address.");
			return false;
		}
		pendingStart.current = true;
		setStarting(true);
		setProblem("");
		setCopied(false);
		const request = freshness.current;
		try {
			const started = await client.start(
				addresses.length === 0 ? undefined : addresses.join(", "),
				active ? undefined : chosen,
			);
			if (!active) writeLastAccess({ mode: chosen, emails: addresses });
			if (started.state === "running" && started.url !== undefined) settleCopy(started.url);
			if (request === freshness.current) {
				setJob(started);
				setModel((current) => (current === undefined ? current : { ...current, job: started }));
			} else void refresh();
			return true;
		} catch (error) {
			settleCopy(undefined, true);
			if (request !== freshness.current) return false;
			const current = await refresh(true);
			if (current?.available === true)
				setProblem(error instanceof Error ? error.message : "The link could not be published. Try again.");
			return false;
		} finally {
			pendingStart.current = false;
			setStarting(false);
		}
	}

	/** Ask for the clipboard now, and hand it the address whenever it exists. */
	function copyWhenReady(): void {
		if (url !== undefined && (active || running)) {
			void copyNow(url);
			return;
		}
		settleCopy(undefined, true);
		const address = new Promise<string>((resolve, reject) => {
			pendingCopy.current = { resolve, reject };
		});
		void writeWhenReady(address).then((ok) => {
			if (ok) {
				setCopied(true);
				setProblem("");
			} else if (pendingCopy.current === undefined) {
				// the share itself went wrong, or the page lost the press: the popover says which
				setOpen(true);
			}
		});
	}
	async function copyNow(value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			setProblem("");
		} catch {
			setProblem("Select the link to copy it. Clipboard access was unavailable.");
			setOpen(true);
		}
	}
	async function stop(): Promise<void> {
		if (client === undefined || mutation !== undefined) return;
		const publicationId = model?.publication?.id;
		if (publicationId === undefined) return;
		setProblem("");
		setMutation("stop");
		try {
			await client.stop();
			uncertainStop.current = publicationId;
			const current = await refresh(true);
			if (current?.available === true && current.publication?.state === "stopped") {
				close();
			} else if (current?.available === true && current.publication?.id !== publicationId) {
				close();
			} else if (current === undefined || current.available) {
				setProblem("Sharing may have stopped, but it could not be confirmed. Try again.");
			}
		} catch (error) {
			uncertainStop.current = publicationId;
			const current = await refresh(true);
			if (current?.available === true && current.publication?.id !== publicationId) close();
			else if (current === undefined || current.available)
				setProblem(error instanceof Error ? error.message : "Sharing could not be stopped. Try again.");
		} finally {
			setMutation(undefined);
		}
	}

	const show = useCallback(
		(view?: "stop") => {
			setOpen(true);
			setStopping(view === "stop");
			void refresh(true);
		},
		[refresh],
	);

	// A menu press can land before this entry's model has loaded; it waits for it.
	useEffect(() => {
		if (!pendingInstant.current || model === undefined) return;
		pendingInstant.current = false;
		instant();
	});
	function instant(): void {
		if (model === undefined) {
			pendingInstant.current = true;
			void refresh(true);
			return;
		}
		if (!model.available) {
			show();
			return;
		}
		if (active || running) {
			copyWhenReady();
			return;
		}
		const last = readLastAccess();
		if (last === undefined || !model.ready || job?.state === "failed") {
			show();
			return;
		}
		setMode(last.mode);
		setRecipients(last.emails);
		copyWhenReady();
		void publish(last.emails, last.mode).then((started) => {
			if (!started) {
				settleCopy(undefined, true);
				setOpen(true);
			}
		});
	}

	if (model !== undefined) lastEntry.current = model.entry;
	const available = model?.available === true;
	const blocked = authorityUncertain || model?.association === "superseded" || model?.association === "mismatched";
	const chip: ShareChip | undefined = !available
		? undefined
		: copied
			? { kind: "copied" }
			: starting
				? { kind: "preparing" }
				: job?.state === "running"
					? job.kind === "update"
						? { kind: "updating", fraction: jobFraction(job) }
						: job.phase === "capturing"
							? { kind: "preparing" }
							: { kind: "uploading", fraction: jobFraction(job) }
					: job?.state === "failed" && (active || job.kind === "create")
						? { kind: "interrupted" }
						: active
							? changed
								? { kind: "changed" }
								: fresh
									? { kind: "updated" }
									: { kind: "shared" }
							: undefined;

	return {
		show,
		close,
		copyShare: instant,
		chip,
		shared: active || running,
		available,
		connected: available ? model.included : undefined,
		open,
		trigger: available ? (
			<span ref={trigger} className="spool-bar-sharing">
				{chip !== undefined && (
					<ShareChipButton chip={chip} expanded={open} onOpen={() => (open ? close() : show())} />
				)}
				<button
					type="button"
					className="spool-bar-share"
					aria-expanded={open}
					aria-haspopup="dialog"
					onClick={() => (open ? close() : show())}
				>
					Share
				</button>
			</span>
		) : null,
		surface: (
			<>
				<style>{shareStyles}</style>
				<SharePopover
					open={open}
					entry={lastEntry.current}
					anchor={options.anchor ?? (() => trigger.current)}
					placement={options.placement ?? "below"}
					onClose={close}
				>
					<SharePanel
						model={model}
						entry={lastEntry.current}
						job={job}
						starting={starting}
						active={active}
						changed={changed}
						url={url}
						mode={mode}
						onMode={setMode}
						recipients={recipients}
						onRecipients={setRecipients}
						copied={copied}
						problem={problem}
						blocked={blocked}
						mutating={mutation !== undefined}
						stopping={stopping}
						onStopping={setStopping}
						onCreate={(list) => {
							copyWhenReady();
							void publish(list).then((started) => {
								if (!started) settleCopy(undefined, true);
							});
						}}
						onUpdate={() => void publish()}
						onCopy={() => {
							if (url !== undefined) void copyNow(url);
						}}
						onAccess={async (input) => {
							if (!client?.setAccess || mutation !== undefined) return false;
							setMutation("grant");
							setProblem("");
							try {
								await client.setAccess(input);
								writeLastAccess({ mode: input.mode, emails: input.emails });
								await refresh(true);
								return true;
							} catch (error) {
								await refresh(true);
								setProblem(error instanceof Error ? error.message : "Access could not be saved.");
								return false;
							} finally {
								setMutation(undefined);
							}
						}}
						onStop={() => void stop()}
						onCheck={() => void refresh(true)}
					/>
				</SharePopover>
			</>
		),
	};
}

const WIDTH = 312;
const GAP = 12;
const MARGIN = 12;

/**
 * Beside what it is about, never over the middle of the screen. It is not
 * modal: the canvas or the page stays live, a press anywhere else closes it,
 * and while it is open it keeps to its anchor, so a frame panned under it
 * carries it along.
 */
function SharePopover({
	open,
	entry,
	anchor,
	placement,
	onClose,
	children,
}: {
	open: boolean;
	entry: string | undefined;
	anchor: () => Element | null;
	placement: "beside" | "below";
	onClose: () => void;
	children: ReactNode;
}) {
	const reduced = useReducedMotion() ?? false;
	const panel = useRef<HTMLElement | null>(null);
	const body = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number>();
	const [place, setPlace] = useState<{ left: number; top: number; origin: string } | undefined>();
	const anchorRef = useRef(anchor);
	anchorRef.current = anchor;
	const closeRef = useRef(onClose);
	closeRef.current = onClose;

	useLayoutEffect(() => {
		if (!open) return;
		let frame = 0;
		const follow = () => {
			const target = anchorRef.current();
			const box = target?.getBoundingClientRect();
			const tall = panel.current?.offsetHeight ?? 0;
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			let left: number;
			let top: number;
			let origin = "top left";
			if (box === undefined) {
				left = (vw - WIDTH) / 2;
				top = Math.max(MARGIN, (vh - tall) / 2);
			} else if (placement === "below") {
				left = box.right - WIDTH;
				top = box.bottom + 8;
				origin = "top right";
			} else {
				left = box.right + GAP;
				top = box.top;
				if (left + WIDTH > vw - MARGIN) {
					left = box.left - GAP - WIDTH;
					origin = "top right";
				}
			}
			left = Math.min(Math.max(MARGIN, left), vw - MARGIN - Math.min(WIDTH, vw - 2 * MARGIN));
			top = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - MARGIN - tall));
			setPlace((current) =>
				current?.left === left && current.top === top && current.origin === origin
					? current
					: { left, top, origin },
			);
			frame = requestAnimationFrame(follow);
		};
		follow();
		return () => cancelAnimationFrame(frame);
	}, [open, placement]);

	useEffect(() => {
		const node = body.current;
		if (!open || node === null) return;
		// offsetHeight rather than the box: the box is scaled while the popover grows in
		const measure = () => setHeight(node.offsetHeight + 2);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const node = panel.current;
		requestAnimationFrame(() =>
			(
				node?.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)") ??
				node?.querySelector<HTMLElement>("button:not(:disabled)")
			)?.focus({ preventScroll: true }),
		);
		const key = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			closeRef.current();
		};
		const press = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (panel.current?.contains(target) || anchorRef.current()?.contains(target)) return;
			closeRef.current();
		};
		document.addEventListener("keydown", key, true);
		document.addEventListener("pointerdown", press, true);
		return () => {
			document.removeEventListener("keydown", key, true);
			document.removeEventListener("pointerdown", press, true);
			if (panel.current?.contains(document.activeElement ?? null) || document.activeElement === document.body)
				returnTo?.focus({ preventScroll: true });
		};
	}, [open]);

	return (
		<AnimatePresence>
			{open && (
				<motion.section
					key="share"
					ref={panel}
					role="dialog"
					aria-label={entry === undefined ? "Share" : `Share ${entry.split("/").at(-1)}`}
					className="spool-share-popover"
					style={{
						left: place?.left ?? -9999,
						top: place?.top ?? -9999,
						transformOrigin: place?.origin ?? "top left",
					}}
					initial={{ opacity: 0, scale: reduced ? 1 : 0.97 }}
					animate={{ opacity: 1, scale: 1, ...(height === undefined ? {} : { height }) }}
					exit={{ opacity: 0, scale: reduced ? 1 : 0.98, transition: { duration: reduced ? 0 : 0.12 } }}
					transition={{ duration: reduced ? 0 : 0.2, ease: [0.22, 0.61, 0.36, 1] }}
					onPointerDown={(event) => event.stopPropagation()}
					onContextMenu={(event) => event.stopPropagation()}
				>
					<div ref={body}>{children}</div>
				</motion.section>
			)}
		</AnimatePresence>
	);
}
