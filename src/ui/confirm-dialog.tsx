import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import "./confirm-dialog.css";

/** A modal confirmation that waits for the action and keeps failures retryable. */
export function ConfirmDialog({
	title,
	description,
	confirmLabel,
	danger = false,
	disabled = false,
	children,
	onConfirm,
	onClose,
}: {
	title: string;
	description: string;
	confirmLabel: string;
	danger?: boolean;
	disabled?: boolean;
	children?: ReactNode;
	onConfirm: () => Promise<void>;
	onClose: () => void;
}) {
	const id = useId();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const submitting = useRef(false);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	useLayoutEffect(() => {
		const dialog = dialogRef.current;
		const previous = document.activeElement;
		dialog?.showModal();
		const input = dialog?.querySelector<HTMLInputElement>("input");
		if (input) {
			input.focus();
			input.select();
		} else dialog?.querySelector<HTMLButtonElement>("button")?.focus();
		return () => {
			dialog?.close();
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	useEffect(() => attachHotkeyLayer({ scope: "dialog", handlers: {} }), []);
	useEffect(() => {
		if (!busy && notice !== null) dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
	}, [busy, notice]);
	return (
		<dialog
			ref={dialogRef}
			className="confirm-dialog"
			tabIndex={-1}
			aria-labelledby={`${id}-title`}
			aria-describedby={`${id}-description`}
			onCancel={(event) => {
				event.preventDefault();
				if (!submitting.current) onClose();
			}}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
			}}
		>
			<form
				aria-busy={busy}
				onSubmit={(event) => {
					event.preventDefault();
					if (submitting.current || disabled) return;
					submitting.current = true;
					dialogRef.current?.focus();
					setBusy(true);
					setNotice(null);
					void (async () => {
						try {
							await onConfirm();
							onClose();
						} catch (error) {
							setNotice(error instanceof Error ? error.message : "Could not finish. Try again.");
						} finally {
							submitting.current = false;
							setBusy(false);
						}
					})();
				}}
			>
				<h2 id={`${id}-title`}>{title}</h2>
				<p id={`${id}-description`}>{description}</p>
				<fieldset disabled={busy} onChange={() => setNotice(null)}>
					{children}
					{notice && <p role="alert">{notice}</p>}
					<div className="confirm-dialog-actions">
						<button type="button" className="home-action" onClick={onClose}>
							Cancel
						</button>
						<button
							type="submit"
							className={`home-action home-action-primary${danger ? " home-action-danger" : ""}`}
							disabled={disabled}
						>
							{busy ? "Working…" : confirmLabel}
						</button>
					</div>
				</fieldset>
			</form>
		</dialog>
	);
}
