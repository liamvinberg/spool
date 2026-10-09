import { type ReactNode, useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { CloseIcon } from "./icons";

export const AGENT_PRIMARY =
	"inline-flex min-h-10 items-center justify-center gap-2 rounded-sm bg-text px-4 text-bg type-control hover:bg-text/90 disabled:opacity-50";
export const AGENT_SECONDARY =
	"inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-border-raised px-4 text-text type-control hover:bg-raised";
export const AGENT_QUIET = "rounded-sm text-muted type-control hover:text-text";

/** The agent handoff's modal, with native focus containment. */
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
			className={cn(
				"agent-dialog max-h-[calc(100dvh-32px)] m-auto p-0 overflow-auto border border-border-raised rounded-[8px] bg-surface text-text backdrop:[background:color-mix(in_srgb,var(--color-bg)_75%,transparent)] [&_button:focus-visible]:[outline:2px_solid_var(--color-thread)] [&_button:focus-visible]:outline-offset-[4px] [&_summary:focus-visible]:[outline:2px_solid_var(--color-thread)] [&_summary:focus-visible]:outline-offset-[4px]",
				wide ? "agent-dialog-wide w-[min(800px,calc(100vw-32px))]" : "w-[min(536px,calc(100vw-32px))]",
			)}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onKeyDown={(event) => event.stopPropagation()}
			onPointerDown={(event) => event.stopPropagation()}
		>
			{children(id)}
			<button
				type="button"
				className="agent-dialog-close absolute top-[12px] right-[12px] grid place-items-center w-[28px] h-[28px] rounded-[4px] text-muted [&:hover]:bg-raised [&:hover]:text-text [&_svg]:w-[16px] [&_svg]:h-[16px]"
				aria-label={`Close ${title}`}
				onClick={onClose}
			>
				<CloseIcon />
			</button>
		</dialog>,
		document.body,
	);
}
