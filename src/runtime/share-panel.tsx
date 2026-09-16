import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import type { PlayerPublicationJob, PlayerPublicationModel } from "./player-publication-client";

const EASE = [0.23, 1, 0.32, 1] as const;
export function ShareProgress({ job, starting }: { job: PlayerPublicationJob | undefined; starting: boolean }) {
	const running = job?.state === "running" ? job : undefined;
	const phase = running?.phase ?? "capturing";
	const upload = running?.upload;
	const fraction = upload && upload.totalBytes > 0 ? upload.completedBytes / upload.totalBytes : undefined;
	const label = starting
		? "starting share"
		: phase === "capturing"
			? "preparing frames"
			: phase === "uploading"
				? "uploading"
				: "making link ready";
	return (
		<div className="spool-share-progress" role="status">
			<div className="spool-share-between">
				<strong>{label}</strong>
				{fraction !== undefined && phase === "uploading" && <span>{Math.floor(fraction * 100)}%</span>}
			</div>
			{phase === "uploading" && (
				<>
					<div
						className="spool-share-meter"
						role="progressbar"
						aria-label="Upload progress"
						{...(fraction === undefined
							? {}
							: { "aria-valuenow": Math.floor(fraction * 100), "aria-valuemin": 0, "aria-valuemax": 100 })}
					>
						<span style={{ transform: `scaleX(${fraction ?? 0.15})` }} />
					</div>
					<div className="spool-share-between spool-share-muted spool-share-mono">
						{upload ? (
							<>
								<span>
									{formatBytes(upload.completedBytes)} / {formatBytes(upload.totalBytes)}
								</span>
								<span>
									{upload.completedObjects} / {upload.totalObjects} files
								</span>
							</>
						) : (
							<span>Uploading the prepared website.</span>
						)}
					</div>
				</>
			)}
			{phase !== "uploading" && (
				<p className="spool-share-muted">
					{phase === "capturing"
						? "Preparing the connected journey."
						: "Upload complete. Checking the link before it opens."}
				</p>
			)}
			<div className="spool-share-steps">
				<span data-current={phase === "capturing"}>prepare</span>
				<span data-current={phase === "uploading"}>upload</span>
				<span data-current={phase === "sealing" || phase === "activating"}>ready</span>
			</div>
		</div>
	);
}
function formatBytes(bytes: number) {
	return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} kb` : `${(bytes / 1024 / 1024).toFixed(1)} mb`;
}
export function SharingPanel({
	model,
	job,
	starting,
	active,
	changed,
	email,
	onEmail,
	mode,
	onMode,
	copied,
	problem,
	blocked,
	mutation,
	onPublish,
	onCopy,
	onClose,
	onAccess,
	onStop,
	onCheck,
	instant,
}: {
	model: PlayerPublicationModel | undefined;
	job: PlayerPublicationJob | undefined;
	starting: boolean;
	active: boolean;
	changed: boolean;
	email: string;
	onEmail: (email: string) => void;
	mode: "invited" | "public";
	onMode: (mode: "invited" | "public") => void;
	copied: boolean;
	problem: string;
	blocked: boolean;
	mutation: boolean;
	onPublish: (emails?: string[]) => void;
	onCopy: () => void;
	onClose: () => void;
	onAccess: (value: { mode: "invited" | "public"; emails: string[]; expectedGeneration: number }) => Promise<boolean>;
	onStop: () => void;
	onCheck: () => void;
	instant: boolean;
}) {
	const [editing, setEditing] = useState(false);
	const [stopping, setStopping] = useState(false);
	const [scope, setScope] = useState(false);
	const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => setReduced(query.matches);
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);
	const still = instant || reduced;
	const running = starting || job?.state === "running";
	const ready = active && !changed;
	const access = model?.access;
	const publication = model?.publication;
	const view = running ? "progress" : editing || !active ? `access-${mode}` : "ready";
	return (
		<motion.div
			layout={false}
			transition={{ layout: { duration: still ? 0 : 0.18, ease: EASE } }}
			className="spool-share-content"
		>
			<p className="spool-share-muted">A playable journey, starting from {model?.entry ?? "this frame"}.</p>
			<button
				type="button"
				className="spool-share-scope spool-share-between"
				aria-label="What they can see"
				aria-expanded={scope}
				onClick={() => setScope(!scope)}
			>
				<span>{model?.entry ?? "checking journey"}</span>
				<span>
					{model?.included.length ?? "…"} frames {scope ? "−" : "+"}
				</span>
			</button>
			{scope && (
				<section aria-label="Included frames" className="spool-share-muted">
					{model?.included.map((frame) => (
						<code key={frame}>{frame} </code>
					))}
				</section>
			)}
			<AnimatePresence initial={false} mode="popLayout">
				<motion.div
					key={view}
					layout={still ? false : "position"}
					initial={{ opacity: still ? 1 : 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: still ? 0 : 0.1 }}
				>
					<PresenceContents>
						{running ? (
							<>
								<ShareProgress job={job} starting={starting} />
								<p className="spool-share-muted">
									{active
										? "The previous version stays available."
										: "Keep working. Sharing continues in the background."}
								</p>
								<button type="button" className="spool-share-text" onClick={onClose}>
									Continue working
								</button>
							</>
						) : editing || !active ? (
							<ShareAccessEditor
								key={editing ? "edit" : "create"}
								mode={mode}
								onMode={onMode}
								emails={email}
								onEmails={onEmail}
								disabled={
									blocked ||
									mutation ||
									model?.ready === false ||
									model === undefined ||
									model.available === false ||
									(job?.state === "failed" && !job.retryable)
								}
								existing={editing}
								onSave={async (values) => {
									if (editing) {
										if (
											await onAccess({
												mode,
												emails: values,
												expectedGeneration: access?.generation ?? publication?.accessGeneration ?? 0,
											})
										)
											setEditing(false);
									} else onPublish(values);
								}}
								retry={job?.state === "failed"}
							/>
						) : (
							<>
								<div className="spool-share-between">
									<strong>{ready ? "Your link is ready" : "Your edits are still local."}</strong>
									<span className="spool-share-mono spool-share-muted">
										{access?.mode === "public" ? "public link" : "invite only"}
									</span>
								</div>
								<input
									className="spool-share-link"
									aria-label="Shared link"
									readOnly
									value={publication?.url ?? ""}
									onFocus={(event) => event.target.select()}
								/>
								<div className="spool-share-between">
									<span className="spool-share-muted">
										{access?.mode === "public"
											? "Anyone with the link can open it."
											: model?.recipients.length === 1
												? "1 person has access."
												: `${model?.recipients.length ?? 0} people have access.`}
									</span>
									<button type="button" className="spool-share-primary" onClick={onCopy}>
										{copied ? "Copied" : "Copy link"}
									</button>
								</div>
								<p className="spool-share-muted">
									{access?.mode === "public"
										? "No sign-in required."
										: "Send them the link. Invitation emails haven’t been sent."}
								</p>
								{changed && (
									<>
										<button
											type="button"
											className="spool-share-primary"
											disabled={blocked}
											onClick={() => onPublish()}
										>
											{job?.state === "failed" ? "Retry update" : "Update link"}
										</button>
										<p className="spool-share-muted">Update the same link. No need to send it again.</p>
									</>
								)}
								<div className="spool-share-between">
									<button
										type="button"
										className="spool-share-text"
										onClick={() => {
											onEmail(model?.recipients.join(", ") ?? "");
											onMode(access?.mode ?? "invited");
											setEditing(true);
										}}
									>
										Manage access
									</button>
									<a
										className="spool-share-text"
										href={publication?.url}
										target="_blank"
										rel="noopener noreferrer"
									>
										Open link
									</a>
								</div>
								<button type="button" className="spool-share-text" onClick={() => setStopping(true)}>
									Stop sharing…
								</button>
							</>
						)}
					</PresenceContents>
				</motion.div>
			</AnimatePresence>
			{problem && (
				<p className="spool-share-error" role="status">
					{problem}
				</p>
			)}
			{model?.ready === false && model.diagnostics[0] && <p role="status">{model.diagnostics[0].message}</p>}
			{model === undefined && (
				<>
					<p role="status">Checking sharing…</p>
					<button type="button" className="spool-share-text" onClick={onCheck}>
						Check status
					</button>
				</>
			)}
			{model?.available === false && <p role="status">Sign in through Cloud Account to share this prototype.</p>}
			{stopping && (
				<div className="spool-share-confirm">
					<p>Stop this link from opening? Your local work stays here.</p>
					<div className="spool-share-between">
						<button
							type="button"
							className="spool-share-text"
							disabled={mutation}
							onClick={() => setStopping(false)}
						>
							Keep sharing
						</button>
						<button type="button" className="spool-share-primary" disabled={mutation} onClick={onStop}>
							Stop sharing
						</button>
					</div>
				</div>
			)}
			<footer className="spool-share-footer">Edits stay local until you update the link.</footer>
		</motion.div>
	);
}
function ShareAccessEditor({
	mode,
	onMode,
	emails,
	onEmails,
	disabled,
	existing,
	onSave,
	retry,
}: {
	mode: "invited" | "public";
	onMode: (mode: "invited" | "public") => void;
	emails: string;
	onEmails: (value: string) => void;
	disabled: boolean;
	existing: boolean;
	onSave: (emails: string[]) => void;
	retry: boolean;
}) {
	const [draft, setDraft] = useState("");
	const [error, setError] = useState("");
	const selected = emails.split(/[\s,;]+/u).filter(Boolean);
	const collect = () => {
		const list = [
			...new Set([...selected, ...draft.split(/[\s,;]+/u).filter(Boolean)].map((value) => value.toLowerCase())),
		];
		const invalid = list.find((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value));
		if (invalid || list.length > 100) {
			setError(invalid ? `Check this address: ${invalid}` : "You can add up to 100 people.");
			return;
		}
		setError("");
		return list;
	};
	const add = () => {
		const list = collect();
		if (list) {
			onEmails(list.join(", "));
			setDraft("");
		}
	};
	return (
		<div className="spool-share-access">
			<label htmlFor="spool-share-access">Who can open this link?</label>
			<select
				id="spool-share-access"
				value={mode}
				disabled={disabled}
				onChange={(event) => onMode(event.target.value === "public" ? "public" : "invited")}
			>
				<option value="invited">Only invited people</option>
				<option value="public">Anyone with the link</option>
			</select>
			{mode === "invited" ? (
				<>
					<div className="spool-share-recipients">
						{selected.map((value) => (
							<span key={value}>
								{value}
								<button
									type="button"
									aria-label={`Remove ${value}`}
									disabled={disabled}
									onClick={() => onEmails(selected.filter((email) => email !== value).join(", "))}
								>
									×
								</button>
							</span>
						))}
					</div>
					<div className="spool-share-address">
						<input
							aria-label="Email addresses"
							placeholder="Add email addresses"
							value={draft}
							disabled={disabled}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									add();
								}
							}}
						/>
						<button type="button" className="spool-share-text" disabled={disabled} onClick={add}>
							Add
						</button>
					</div>
					<p className="spool-share-muted">
						Paste several addresses, separated by commas. They’ll sign in to open the link.
					</p>
				</>
			) : (
				<p>Anyone who receives or forwards this link can open it. No sign-in required.</p>
			)}
			{error && <p role="alert">{error}</p>}
			<button
				type="button"
				className="spool-share-primary spool-share-full"
				disabled={disabled}
				onClick={() => {
					const list = mode === "public" ? selected : collect();
					if (!list) return;
					if (mode === "invited" && list.length === 0) {
						setError("Add at least one email address.");
						return;
					}
					onEmails(list.join(", "));
					setDraft("");
					onSave(list);
				}}
			>
				{existing ? "Save access" : retry ? "Retry" : "Create link"}
			</button>
			<p className="spool-share-muted">
				{existing ? "Access changes keep the same link." : "You’ll copy and send the link once it’s ready."}
			</p>
		</div>
	);
}
function PresenceContents({ children }: { children: ReactNode }) {
	const present = useIsPresent();
	return (
		<div style={{ display: "contents" }} inert={!present} aria-hidden={!present || undefined}>
			{children}
		</div>
	);
}
