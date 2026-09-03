import { type AppUpdate, DOWNLOAD_URL } from "./desktop-bridge";
import { CloseIcon } from "./icons";

/**
 * The update toast (#30), on the Trash-toast pattern (#13): raised pill,
 * bottom center, thread only on the one action. Three states — offer, updating,
 * failed. Success needs no state: the page reloads itself onto the new daemon.
 *
 * Updating carries a stage because the two halves of an upgrade feel different
 * and take different amounts of time — the install runs against a daemon that
 * is still answering, the restart against one that is gone — and a person
 * watching a pill that says one thing for a minute has no way to tell a slow
 * step from a dead one. The hairline sweeps for the same reason the drain bar
 * on the Trash toast empties: motion is what says the thing is still running.
 *
 * Inside the Mac app there is a second thing that can be out of date, the app
 * itself, and its update arrives over the app's bridge rather than from the
 * daemon. It wears the same pill so there is one place an update ever appears,
 * and says "Spool" rather than "update" so it is clear which of the two it is.
 * Its download has a real percent, so its hairline fills instead of sweeping.
 */

export type UpdateToast =
	| { kind: "offer"; latest: string }
	/** installing: the old daemon still answers. restarting: it has gone to be replaced. */
	| { kind: "updating"; stage: "installing" | "restarting" }
	| { kind: "failed"; message?: string }
	/** The Mac app's own update, as the app reports it. */
	| { kind: "app"; update: AppUpdate };

/** Whether the pill is mid-flight, with nothing a hand should do to it. */
export function updateToastBusy(toast: UpdateToast): boolean {
	if (toast.kind === "updating") return true;
	return toast.kind === "app" && (toast.update.kind === "downloading" || toast.update.kind === "restarting");
}

export function UpdateToastPill({
	toast,
	aboveCanvasTools = false,
	stacked = false,
	onUpdate,
	onDismiss,
}: {
	toast: UpdateToast;
	aboveCanvasTools?: boolean;
	/** another toast holds the bottom slot — sit above it rather than on it */
	stacked?: boolean;
	onUpdate: () => void;
	onDismiss: () => void;
}) {
	return (
		<div
			className={`-translate-x-1/2 fixed left-1/2 z-20 flex items-center gap-4 overflow-hidden rounded-md border border-border-raised bg-raised px-3.5 py-2.5 ${
				aboveCanvasTools ? "bottom-[120px]" : stacked ? "bottom-[72px]" : "bottom-6"
			}`}
		>
			{toast.kind === "offer" && (
				<>
					<span className="text-base text-text leading-base">Update available — v{toast.latest}</span>
					<button type="button" className="font-medium text-base text-thread leading-base" onClick={onUpdate}>
						Update
					</button>
				</>
			)}
			{toast.kind === "updating" && (
				<>
					<span className="text-base text-muted leading-base">
						{toast.stage === "installing" ? "Installing update…" : "Restarting…"}
					</span>
					<span className="absolute bottom-0 left-0 h-px w-1/3 animate-toast-sweep bg-thread" />
				</>
			)}
			{toast.kind === "failed" && (
				<>
					<span className="text-base text-text leading-base">{toast.message ?? "Update failed"}</span>
					<span className="h-4 w-px bg-border-raised" />
					<span className="font-mono text-muted text-xs leading-xs">spool upgrade</span>
				</>
			)}
			{toast.kind === "app" && <AppUpdateBody update={toast.update} onUpdate={onUpdate} />}
			{!updateToastBusy(toast) && (
				<button
					type="button"
					className="flex items-center text-muted hover:text-text"
					onClick={onDismiss}
					title="Dismiss"
				>
					<CloseIcon />
				</button>
			)}
		</div>
	);
}

function AppUpdateBody({ update, onUpdate }: { update: AppUpdate; onUpdate: () => void }) {
	switch (update.kind) {
		case "offer":
			return (
				<>
					<span className="text-base text-text leading-base">Spool {update.version} is out</span>
					<button type="button" className="font-medium text-base text-thread leading-base" onClick={onUpdate}>
						Update
					</button>
				</>
			);
		case "downloading":
			return (
				<>
					<span className="text-base text-muted leading-base">
						Downloading Spool {update.version} · {update.percent}%
					</span>
					<span
						className="absolute bottom-0 left-0 h-px bg-thread transition-[width] duration-300"
						style={{ width: `${update.percent}%` }}
					/>
				</>
			);
		case "restarting":
			return (
				<>
					<span className="text-base text-muted leading-base">Restarting into Spool {update.version}…</span>
					<span className="absolute bottom-0 left-0 h-px w-1/3 animate-toast-sweep bg-thread" />
				</>
			);
		case "failed":
			return (
				<>
					<span className="max-w-[56ch] text-base text-text leading-base">{update.message}</span>
					<span className="h-4 w-px bg-border-raised" />
					<a
						href={DOWNLOAD_URL}
						target="_blank"
						rel="noreferrer"
						className="whitespace-nowrap font-medium text-base text-thread leading-base"
					>
						Download Spool.dmg
					</a>
				</>
			);
	}
}
