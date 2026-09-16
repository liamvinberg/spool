import { motion, useReducedMotion } from "motion/react";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	PlayerPublicationClient,
	PlayerPublicationJob,
	PlayerPublicationModel,
} from "./player-publication-client";
import { ShareProgress, SharingPanel } from "./share-panel";
import { shareStyles } from "./share-styles";

export interface PlayerShareView {
	show(): void;
	status: string | undefined;
	tray: ReactNode;
	available: boolean;
	connected: string[] | undefined;
	open: boolean;
	trigger: ReactNode;
	surface: ReactNode;
}

export function usePlayerShare(client: PlayerPublicationClient | undefined): PlayerShareView {
	const [mode, setMode] = useState<"invited" | "public">("invited");
	const [starting, setStarting] = useState(false);
	const pendingStart = useRef(false);
	const [model, setModel] = useState<PlayerPublicationModel>();
	const [title, setTitle] = useState("prototype");
	const [open, setOpen] = useState(false);
	const [instant, setInstant] = useState(false);
	const [email, setEmail] = useState("");
	const [job, setJob] = useState<PlayerPublicationJob>();
	const [problem, setProblem] = useState("");
	const [copied, setCopied] = useState(false);
	const [dismissedJob, setDismissedJob] = useState<string>();
	const [authorityUncertain, setAuthorityUncertain] = useState(false);
	const [mutation, setMutation] = useState<"grant" | "stop">();
	const trigger = useRef<HTMLButtonElement>(null);
	const freshness = useRef(0);
	const refreshing = useRef<Promise<PlayerPublicationModel | undefined> | undefined>(undefined);
	const trailing = useRef(false);
	const uncertainStop = useRef<string | undefined>(undefined);
	const draftIdentity = useRef("");

	const apply = useCallback((next: PlayerPublicationModel) => {
		const uncertainPublicationId = uncertainStop.current;
		uncertainStop.current = undefined;
		setAuthorityUncertain(false);
		setTitle(next.title);
		const identity = `${next.available}:${next.publication?.id ?? next.association}:${next.publication?.state ?? ""}`;
		if (draftIdentity.current !== identity) {
			draftIdentity.current = identity;
			setEmail(next.recipients.join(", "));
			setMode(next.access?.mode ?? "invited");
		}
		if (!next.available || next.association === "mismatched" || next.association === "superseded") {
			setEmail("");
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
			if (next.available && next.association === "current" && next.job === undefined && current?.state === "running")
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
		if (next.job !== undefined && "email" in next.job && next.job.email !== undefined) setEmail(next.job.email);
		setProblem(next.job?.state === "failed" ? next.job.message : (next.problem ?? ""));
		if (!next.available) {
			setOpen(false);
		}
	}, []);

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
									setEmail("");
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
				if (next.state === "failed") setProblem(next.message);
				if (next.state === "succeeded") {
					setProblem("");
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
	}, [client, runningJobId, refresh]);

	const close = (immediate: boolean) => {
		setInstant(immediate);
		setOpen(false);
	};
	const active = model?.association === "current" && model.publication?.state === "active";
	const updating = job?.kind === "update" && job.state === "running";
	const retrying = job?.kind === "update" && job.state === "failed";
	const changed = active && (updating || model.source !== "current" || retrying);
	const continuingUnavailable = model?.association === "current" && model.publication === undefined;

	async function publish(recipients?: string[]): Promise<void> {
		if (client === undefined || model === undefined || pendingStart.current) return;
		const invited = recipients?.join(", ") ?? email.trim();
		const needsInvitation = !active && !continuingUnavailable && model.recipients.length === 0;
		const addresses = invited.split(/[\s,;]+/u).filter(Boolean);
		if (
			(needsInvitation && mode !== "public" && addresses.length === 0) ||
			addresses.some((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value))
		) {
			setProblem("Enter valid email addresses.");
			return;
		}
		pendingStart.current = true;
		setStarting(true);
		setProblem("");
		setCopied(false);
		const request = freshness.current;
		try {
			const started = await client.start(invited === "" ? undefined : invited, active ? undefined : mode);
			if (request === freshness.current) {
				setJob(started);
				setModel((current) => (current === undefined ? current : { ...current, job: started }));
			} else void refresh();
		} catch (error) {
			if (request !== freshness.current) return;
			const current = await refresh(true);
			if (current?.available === true)
				setProblem(error instanceof Error ? error.message : "The link could not be published. Try again.");
		} finally {
			pendingStart.current = false;
			setStarting(false);
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
				close(false);
			} else if (current?.available === true && current.publication?.id !== publicationId) {
				close(true);
			} else if (current === undefined || current.available) {
				setProblem("Sharing may have stopped, but it could not be confirmed. Try again.");
			}
		} catch (error) {
			uncertainStop.current = publicationId;
			const current = await refresh(true);
			if (current?.available === true && current.publication?.id !== publicationId) close(true);
			else if (current === undefined || current.available)
				setProblem(error instanceof Error ? error.message : "Sharing could not be stopped. Try again.");
		} finally {
			setMutation(undefined);
		}
	}
	async function copyLink(): Promise<void> {
		const publication = active ? model?.publication : undefined;
		if (publication === undefined) return;
		try {
			await navigator.clipboard.writeText(publication.url);
			setCopied(true);
			setProblem("");
		} catch {
			setProblem("Select the link to copy it. Clipboard access was unavailable.");
		}
	}

	const show = useCallback(() => {
		setOpen(true);
		void refresh(true);
	}, [refresh]);
	const available = model?.available === true;
	const blocked = authorityUncertain || model?.association === "superseded" || model?.association === "mismatched";
	return {
		show,
		status: starting
			? "starting share"
			: job?.state === "running"
				? job.phase === "uploading"
					? `uploading${job.upload && job.upload.totalBytes > 0 ? ` · ${Math.floor((job.upload.completedBytes / job.upload.totalBytes) * 100)}%` : ""}`
					: job.phase === "capturing"
						? "preparing frames"
						: "making link ready"
				: job?.state === "failed"
					? "share interrupted"
					: active
						? changed
							? "unpublished changes"
							: "shared"
						: undefined,
		tray:
			!open && (starting || (job !== undefined && job.id !== dismissedJob)) ? (
				<aside className="spool-share-tray" aria-label="Share progress">
					<div className="spool-share-between spool-share-tray-title">
						<span>{model?.entry ?? title}</span>
						<button type="button" className="spool-share-text" onClick={() => setOpen(true)}>
							Details
						</button>
					</div>
					{starting || job?.state === "running" ? (
						<>
							<ShareProgress job={job} starting={starting} />
							<p className="spool-share-muted">Keep working. Sharing continues in the background.</p>
						</>
					) : job?.state === "failed" ? (
						<>
							<strong>Sharing was interrupted.</strong>
							<p role="status">{job.message}</p>
							<button type="button" className="spool-share-primary" onClick={() => setOpen(true)}>
								Review and retry
							</button>
						</>
					) : (
						<>
							<strong>Your link is ready</strong>
							<p className="spool-share-muted">
								{model?.access?.mode === "public"
									? "Anyone with the link can open it."
									: "Send the link to the people you added."}
							</p>
							<button
								type="button"
								className="spool-share-primary"
								disabled={!active}
								onClick={() => void copyLink()}
							>
								{copied ? "Copied" : "Copy link"}
							</button>
							<button type="button" className="spool-share-text" onClick={() => setDismissedJob(job?.id)}>
								Dismiss
							</button>
						</>
					)}
				</aside>
			) : null,
		available,
		connected: available ? model.included : undefined,
		open,
		trigger: available ? (
			<>
				{active &&
					(changed ? (
						<button
							type="button"
							className="spool-bar-share spool-bar-update"
							disabled={updating || blocked}
							onClick={() => void publish()}
						>
							{updating ? "Updating…" : retrying ? "Retry update" : "Update link"}
						</button>
					) : (
						<span className="spool-bar-status" role="status">
							Up to date
						</span>
					))}
				<button
					type="button"
					ref={trigger}
					className="spool-bar-share"
					aria-label={active ? (changed ? "Share · changes" : "Share ↗") : "Share"}
					aria-expanded={open}
					aria-haspopup="dialog"
					onClick={(event) => {
						setInstant(event.detail === 0);
						setOpen(true);
						void refresh(true);
					}}
				>
					Share
				</button>
			</>
		) : null,
		surface: (
			<>
				<style>{shareStyles}</style>
				<ShareSurface
					starting={starting}
					mode={mode}
					onMode={setMode}
					onAccess={async (input) => {
						if (!client?.setAccess || mutation !== undefined) return false;
						setMutation("grant");
						setProblem("");
						try {
							await client.setAccess(input);
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
					open={open}
					instant={instant}
					model={model}
					title={title}
					job={job}
					active={active}
					changed={changed}
					email={email}
					problem={problem}
					copied={copied}
					mutation={mutation}
					blocked={blocked}
					trigger={trigger}
					onEmail={setEmail}
					onClose={close}
					onPublish={(recipients) => void publish(recipients)}
					onCopy={() => void copyLink()}
					onStop={() => void stop()}
					onCheck={() => void refresh(true)}
				/>
			</>
		),
	};
}

function ShareSurface({
	starting,
	mode,
	onMode,
	onAccess,
	open,
	instant,
	model,
	title,
	job,
	active,
	changed,
	email,
	problem,
	copied,
	mutation,
	blocked,
	trigger,
	onEmail,
	onClose,
	onPublish,
	onCopy,
	onStop,
	onCheck,
}: {
	starting: boolean;
	mode: "invited" | "public";
	onMode: (mode: "invited" | "public") => void;
	onAccess: (input: { mode: "invited" | "public"; emails: string[]; expectedGeneration: number }) => Promise<boolean>;
	open: boolean;
	instant: boolean;
	model: PlayerPublicationModel | undefined;
	title: string;
	job: PlayerPublicationJob | undefined;
	active: boolean;
	changed: boolean;
	email: string;
	problem: string;
	copied: boolean;
	mutation: "grant" | "stop" | undefined;
	blocked: boolean;
	trigger: RefObject<HTMLButtonElement | null>;
	onEmail(value: string): void;
	onClose(immediate: boolean): void;
	onPublish(recipients?: string[]): void;
	onCopy(): void;
	onStop(): void;
	onCheck(): void;
}) {
	const panel = useRef<HTMLElement>(null);
	const body = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number>();
	const reduced = useReducedMotion();
	useEffect(() => {
		const node = body.current;
		if (!node) return;
		const measure = () => setHeight(node.getBoundingClientRect().height + 2);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	const close = useRef(onClose);
	close.current = onClose;
	useEffect(() => {
		if (!open) return;
		const node = panel.current;
		(node?.querySelector<HTMLElement>("input") ?? node?.querySelector<HTMLElement>("button"))?.focus({
			preventScroll: true,
		});
		const keydown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				close.current(true);
			}
			if (event.key !== "Tab" || node === null) return;
			const items = Array.from(
				node.querySelectorAll<HTMLElement>(
					'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
				),
			).filter((item) => item.getClientRects().length > 0 && !item.closest("[inert]"));
			const first = items[0];
			const last = items.at(-1);
			if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) {
				event.preventDefault();
				first?.focus();
			}
		};
		document.addEventListener("keydown", keydown, true);
		return () => {
			document.removeEventListener("keydown", keydown, true);
			trigger.current?.focus({ preventScroll: true });
		};
	}, [open, trigger]);

	return (
		<div className="spool-sharing-surface" data-open={open} data-instant={instant} inert={!open} aria-hidden={!open}>
			<button
				type="button"
				className="spool-sharing-scrim"
				aria-label="Dismiss sharing"
				tabIndex={-1}
				onClick={(event) => onClose(event.detail === 0)}
			/>
			<motion.section
				initial={false}
				animate={{ height: height ?? "auto" }}
				transition={{ duration: instant || reduced ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] }}
				ref={panel}
				className="spool-sharing-panel"
				role="dialog"
				aria-modal="true"
				aria-label={`Share ${title}`}
			>
				<div ref={body} className="spool-sharing-measure">
					<header className="spool-sharing-header">
						<h1>Share {title}</h1>
						<div>
							<span>esc closes</span>
							<button type="button" aria-label="Close sharing" onClick={(event) => onClose(event.detail === 0)}>
								<CloseIcon />
							</button>
						</div>
					</header>
					<SharingPanel
						model={model}
						job={job}
						starting={starting}
						active={active}
						changed={changed}
						email={email}
						onEmail={onEmail}
						mode={mode}
						onMode={onMode}
						copied={copied}
						problem={problem}
						blocked={blocked}
						mutation={mutation !== undefined}
						onPublish={onPublish}
						onCopy={onCopy}
						onClose={() => onClose(false)}
						onAccess={onAccess}
						onStop={onStop}
						onCheck={onCheck}
						instant={instant}
					/>
				</div>
			</motion.section>
		</div>
	);
}

function CloseIcon() {
	return (
		<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
			<path d="M2 2 8 8M8 2 2 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
		</svg>
	);
}
