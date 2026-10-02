import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useId, useState } from "react";
import { type PlayerPublicationJob, type PlayerPublicationModel, readinessProblems } from "./player-publication-client";

const EASE = [0.22, 0.61, 0.36, 1] as const;
const MAILBOX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export type ShareAccessMode = "invited" | "public";

/**
 * What a frame's label says about its link. The label is the whole progress
 * surface: a ring fills while files land, a dot once the link opens, a hollow
 * dot once the work has moved past what the link shows.
 */
export type ShareChip =
	| { kind: "preparing" }
	| { kind: "copied" }
	| { kind: "uploading"; fraction: number }
	| { kind: "updating"; fraction: number }
	| { kind: "interrupted" }
	| { kind: "changed" }
	| { kind: "updated" }
	| { kind: "shared" };

export function chipWord(chip: ShareChip): string {
	switch (chip.kind) {
		case "preparing":
			return "preparing link";
		case "copied":
			return "link copied";
		case "uploading":
			return `uploading ${Math.floor(chip.fraction * 100)}%`;
		case "updating":
			return "updating";
		case "interrupted":
			return "interrupted";
		case "changed":
			return "changed";
		case "updated":
			return "updated";
		case "shared":
			return "shared";
	}
}

export function ShareChipButton({
	chip,
	onOpen,
	expanded,
}: {
	chip: ShareChip;
	onOpen: () => void;
	expanded?: boolean;
}) {
	const reduced = useReducedMotion() ?? false;
	const word = chipWord(chip);
	return (
		<button
			type="button"
			className="spool-share-chip"
			data-kind={chip.kind}
			aria-label={`Sharing: ${word}`}
			aria-haspopup="dialog"
			{...(expanded === undefined ? {} : { "aria-expanded": expanded })}
			onPointerDown={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onClick={(event) => {
				event.stopPropagation();
				onOpen();
			}}
		>
			<span className="spool-share-glyph" aria-hidden="true">
				<ChipGlyph chip={chip} />
			</span>
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.span
					// a count that climbs is one word changing, not a new word arriving
					key={chip.kind}
					initial={{ opacity: 0, y: reduced ? 0 : 3 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: reduced ? 0 : -3 }}
					transition={{ duration: reduced ? 0 : 0.17, ease: EASE }}
				>
					{word}
				</motion.span>
			</AnimatePresence>
		</button>
	);
}

function ChipGlyph({ chip }: { chip: ShareChip }) {
	if (chip.kind === "copied") return <CheckGlyph />;
	if (chip.kind === "preparing") return <RingGlyph spin />;
	if (chip.kind === "uploading" || chip.kind === "updating") return <RingGlyph fraction={chip.fraction} />;
	return <span className="spool-share-dot" data-hollow={chip.kind === "changed" || chip.kind === "interrupted"} />;
}

function RingGlyph({ fraction, spin = false }: { fraction?: number; spin?: boolean }) {
	return (
		<svg
			viewBox="0 0 10 10"
			className={spin ? "spool-share-ring is-spinning" : "spool-share-ring"}
			fill="none"
			aria-hidden="true"
		>
			<circle cx="5" cy="5" r="3.75" strokeWidth="1.5" className="spool-share-ring-track" />
			<circle
				cx="5"
				cy="5"
				r="3.75"
				strokeWidth="1.5"
				pathLength={1}
				strokeDasharray={spin ? "0.3 0.7" : "1"}
				strokeDashoffset={spin ? 0 : 1 - Math.max(0.06, Math.min(1, fraction ?? 0))}
				className="spool-share-ring-fill"
			/>
		</svg>
	);
}

function CheckGlyph() {
	return (
		<svg viewBox="0 0 10 10" className="spool-share-check" fill="none" aria-hidden="true">
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

/** How far the files have come, as one number the ring and the hairline both read. */
export function jobFraction(job: PlayerPublicationJob | undefined): number {
	if (job?.state !== "running") return 0;
	if (job.phase === "capturing") return 0;
	if (job.phase === "sealing" || job.phase === "activating") return 1;
	const upload = job.upload;
	return upload !== undefined && upload.totalBytes > 0 ? upload.completedBytes / upload.totalBytes : 0;
}

export interface SharePanelProps {
	model: PlayerPublicationModel | undefined;
	/** the entry last seen, so the panel keeps its name while the model is being asked for again */
	entry: string | undefined;
	job: PlayerPublicationJob | undefined;
	starting: boolean;
	active: boolean;
	changed: boolean;
	url: string | undefined;
	mode: ShareAccessMode;
	onMode: (mode: ShareAccessMode) => void;
	recipients: string[];
	onRecipients: (next: string[]) => void;
	copied: boolean;
	problem: string;
	blocked: boolean;
	mutating: boolean;
	stopping: boolean;
	onStopping: (next: boolean) => void;
	onCreate: (recipients: string[]) => void;
	onUpdate: () => void;
	onCopy: () => void;
	onAccess: (value: { mode: ShareAccessMode; emails: string[]; expectedGeneration: number }) => Promise<boolean>;
	onStop: () => void;
	onCheck: () => void;
}

/**
 * The popover's body: the form that makes a link when there is none, and the
 * link itself once there is. The link is usable from the moment it has an
 * address, so it shows while the files are still landing, with the field's
 * own bottom edge as the only progress bar.
 */
export function SharePanel(props: SharePanelProps) {
	const { model } = props;
	if (model === undefined)
		return (
			<div className="spool-share-body">
				<Header entry={props.entry} included={undefined} />
				<p className="spool-share-note" role="status">
					Checking sharing…
				</p>
				<div className="spool-share-row">
					{props.problem ? <p className="spool-share-note is-problem">{props.problem}</p> : <span />}
					<SmallButton onClick={props.onCheck}>Check status</SmallButton>
				</div>
			</div>
		);
	if (!model.available)
		return (
			<div className="spool-share-body">
				<Header entry={model.entry} included={undefined} />
				<p className="spool-share-note">
					spool cloud isn’t connected. Run <code>spool login</code>, or sign in from the app’s Cloud Account menu.
				</p>
				<div className="spool-share-row">
					<span />
					<SmallButton onClick={props.onCheck}>Check again</SmallButton>
				</div>
			</div>
		);
	const running = props.starting || props.job?.state === "running";
	// a first link that failed goes back to its form, recipients and all, to be retried
	return props.active || running ? (
		<Manage {...props} model={model} running={running} />
	) : (
		<Compose {...props} model={model} />
	);
}

function Header({
	entry,
	included,
	status,
}: {
	entry: string | undefined;
	included: string[] | undefined;
	status?: string | undefined;
}) {
	const [open, setOpen] = useState(false);
	const leaf = entry?.split("/").at(-1);
	return (
		<header className="spool-share-header">
			<div>
				<h2>{leaf === undefined ? "Share" : `Share ${leaf}`}</h2>
				{entry !== undefined && included !== undefined && (
					<button
						type="button"
						className="spool-share-scope"
						aria-label="What they can see"
						aria-expanded={open}
						onClick={() => setOpen(!open)}
					>
						{`from ${leaf} · ${included.length} ${included.length === 1 ? "frame" : "frames"}`}
					</button>
				)}
			</div>
			{status !== undefined && <span className="spool-share-status">{status}</span>}
			{open && included !== undefined && (
				<section className="spool-share-included" aria-label="Included frames">
					{included.map((frame) => (
						<code key={frame}>{frame}</code>
					))}
				</section>
			)}
		</header>
	);
}

function Compose({ model, ...props }: SharePanelProps & { model: PlayerPublicationModel }) {
	const [draft, setDraft] = useState("");
	const [error, setError] = useState("");
	const failed = props.job?.state === "failed" ? props.job : undefined;
	const notReady = !model.ready;
	const problems = readinessProblems(model.diagnostics);
	const disabled = props.blocked || props.mutating || props.starting;
	const create = () => {
		const next = props.mode === "invited" ? collect(props.recipients, draft) : { list: props.recipients };
		if ("error" in next) {
			setError(next.error);
			return;
		}
		if (props.mode === "invited" && next.list.length === 0) {
			setError("Add at least one email address.");
			return;
		}
		setError("");
		setDraft("");
		props.onRecipients(next.list);
		props.onCreate(next.list);
	};
	return (
		<div className="spool-share-body">
			<Header entry={model.entry} included={model.included} />
			<AccessField
				mode={props.mode}
				onMode={(mode) => {
					props.onMode(mode);
					setError("");
				}}
				recipients={props.recipients}
				onRecipients={props.onRecipients}
				draft={draft}
				onDraft={(value) => {
					setDraft(value);
					setError("");
				}}
				error={error}
				onError={setError}
				disabled={disabled}
			/>
			{notReady && problems.length > 0 && (
				<div className="spool-share-problem" role="status">
					<p>
						{problems.length === 1
							? "This journey isn’t ready to share."
							: `This journey isn’t ready to share: ${problems.length} things to fix.`}
					</p>
					<ul aria-label="What to fix">
						{problems.map((problem) => (
							<li key={problem.key}>
								<p>
									{problem.message} {problem.remedy}
								</p>
								<code>
									{problem.location ?? problem.frames[0]}
									{problem.location !== undefined &&
										` · ${problem.frames.length === 1 ? problem.frames[0] : `${problem.frames.length} frames`}`}
								</code>
							</li>
						))}
					</ul>
				</div>
			)}
			{failed !== undefined && <p className="spool-share-note is-problem">{failed.message}</p>}
			{props.problem && failed === undefined && <p className="spool-share-note is-problem">{props.problem}</p>}
			<button
				type="button"
				data-autofocus={props.mode === "public" || undefined}
				className="spool-share-primary"
				disabled={disabled || notReady || (failed !== undefined && !failed.retryable)}
				onClick={create}
			>
				{failed !== undefined ? "Retry" : "Create and copy link"}
			</button>
		</div>
	);
}

function collect(recipients: string[], draft: string): { list: string[] } | { error: string } {
	const typed = draft
		.split(/[\s,;]+/u)
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean);
	const invalid = typed.find((value) => !MAILBOX.test(value));
	if (invalid !== undefined) return { error: `Check this address: ${invalid}` };
	const list = [...new Set([...recipients, ...typed])];
	if (list.length > 100) return { error: "You can add up to 100 people." };
	return { list };
}

/**
 * Who can open it: two answers side by side, because there are only two and
 * a select hides the one you did not pick. Invited shows its people as chips
 * you can take out; Enter, a comma or leaving the field adds what was typed.
 */
function AccessField({
	mode,
	onMode,
	recipients,
	onRecipients,
	draft,
	onDraft,
	error,
	onError,
	disabled,
}: {
	mode: ShareAccessMode;
	onMode: (mode: ShareAccessMode) => void;
	recipients: string[];
	onRecipients: (next: string[]) => void;
	draft: string;
	onDraft: (value: string) => void;
	error: string;
	onError: (value: string) => void;
	disabled: boolean;
}) {
	const group = useId();
	const add = () => {
		if (draft.trim() === "") return;
		const next = collect(recipients, draft);
		if ("error" in next) {
			onError(next.error);
			return;
		}
		onRecipients(next.list);
		onDraft("");
	};
	return (
		<div className="spool-share-access">
			<fieldset className="spool-share-modes">
				<legend>Who can open this link?</legend>
				{(["invited", "public"] as const).map((value) => (
					<label key={value}>
						<input
							type="radio"
							name={group}
							checked={mode === value}
							disabled={disabled}
							onChange={() => onMode(value)}
						/>
						<span>{value === "invited" ? "Invited people" : "Anyone with the link"}</span>
					</label>
				))}
			</fieldset>
			{mode === "invited" && (
				<div className="spool-share-people" data-problem={error !== "" || undefined}>
					{recipients.map((email) => (
						<span key={email} className="spool-share-person">
							{email}
							<button
								type="button"
								aria-label={`Remove ${email}`}
								disabled={disabled}
								onClick={() => onRecipients(recipients.filter((value) => value !== email))}
							>
								×
							</button>
						</span>
					))}
					<input
						data-autofocus
						aria-label="Email addresses"
						placeholder={recipients.length === 0 ? "name@company.com" : "Add another"}
						value={draft}
						disabled={disabled}
						onChange={(event) => onDraft(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === ",") {
								event.preventDefault();
								add();
							}
							if (event.key === "Backspace" && draft === "" && recipients.length > 0)
								onRecipients(recipients.slice(0, -1));
						}}
						onBlur={add}
					/>
				</div>
			)}
			<p
				className={error === "" ? "spool-share-note" : "spool-share-note is-problem"}
				role={error ? "alert" : undefined}
			>
				{error !== ""
					? error
					: mode === "invited"
						? "They sign in with that address to open it."
						: "Anyone who has the link can open it, without signing in."}
			</p>
		</div>
	);
}

function Manage({ model, running, ...props }: SharePanelProps & { model: PlayerPublicationModel; running: boolean }) {
	const reduced = useReducedMotion() ?? false;
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");
	const [error, setError] = useState("");
	const job = props.job;
	const failed = job?.state === "failed" ? job : undefined;
	const updating = running && job?.kind === "update";
	const fraction = running ? jobFraction(job) : 1;
	const access = model.access;
	// a link still on its way has no access on record yet: it has the one just chosen
	const savedMode = access?.mode ?? (props.active ? "invited" : props.mode);
	const count = props.active || model.recipients.length > 0 ? model.recipients.length : props.recipients.length;
	const status = running
		? updating
			? "updating"
			: job?.state === "running" && job.phase === "uploading" && job.upload !== undefined
				? `${job.upload.completedObjects} of ${job.upload.totalObjects} files`
				: job?.state === "running" && (job.phase === "sealing" || job.phase === "activating")
					? "finishing"
					: "preparing"
		: failed !== undefined
			? "interrupted"
			: props.changed
				? "changed"
				: "shared";
	const fade = {
		initial: { opacity: 0, y: reduced ? 0 : 4 },
		animate: { opacity: 1, y: 0 },
		exit: { opacity: 0 },
		transition: { duration: reduced ? 0 : 0.17, ease: EASE },
	};
	const line = running
		? updating
			? "People on the old version keep it until they reload."
			: "It opens for them once the upload finishes."
		: failed !== undefined
			? failed.message
			: props.changed
				? `${model.entry.split("/").at(-1)} changed since the link was last updated.`
				: undefined;
	return (
		<div className="spool-share-body is-manage">
			<Header entry={model.entry} included={model.included} status={status} />
			<div className="spool-share-link" data-running={running || undefined}>
				<input
					aria-label="Shared link"
					readOnly
					value={props.url ?? ""}
					placeholder="reserving the link…"
					onFocus={(event) => event.target.select()}
				/>
				<button
					type="button"
					data-autofocus
					aria-label={props.copied ? "Copied" : "Copy link"}
					disabled={props.url === undefined}
					onClick={props.onCopy}
				>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span key={props.copied ? "copied" : "copy"} {...fade}>
							{props.copied ? (
								<>
									<span className="spool-share-glyph">
										<CheckGlyph />
									</span>
									Copied
								</>
							) : (
								"Copy"
							)}
						</motion.span>
					</AnimatePresence>
				</button>
				<span className="spool-share-hairline" style={{ transform: `scaleX(${fraction})` }} />
			</div>
			<AnimatePresence mode="popLayout" initial={false}>
				{line !== undefined && (
					<motion.div key={line} {...fade} className="spool-share-row">
						<p
							className={failed === undefined ? "spool-share-note" : "spool-share-note is-problem"}
							role="status"
						>
							{line}
						</p>
						{failed?.retryable && (
							<SmallButton primary disabled={props.blocked} onClick={props.onUpdate}>
								Retry
							</SmallButton>
						)}
						{!running && failed === undefined && props.changed && (
							<SmallButton primary label="Update link" disabled={props.blocked} onClick={props.onUpdate}>
								Update
							</SmallButton>
						)}
					</motion.div>
				)}
			</AnimatePresence>
			{props.problem && props.problem !== failed?.message && (
				<p className="spool-share-note is-problem">{props.problem}</p>
			)}
			<div className="spool-share-sections">
				<button
					type="button"
					className="spool-share-section"
					aria-expanded={editing}
					disabled={!props.active}
					onClick={() => {
						if (!editing) {
							props.onMode(savedMode);
							props.onRecipients(model.recipients);
							setDraft("");
							setError("");
						}
						setEditing(!editing);
					}}
				>
					<span>{savedMode === "public" ? "Anyone with the link" : "Invited people"}</span>
					<span className="spool-share-status">
						{savedMode === "public" ? "public" : `${count} ${count === 1 ? "person" : "people"}`}
						<svg viewBox="0 0 10 10" aria-hidden="true" data-open={editing}>
							<path d="m2 3.5 3 3 3-3" stroke="currentColor" strokeWidth="1.3" fill="none" />
						</svg>
					</span>
				</button>
				<AnimatePresence initial={false}>
					{editing && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: reduced ? 0 : 0.2, ease: EASE }}
							className="spool-share-drawer"
						>
							<div>
								<AccessField
									mode={props.mode}
									onMode={props.onMode}
									recipients={props.recipients}
									onRecipients={props.onRecipients}
									draft={draft}
									onDraft={(value) => {
										setDraft(value);
										setError("");
									}}
									error={error}
									onError={setError}
									disabled={props.blocked || props.mutating}
								/>
								<div className="spool-share-row">
									<span className="spool-share-note">It keeps the same link.</span>
									<SmallButton
										primary
										disabled={props.blocked || props.mutating}
										onClick={async () => {
											const next =
												props.mode === "invited"
													? collect(props.recipients, draft)
													: { list: props.recipients };
											if ("error" in next) {
												setError(next.error);
												return;
											}
											if (props.mode === "invited" && next.list.length === 0) {
												setError("Add at least one email address.");
												return;
											}
											props.onRecipients(next.list);
											setDraft("");
											if (
												await props.onAccess({
													mode: props.mode,
													emails: next.list,
													expectedGeneration:
														access?.generation ?? model.publication?.accessGeneration ?? 0,
												})
											)
												setEditing(false);
										}}
									>
										Save access
									</SmallButton>
								</div>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
			{props.active && (
				<footer className="spool-share-footer">
					<AnimatePresence mode="popLayout" initial={false}>
						{props.stopping ? (
							<motion.div key="stopping" {...fade} className="spool-share-row">
								<span>Stop it for everyone?</span>
								<span className="spool-share-actions">
									<SmallButton disabled={props.mutating} onClick={() => props.onStopping(false)}>
										Keep
									</SmallButton>
									<SmallButton primary disabled={props.mutating} onClick={props.onStop}>
										Stop link
									</SmallButton>
								</span>
							</motion.div>
						) : (
							<motion.div key="rest" {...fade} className="spool-share-row">
								{props.url !== undefined && props.active ? (
									<a className="spool-share-text" href={props.url} target="_blank" rel="noopener noreferrer">
										Open link ↗
									</a>
								) : (
									<span />
								)}
								{props.active && (
									<button
										type="button"
										className="spool-share-text is-stop"
										disabled={props.mutating}
										onClick={() => props.onStopping(true)}
									>
										Stop sharing
									</button>
								)}
							</motion.div>
						)}
					</AnimatePresence>
				</footer>
			)}
		</div>
	);
}

function SmallButton({
	primary = false,
	disabled = false,
	label,
	onClick,
	children,
}: {
	primary?: boolean;
	disabled?: boolean;
	label?: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className={primary ? "spool-share-small is-primary" : "spool-share-small"}
			disabled={disabled}
			{...(label === undefined ? {} : { "aria-label": label })}
			onClick={onClick}
		>
			{children}
		</button>
	);
}
