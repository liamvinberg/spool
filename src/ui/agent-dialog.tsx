import { type ReactNode, useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { CloseIcon } from "./icons";
import { IconButton } from "./primitives/actions";

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
				"agent-dialog max-h-[calc(100dvh-32px)] m-auto p-0 overflow-auto border border-line-strong rounded-[8px] bg-surface-panel text-primary backdrop:[background:color-mix(in_srgb,var(--color-surface-window)_75%,transparent)] [&_button:focus-visible]:[outline:2px_solid_var(--color-accent)] [&_button:focus-visible]:outline-offset-[4px] [&_summary:focus-visible]:[outline:2px_solid_var(--color-accent)] [&_summary:focus-visible]:outline-offset-[4px]",
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
			<IconButton
				icon={<CloseIcon />}
				label={`Close ${title}`}
				className="agent-dialog-close absolute top-[12px] right-[12px]"
				onClick={onClose}
			/>
		</dialog>,
		document.body,
	);
}
