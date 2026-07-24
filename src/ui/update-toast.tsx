import { CloseIcon } from "./icons";

/**
 * The update toast (#30), on the Trash-toast pattern (#13): raised pill,
 * bottom center, thread only on the one action. Three states — offer,
 * updating (client-local: the daemon's death and return carry the truth),
 * failed (the daemon refused, or came back unchanged). Success needs no
 * state: the page reloads itself on the reconnect's new version.
 */

export type UpdateToast =
	| { kind: "offer"; latest: string }
	| { kind: "updating" }
	| { kind: "failed"; message?: string };

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
		<div
			className={`-translate-x-1/2 fixed left-1/2 z-20 flex items-center gap-4 rounded-md border border-border-raised bg-raised px-3.5 py-2.5 ${
				aboveCanvasTools ? "bottom-[120px]" : "bottom-6"
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
			{toast.kind === "updating" && <span className="text-base text-muted leading-base">Updating…</span>}
			{toast.kind === "failed" && (
				<span className="text-base text-text leading-base">
					{toast.message ?? (
						<>
							Update failed — run <span className="font-mono text-sm">spool upgrade</span> in a terminal
						</>
					)}
				</span>
			)}
			{toast.kind !== "updating" && (
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
