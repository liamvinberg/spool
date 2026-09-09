import type { RenderOutcome } from "../../source-edit";
import { CloseIcon } from "../icons";
import { NOTICE_PILL } from "./collision-notice";
import type { Refusal } from "./hand-edit";
import type { SourceIntent } from "./source-intent";

/**
 * The three things a hand edit says out loud (#253, #255).
 *
 * Refusals are quiet and belong on the element they were about. These are the
 * others: how a source save actually ended in each running use; a write that
 * went out and never landed, which is a failure rather than an answer; and the
 * one line a project with `history: false` has earned, which it hears on its
 * first hand save and never again. They sit in the canvas's own notice strip,
 * in the same plain language the collision notice uses, and go when they are
 * clicked.
 */

export type HandSaid =
	/** the project keeps no history, said once per project by the daemon */
	| { kind: "uncaught" }
	| {
			kind: "source";
			intent?: SourceIntent;
			dismissed?: boolean;
			sourceUnchanged?: boolean;
			refusal?: Refusal["code"];
			frame: string;
			status: RenderOutcome | "saving" | "unknown" | "blocked";
			text: string;
			says: string;
	  }
	/** the write went out and never landed, with what came back if anything did */
	| { kind: "failed"; frame: string; says?: string };

export function HandNotice({
	said,
	onDismiss,
	onReload,
	onAsk,
	onRetry,
	onCheck,
}: {
	said: HandSaid;
	onDismiss: () => void;
	onReload?: (frame: string) => void;
	onAsk?: () => void;
	onRetry?: (() => void) | undefined;
	onCheck?: (() => void) | undefined;
}) {
	if (said.kind === "source") {
		if (said.dismissed) return null;
		const title = said.sourceUnchanged
			? "No new edit saved"
			: said.status === "saving"
				? "Saving…"
				: said.status === "unknown"
					? "Save outcome unknown"
					: said.status === "blocked"
						? "This edit could not be saved"
						: said.status === "mismatching"
							? "Saved, but not visibly applied"
							: said.status === "pending"
								? "Saved · rendering pending"
								: said.status === "failed"
									? "Saved · render failed"
									: said.status === "inactive"
										? "Saved · scope inactive"
										: said.status === "constrained"
											? "Saved · result constrained"
											: "Saved · result unverified";
		return (
			<div
				data-hand-notice={said.status}
				role="status"
				className="pointer-events-auto shrink-0 border-border border-t border-l-2 border-l-thread py-3 pr-3.5 pl-3 type-label"
			>
				<div className="flex items-start gap-2">
					<strong className="min-w-0 flex-1 font-medium">{title}</strong>
					{said.status !== "saving" ? (
						<button
							type="button"
							aria-label="Dismiss notice"
							onClick={onDismiss}
							className="-mt-[3px] -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors duration-[140ms] hover:bg-surface hover:text-text motion-reduce:transition-none [&>svg]:size-3"
						>
							<CloseIcon />
						</button>
					) : null}
				</div>
				<p className="mt-1 text-muted">
					<span data-hand-refusal={said.refusal}>{said.says}</span>
					{said.text && said.status !== "saving" ? ` Your text: ${said.text}` : ""}
				</p>
				<div className="mt-1.5 flex flex-wrap gap-1">
					{said.status === "unknown" && onCheck ? (
						<button
							type="button"
							className="rounded border border-border-raised px-2 py-1 hover:bg-surface"
							onClick={onCheck}
						>
							Check current source
						</button>
					) : null}
					{said.status === "blocked" && onRetry ? (
						<button
							type="button"
							className="rounded border border-border-raised px-2 py-1 hover:bg-surface"
							onClick={onRetry}
						>
							Retry this edit
						</button>
					) : null}
					{!["saving", "unknown", "blocked"].includes(said.status) && onReload ? (
						<button
							type="button"
							className="rounded border border-border-raised px-2 py-1 hover:bg-surface"
							onClick={() => onReload(said.frame)}
						>
							Reload app (resets state)
						</button>
					) : null}
					{said.status !== "saving" && onAsk ? (
						<button
							type="button"
							className="rounded border border-border-raised px-2 py-1 hover:bg-surface"
							onClick={onAsk}
						>
							Ask agent
						</button>
					) : null}
				</div>
			</div>
		);
	}

	return (
		<button
			type="button"
			data-hand-notice={said.kind}
			onClick={onDismiss}
			className={`pointer-events-auto text-left ${NOTICE_PILL}`}
		>
			{said.kind === "uncaught" ? (
				<>
					<span className="text-thread-strong">no history here</span>
					<span className="text-muted">: nothing is catching hand edits</span>
				</>
			) : (
				<>
					<span className="text-thread-strong">the edit did not land</span>
					<span className="text-muted">: {said.says ?? `${said.frame} is unchanged`}</span>
				</>
			)}
		</button>
	);
}
