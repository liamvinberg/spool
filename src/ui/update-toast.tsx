import type { ComponentProps } from "react";
import { cn } from "./cn";
import { type AppUpdate, DOWNLOAD_URL } from "./desktop-bridge";
import { TextAction, Toast } from "./primitives/feedback";

/**
 * The update toast (#30), on the Trash-toast pattern (#13): raised pill,
 * bottom center, thread only on the one action. Three states: offer, updating,
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
	return (
		toast.kind === "app" &&
		toast.update.kind !== "offer" &&
		toast.update.kind !== "ready" &&
		toast.update.kind !== "failed"
	);
}

export function UpdateToastPill({
	toast,
	aboveCanvasTools = false,
	onUpdate,
	onDismiss,
}: {
	toast: UpdateToast;
	aboveCanvasTools?: boolean;
	onUpdate: () => void;
	onDismiss: () => void;
}) {
	return (
		<div className={cn("-translate-x-1/2 fixed left-1/2 z-20", aboveCanvasTools ? "bottom-[120px]" : "bottom-6")}>
			<Toast {...said(toast, onUpdate)} onDismiss={updateToastBusy(toast) ? undefined : onDismiss} />
		</div>
	);
}

type Said = Pick<ComponentProps<typeof Toast>, "message" | "detail" | "action" | "tone" | "progress">;

function said(toast: UpdateToast, onUpdate: () => void): Said {
	switch (toast.kind) {
		case "offer":
			return {
				message: `Update available: v${toast.latest}`,
				action: <TextAction onClick={onUpdate}>Update</TextAction>,
			};
		case "updating":
			return { message: toast.stage === "installing" ? "Installing update…" : "Restarting…", progress: true };
		case "failed":
			return { message: toast.message ?? "Update failed", detail: "spool upgrade", tone: "error" };
		case "app":
			return appSaid(toast.update, onUpdate);
	}
}

function appSaid(update: AppUpdate, onUpdate: () => void): Said {
	switch (update.kind) {
		case "ready":
			return {
				message: "Spool is ready to update.",
				action: <TextAction onClick={onUpdate}>Restart to update</TextAction>,
			};
		case "offer":
			return {
				message: `Spool ${update.version} is out`,
				action: <TextAction onClick={onUpdate}>Update</TextAction>,
			};
		case "downloading":
			return { message: `Downloading Spool ${update.version} · ${update.percent}%`, progress: update.percent / 100 };
		case "checking":
			return { message: "Checking for updates…", progress: true };
		case "preparing":
			return { message: `Preparing Spool ${update.version}…`, progress: true };
		case "restarting":
			return { message: `Restarting into Spool ${update.version}…`, progress: true };
		case "failed":
			return {
				message: update.message,
				tone: "error",
				action: (
					<>
						{update.retryable && <TextAction onClick={onUpdate}>Retry</TextAction>}
						<TextAction href={DOWNLOAD_URL}>Download Spool.dmg</TextAction>
					</>
				),
			};
	}
}
