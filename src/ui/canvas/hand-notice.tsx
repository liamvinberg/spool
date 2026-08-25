import { NOTICE_PILL } from "./collision-notice";

/**
 * The two things a hand edit says out loud (#253, #255).
 *
 * Refusals are quiet and belong on the element they were about. These are the
 * other two: a project with `history: false` has nothing catching a hand edit,
 * which it hears once and never again, and a write that was accepted and then
 * could not land, which is a failure rather than an answer and must not pass
 * unsaid. Both sit in the canvas's own notice strip, in the same plain
 * language the collision notice uses, and go when they are clicked.
 */

export type HandSaid =
	/** the project keeps no history, said once per project by the daemon */
	| { kind: "uncaught" }
	/** the write went out and never landed, with what came back if anything did */
	| { kind: "failed"; frame: string; says?: string };

export function HandNotice({ said, onDismiss }: { said: HandSaid; onDismiss: () => void }) {
	return (
		<button
			type="button"
			data-hand-notice={said.kind}
			onClick={onDismiss}
			className={`pointer-events-auto text-left ${NOTICE_PILL}`}
		>
			{said.kind === "uncaught" ? (
				<>
					<span className="text-thread">no history here</span>
					<span className="text-muted">: nothing is catching hand edits</span>
				</>
			) : (
				<>
					<span className="text-thread">the edit did not land</span>
					<span className="text-muted">: {said.says ?? `${said.frame} is unchanged`}</span>
				</>
			)}
		</button>
	);
}
