import { type ReactNode, useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { CloseIcon } from "./icons";
import { IconButton } from "./primitives/actions";
import { Dialog } from "./primitives/overlays";

/** The agent handoff's modal, with native focus containment. */
export function AgentDialog({
	title,
	onClose,
	children,
}: {
	title: string;
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
		<Dialog
			native
			ref={ref}
			width="sheet"
			padded={false}
			tabIndex={-1}
			aria-labelledby={id}
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
				className="absolute top-3 right-3"
				onClick={onClose}
			/>
		</Dialog>,
		document.body,
	);
}
