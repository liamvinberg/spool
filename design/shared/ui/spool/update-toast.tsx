// Mirrors src/ui/update-toast.tsx.
// Pure presentation already; only the icon import changed.

import { CloseIcon } from "shared/ui/spool/icons";

/**
 * The update toast, on the Trash-toast pattern: raised pill, bottom centre,
 * thread only on the one action. Three states — offer, updating, failed.
 * Success needs no state: the page reloads itself onto the new daemon.
 *
 * Updating carries a stage because the two halves of an upgrade feel different
 * and take different amounts of time. The install runs against a daemon that is
 * still answering, the restart against one that is gone, and a person watching
 * a pill that says one thing for a minute has no way to tell a slow step from a
 * dead one. The hairline sweeps for the same reason the drain bar on the Trash
 * toast empties: motion is what says the thing is still running.
 */

export type UpdateToast =
	| { kind: "offer"; latest: string }
	/** installing: the old daemon still answers. restarting: it has gone to be replaced. */
	| { kind: "updating"; stage: "installing" | "restarting" }
	| { kind: "failed"; message?: string };

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
	onUpdate?: (() => void) | undefined;
	onDismiss?: (() => void) | undefined;
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
			{toast.kind !== "updating" && (
				<button
					type="button"
					className="flex items-center text-muted hover:text-text"
					onClick={onDismiss}
					title="Dismiss"
				>
					<CloseIcon className="h-2 w-2" />
				</button>
			)}
		</div>
	);
}
