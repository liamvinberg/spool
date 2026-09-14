import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	PlayerPublicationClient,
	PlayerPublicationJob,
	PlayerPublicationModel,
} from "./player-publication-client";

export interface PlayerShareView {
	available: boolean;
	connected: string[] | undefined;
	open: boolean;
	trigger: ReactNode;
	surface: ReactNode;
}

export function usePlayerShare(client: PlayerPublicationClient | undefined): PlayerShareView {
	const [model, setModel] = useState<PlayerPublicationModel>();
	const [open, setOpen] = useState(false);
	const [instant, setInstant] = useState(false);
	const [details, setDetails] = useState(false);
	const [email, setEmail] = useState("");
	const [job, setJob] = useState<PlayerPublicationJob>();
	const [problem, setProblem] = useState("");
	const [copied, setCopied] = useState(false);
	const [stopping, setStopping] = useState(false);
	const [mutation, setMutation] = useState<"grant" | "stop">();
	const trigger = useRef<HTMLButtonElement>(null);
	const freshness = useRef(0);
	const refreshing = useRef<Promise<PlayerPublicationModel | undefined> | undefined>(undefined);
	const trailing = useRef(false);

	const apply = useCallback((next: PlayerPublicationModel) => {
		setModel(next);
		setJob(next.job);
		if (next.job !== undefined && "email" in next.job && next.job.email !== undefined) setEmail(next.job.email);
		setProblem(next.job?.state === "failed" ? next.job.message : (next.problem ?? ""));
		if (!next.available) {
			setOpen(false);
			setStopping(false);
		}
	}, []);

	const refresh = useCallback(
		async (force = false): Promise<PlayerPublicationModel | undefined> => {
			if (client === undefined) return;
			if (!force && refreshing.current !== undefined) {
				trailing.current = true;
				return refreshing.current;
			}
			const request = ++freshness.current;
			const run = (async (): Promise<PlayerPublicationModel | undefined> => {
				try {
					const next = await client.model();
					if (request !== freshness.current) return;
					apply(next);
					return next;
				} catch {
					if (request !== freshness.current) return;
					setModel(undefined);
					setOpen(false);
					return undefined;
				}
			})();
			refreshing.current = run;
			try {
				return await run;
			} finally {
				if (refreshing.current === run) refreshing.current = undefined;
				if (trailing.current) {
					trailing.current = false;
					void refresh();
				}
			}
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
	useEffect(() => {
		if (client === undefined || job?.state !== "running") return;
		const request = freshness.current;
		const timer = window.setTimeout(() => {
			void client.job(job.id).then(
				(next) => {
					if (request !== freshness.current) {
						if (next.state !== "running") void refresh();
						return;
					}
					setJob(next);
					if (next.state === "failed") setProblem(next.message);
					if (next.state === "succeeded") {
						setProblem("");
						setModel((current) =>
							current === undefined
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
				},
				() => void refresh(true),
			);
		}, 250);
		return () => window.clearTimeout(timer);
	}, [client, job, refresh]);

	const close = (immediate: boolean) => {
		setInstant(immediate);
		setOpen(false);
		setStopping(false);
	};
	const active = model?.association === "current" && model.publication?.state === "active";
	const updating = job?.kind === "update" && job.state === "running";
	const retrying = job?.kind === "update" && job.state === "failed";
	const changed = active && (model.source !== "current" || retrying);
	const continuingUnavailable = model?.association === "current" && model.publication === undefined;

	async function publish(): Promise<void> {
		if (client === undefined || model === undefined) return;
		const invited = email.trim();
		const needsInvitation = !active && !continuingUnavailable && model.recipients.length === 0;
		if ((needsInvitation || invited !== "") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(invited)) {
			setProblem("Enter the person’s email address.");
			return;
		}
		setProblem("");
		setCopied(false);
		const request = freshness.current;
		try {
			const started = await client.start(invited === "" ? undefined : invited);
			if (request === freshness.current) setJob(started);
		} catch (error) {
			if (request !== freshness.current) return;
			const current = await refresh(true);
			if (current?.available === true)
				setProblem(error instanceof Error ? error.message : "The link could not be published. Try again.");
		}
	}
	async function grant(person: string, kind: "invite" | "revoke"): Promise<void> {
		if (client === undefined || mutation !== undefined) return;
		const mailbox = person.trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(mailbox)) {
			setProblem("Enter the person’s email address.");
			return;
		}
		setProblem("");
		setMutation("grant");
		try {
			await client.grant(mailbox, kind);
			if (kind === "invite") setEmail("");
			await refresh(true);
		} catch (error) {
			const current = await refresh(true);
			if (current?.available === true)
				setProblem(error instanceof Error ? error.message : "Access could not be changed. Try again.");
		} finally {
			setMutation(undefined);
		}
	}
	async function stop(): Promise<void> {
		if (client === undefined || mutation !== undefined) return;
		setProblem("");
		setMutation("stop");
		try {
			await client.stop();
			setStopping(false);
			close(false);
			await refresh(true);
		} catch (error) {
			const current = await refresh(true);
			if (current?.available === true)
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

	const available = model?.available === true;
	const blocked = model?.association === "superseded" || model?.association === "mismatched";
	return {
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
						void refresh(true).then((next) => {
							if (next?.available === true) setOpen(true);
						});
					}}
				>
					Share
				</button>
			</>
		) : null,
		surface: (
			<ShareSurface
				open={open}
				instant={instant}
				model={model}
				job={job}
				active={active}
				changed={changed}
				details={details}
				email={email}
				problem={problem}
				copied={copied}
				stopping={stopping}
				mutation={mutation}
				continuingUnavailable={continuingUnavailable}
				trigger={trigger}
				onDetails={setDetails}
				onEmail={setEmail}
				onClose={close}
				onPublish={() => void publish()}
				onCopy={() => void copyLink()}
				onGrant={(person, kind) => void grant(person, kind)}
				onStopping={setStopping}
				onStop={() => void stop()}
			/>
		),
	};
}

function ShareSurface({
	open,
	instant,
	model,
	job,
	active,
	changed,
	details,
	email,
	problem,
	copied,
	stopping,
	mutation,
	continuingUnavailable,
	trigger,
	onDetails,
	onEmail,
	onClose,
	onPublish,
	onCopy,
	onGrant,
	onStopping,
	onStop,
}: {
	open: boolean;
	instant: boolean;
	model: PlayerPublicationModel | undefined;
	job: PlayerPublicationJob | undefined;
	active: boolean;
	changed: boolean;
	details: boolean;
	email: string;
	problem: string;
	copied: boolean;
	stopping: boolean;
	mutation: "grant" | "stop" | undefined;
	continuingUnavailable: boolean;
	trigger: RefObject<HTMLButtonElement | null>;
	onDetails(value: boolean): void;
	onEmail(value: string): void;
	onClose(immediate: boolean): void;
	onPublish(): void;
	onCopy(): void;
	onGrant(email: string, kind: "invite" | "revoke"): void;
	onStopping(value: boolean): void;
	onStop(): void;
}) {
	const panel = useRef<HTMLElement>(null);
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
				node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]'),
			).filter((item) => item.getClientRects().length > 0);
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

	const running = job?.state === "running";
	const updateRunning = running && job.kind === "update";
	const createRetry = job?.state === "failed" && job.kind === "create" && job.retryable;
	const blocked = model?.association === "superseded" || model?.association === "mismatched";
	const publication = model?.publication;
	const title = model?.title ?? "prototype";
	return (
		<div className="spool-sharing-surface" data-open={open} data-instant={instant} inert={!open} aria-hidden={!open}>
			<button
				type="button"
				className="spool-sharing-scrim"
				aria-label="Dismiss sharing"
				tabIndex={-1}
				onClick={(event) => onClose(event.detail === 0)}
			/>
			<section
				ref={panel}
				className="spool-sharing-panel"
				role="dialog"
				aria-modal="true"
				aria-label={`Share ${title}`}
			>
				<header className="spool-sharing-header">
					<h1>Share {title}</h1>
					<div>
						<span>esc closes</span>
						<button type="button" aria-label="Close sharing" onClick={(event) => onClose(event.detail === 0)}>
							<CloseIcon />
						</button>
					</div>
				</header>
				<div className="spool-sharing-body">
					{!active ? (
						<>
							<p className="spool-sharing-muted">Let someone try what you made.</p>
							<form
								className="spool-sharing-form"
								onSubmit={(event) => {
									event.preventDefault();
									onPublish();
								}}
							>
								<label htmlFor="spool-share-email">Who should see it?</label>
								<input
									id="spool-share-email"
									type="email"
									placeholder="Email address"
									value={email}
									disabled={running || blocked}
									onChange={(event) => onEmail(event.target.value)}
								/>
								<p>Only people you add can open this link.</p>
							</form>
						</>
					) : (
						<>
							<input aria-label="Shared link" readOnly value={publication?.url} className="spool-sharing-link" />
							<div className="spool-sharing-actions">
								<button type="button" className="spool-button is-primary" onClick={onCopy}>
									{copied ? "Copied" : "Copy link"}
								</button>
								<a className="spool-button" href={publication?.url} target="_blank" rel="noopener noreferrer">
									Open link ↗
								</a>
							</div>
							{changed && (
								<div className="spool-sharing-update">
									<p>Your edits aren’t on the shared link yet.</p>
									<button
										type="button"
										className="spool-button is-primary"
										disabled={updateRunning || blocked}
										onClick={onPublish}
									>
										{updateRunning
											? "Updating…"
											: job?.state === "failed" && job.kind === "update"
												? "Retry update"
												: "Update link"}
									</button>
									<p>Update the same link. No need to send it again.</p>
								</div>
							)}
						</>
					)}
					{model?.recipients.map((person) => (
						<div className="spool-sharing-person" key={person}>
							<span>{person.slice(0, 1).toUpperCase()}</span>
							<strong>{person}</strong>
							<small>can view</small>
							{details && (
								<button
									type="button"
									aria-label={`Remove ${person}`}
									disabled={mutation !== undefined || blocked}
									onClick={() => onGrant(person, "revoke")}
								>
									×
								</button>
							)}
						</div>
					))}
					<div className="spool-sharing-details">
						<button type="button" onClick={() => onDetails(!details)} aria-expanded={details}>
							<span>What they can see</span>
							<span>{details ? "−" : "+"}</span>
						</button>
						{details && (
							<div>
								<p>
									Opens at {model?.entry}. Includes screens reachable through links, even across canvas pages.
								</p>
								<section aria-label="Included frames">
									{model?.included.map((frame) => (
										<code key={frame}>{frame}</code>
									))}
								</section>
								<p>Other drafts stay local. Viewers navigate with the website’s own links.</p>
								{active && (
									<>
										<form
											className="spool-sharing-add"
											onSubmit={(event) => {
												event.preventDefault();
												onGrant(email, "invite");
											}}
										>
											<input
												aria-label="Add another person"
												placeholder="Add another person"
												value={email}
												disabled={mutation !== undefined}
												onChange={(event) => onEmail(event.target.value)}
											/>
											<button type="submit" className="spool-button" disabled={mutation !== undefined}>
												Add
											</button>
										</form>
										<button type="button" className="spool-sharing-stop" onClick={() => onStopping(true)}>
											Stop sharing…
										</button>
									</>
								)}
							</div>
						)}
					</div>
					{model?.ready === false && model.diagnostics[0] !== undefined && (
						<p role="status" className="spool-sharing-problem">
							{model.diagnostics[0].message}
						</p>
					)}
					{problem && (
						<p role="status" className="spool-sharing-problem">
							{problem}
						</p>
					)}
					{!active && (
						<button
							type="button"
							className="spool-button is-primary"
							disabled={
								running || model?.ready === false || blocked || (job?.state === "failed" && !createRetry)
							}
							onClick={onPublish}
						>
							{running
								? continuingUnavailable
									? "Updating…"
									: "Creating link…"
								: createRetry
									? "Retry"
									: continuingUnavailable
										? "Update link"
										: "Create link"}
						</button>
					)}
					{stopping && (
						<div className="spool-sharing-confirm">
							<p>Stop this link from opening? Your local work stays here.</p>
							<div>
								<button
									type="button"
									className="spool-button"
									disabled={mutation !== undefined}
									onClick={() => onStopping(false)}
								>
									Keep sharing
								</button>
								<button
									type="button"
									className="spool-button is-primary"
									disabled={mutation !== undefined}
									onClick={onStop}
								>
									Stop sharing
								</button>
							</div>
						</div>
					)}
				</div>
			</section>
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
