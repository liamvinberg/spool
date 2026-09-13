import { type ReactNode, useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { CloseIcon } from "./icons";
import "./agent-dialog.css";

export const AGENT_PRIMARY =
	"inline-flex min-h-10 items-center justify-center gap-2 rounded-sm bg-text px-4 text-bg type-control hover:bg-text/90 disabled:opacity-50";
export const AGENT_SECONDARY =
	"inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-border-raised px-4 text-text type-control hover:bg-raised";
export const AGENT_QUIET = "rounded-sm text-muted type-control hover:text-text";

/** The recommendation and handoff share one modal, including native focus containment. */
export function AgentDialog({
	title,
	wide = false,
	onClose,
	children,
}: {
	title: string;
	wide?: boolean;
	onClose: () => void;
	children: (titleId: string) => ReactNode;
}) {
	const id = useId();
	const ref = useRef<HTMLDialogElement>(null);
	useLayoutEffect(() => {
		const dialog = ref.current;
		const previous = document.activeElement;
		dialog?.showModal();
		dialog?.focus();
		return () => {
			dialog?.close();
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	useEffect(() => attachHotkeyLayer({ scope: "dialog", handlers: {} }), []);
	return createPortal(
		<dialog
			ref={ref}
			tabIndex={-1}
			aria-labelledby={id}
			className={`agent-dialog${wide ? " agent-dialog-wide" : ""}`}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onKeyDown={(event) => event.stopPropagation()}
			onPointerDown={(event) => event.stopPropagation()}
		>
			{children(id)}
			<button type="button" className="agent-dialog-close" aria-label={`Close ${title}`} onClick={onClose}>
				<CloseIcon />
			</button>
		</dialog>,
		document.body,
	);
}
