import type { RenderOutcome } from "../../source-edit";
import { NOTICE_PILL } from "./collision-notice";

/**
 * The three things a hand edit says out loud (#253, #255, #259).
 *
 * Refusals are quiet and belong on the element they were about. These are the
 * others: a project with `history: false` has nothing catching a hand edit,
 * which it hears once and never again; a write that was accepted and then
 * could not land, which is a failure rather than an answer; and a size that
 * was written, measured and did not take, which the hand watched happen and
 * would otherwise have no way of knowing was put back. All three sit in the
 * canvas's own notice strip, in the same plain language the collision notice
 * uses, and go when they are clicked.
 */

export type HandSaid =
	/** the project keeps no history, said once per project by the daemon */
	| { kind: "uncaught" }
	| {
			kind: "source";
			frame: string;
			status: RenderOutcome | "saving" | "unknown" | "blocked";
			text: string;
			says: string;
	  }
	/** the write went out and never landed, with what came back if anything did */
	| { kind: "failed"; frame: string; says?: string }
	/** the class landed and the box did not follow it, so the patch was reverted */
	| { kind: "clamped"; frame: string };

export function HandNotice({
	said,
	onDismiss,
	onReload,
}: {
	said: HandSaid;
	onDismiss: () => void;
	onReload?: (frame: string) => void;
}) {
	if (said.kind === "source")
		return (
			<div data-hand-notice={said.status} role="status" className={`pointer-events-auto ${NOTICE_PILL}`}>
				<span>{said.says}</span>
				{said.text && said.status !== "saving" ? (
					<span className="ml-2 text-muted">Your text: {said.text}</span>
				) : null}
				{!["saving", "unknown", "blocked"].includes(said.status) && onReload ? (
					<button type="button" className="ml-3 text-thread-strong" onClick={() => onReload(said.frame)}>
						Reload app (resets state)
					</button>
				) : null}
				{said.status !== "saving" ? (
					<button type="button" className="ml-3 text-muted" aria-label="Dismiss notice" onClick={onDismiss}>
						×
					</button>
				) : null}
			</div>
		);

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
			) : said.kind === "clamped" ? (
				<>
					<span className="text-thread-strong">the size did not take</span>
					<span className="text-muted">: something else decides it, so {said.frame} was put back</span>
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
