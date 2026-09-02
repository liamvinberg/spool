// Mirrors src/ui/canvas/toast.tsx.
// Pure presentation already; nothing was stripped.

/**
 * The canvas's one line of confirmation: what just happened, said once and
 * gone. It is a status rather than a dialog because nothing here needs
 * answering — an export that landed, a path on the clipboard, a capture that
 * threw.
 */

export interface Notice {
	kind: "progress" | "success" | "error";
	message: string;
}

export function Toast({ notice }: { notice: Notice }) {
	return (
		<div
			role={notice.kind === "error" ? "alert" : "status"}
			className="-translate-x-1/2 absolute bottom-[120px] left-1/2 z-30 rounded-md border border-border-raised bg-raised px-3.5 py-2.5 text-base leading-base"
		>
			<span className={notice.kind === "error" ? "text-thread" : "text-text"}>{notice.message}</span>
		</div>
	);
}
