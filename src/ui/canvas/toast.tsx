import { Toast as Said } from "../primitives/feedback";

/**
 * The canvas's one line of confirmation: what just happened, said once and
 * gone. It is a status rather than a dialog because nothing here needs
 * answering: an export that landed, a path on the clipboard, a capture that
 * threw.
 */

export interface Notice {
	kind: "progress" | "success" | "error";
	message: string;
}

export function Toast({ notice }: { notice: Notice }) {
	return (
		<div className="-translate-x-1/2 absolute bottom-[120px] left-1/2 z-30">
			<NoticeToast notice={notice} />
		</div>
	);
}

/** The line itself, for a place that stacks it with others (`NoticeStack`). */
export function NoticeToast({ notice }: { notice: Notice }) {
	return (
		<Said
			message={notice.message}
			tone={notice.kind === "error" ? "error" : "default"}
			progress={notice.kind === "progress" ? true : undefined}
		/>
	);
}
