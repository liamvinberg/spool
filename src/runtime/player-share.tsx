import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	PlayerPublication,
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
	const [publication, setPublication] = useState<PlayerPublication>();
	const [problem, setProblem] = useState("");
	const [copied, setCopied] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const freshness = useRef(0);

	const apply = useCallback((next: PlayerPublicationModel) => {
		setModel(next);
		setJob(next.job);
		if (next.job?.state === "running" || next.job?.state === "failed") setEmail(next.job.email);
		setProblem(next.job?.state === "failed" ? next.job.message : "");
		setPublication(next.publication ?? (next.job?.state === "succeeded" ? next.job.publication : undefined));
		if (!next.available) setOpen(false);
	}, []);

	const refresh = useCallback(async () => {
		if (client === undefined) return undefined;
		const request = ++freshness.current;
		try {
			const next = await client.model();
			if (request !== freshness.current) return undefined;
			apply(next);
			return next;
		} catch {
			if (request !== freshness.current) return undefined;
			setModel(undefined);
			setOpen(false);
			return undefined;
		}
	}, [client, apply]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		if (client === undefined || job?.state !== "running") return;
		const request = freshness.current;
		const timer = window.setTimeout(() => {
			void client.job(job.id).then(
				(next) => {
					if (request !== freshness.current) return;
					setJob(next);
					if (next.state === "succeeded") setPublication(next.publication);
					if (next.state === "failed") setProblem(next.message);
				},
				() => void refresh(),
			);
		}, 250);
		return () => window.clearTimeout(timer);
	}, [client, job, refresh]);

	const close = (immediate: boolean) => {
		setInstant(immediate);
		setOpen(false);
	};

	async function create(): Promise<void> {
		if (client === undefined) return;
		const invited = email.trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(invited)) {
			setProblem("Enter the person’s email address.");
			return;
		}
		setProblem("");
		setCopied(false);
		const request = freshness.current;
		try {
			const started = await client.start(invited);
			if (request === freshness.current) setJob(started);
		} catch (error) {
			if (request !== freshness.current) return;
			const current = await refresh();
			if (current?.available === true)
				setProblem(error instanceof Error ? error.message : "The link could not be created. Try again.");
		}
	}

	async function copyLink(): Promise<void> {
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
	return {
		available,
		connected: available ? model.included : undefined,
		open,
		trigger: available ? (
			<button
				type="button"
				ref={trigger}
				className="spool-bar-share"
				aria-label={publication === undefined ? "Share" : "Share ↗"}
				aria-expanded={open}
				aria-haspopup="dialog"
				onClick={(event) => {
					setInstant(event.detail === 0);
					void refresh().then((next) => {
						if (next?.available === true) setOpen(true);
					});
				}}
			>
				Share
			</button>
		) : null,
		surface: (
			<ShareSurface
				open={open}
				instant={instant}
				model={model}
				job={job}
				publication={publication}
				details={details}
				email={email}
				problem={problem}
				copied={copied}
				trigger={trigger}
				onDetails={setDetails}
				onEmail={setEmail}
				onClose={close}
				onCreate={() => void create()}
				onCopy={() => void copyLink()}
			/>
		),
	};
}

function ShareSurface({
	open,
	instant,
	model,
	job,
	publication,
	details,
	email,
	problem,
	copied,
	trigger,
	onDetails,
	onEmail,
	onClose,
	onCreate,
	onCopy,
}: {
	open: boolean;
	instant: boolean;
	model: PlayerPublicationModel | undefined;
	job: PlayerPublicationJob | undefined;
	publication: PlayerPublication | undefined;
	details: boolean;
	email: string;
	problem: string;
	copied: boolean;
	trigger: RefObject<HTMLButtonElement | null>;
	onDetails(value: boolean): void;
	onEmail(value: string): void;
	onClose(immediate: boolean): void;
	onCreate(): void;
	onCopy(): void;
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
	const retry = job?.state === "failed" && job.retryable;
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
					{publication === undefined ? (
						<>
							<p className="spool-sharing-muted">Let someone try what you made.</p>
							<form
								className="spool-sharing-form"
								onSubmit={(event) => {
									event.preventDefault();
									onCreate();
								}}
							>
								<label htmlFor="spool-share-email">Who should see it?</label>
								<input
									id="spool-share-email"
									type="email"
									placeholder="Email address"
									value={email}
									disabled={running}
									onChange={(event) => onEmail(event.target.value)}
								/>
								<p>Only people you add can open this link.</p>
							</form>
						</>
					) : (
						<>
							<input aria-label="Shared link" readOnly value={publication.url} className="spool-sharing-link" />
							<div className="spool-sharing-actions">
								<button type="button" className="spool-button is-primary" onClick={onCopy}>
									{copied ? "Copied" : "Copy link"}
								</button>
								<a className="spool-button" href={publication.url} target="_blank" rel="noopener noreferrer">
									Open link ↗
								</a>
							</div>
							{publication.invitedEmails.map((person) => (
								<div className="spool-sharing-person" key={person}>
									<span>{person.slice(0, 1).toUpperCase()}</span>
									<strong>{person}</strong>
									<small>can view</small>
								</div>
							))}
						</>
					)}
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
					{publication === undefined && (
						<button
							type="button"
							className="spool-button is-primary"
							disabled={running || model?.ready === false || (job?.state === "failed" && !retry)}
							onClick={onCreate}
						>
							{running ? "Creating link…" : retry ? "Retry" : "Create link"}
						</button>
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
