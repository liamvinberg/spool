import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { Button, ButtonGroup } from "./primitives/actions";

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
	description?: string;
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
			className="confirm-dialog w-[min(440px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] m-auto p-[24px] overflow-auto border border-line-strong rounded-[8px] bg-surface-panel text-primary backdrop:[background:color-mix(in_srgb,var(--color-surface-window)_70%,transparent)]"
			tabIndex={-1}
			aria-labelledby={`${id}-title`}
			aria-describedby={description === undefined ? undefined : `${id}-description`}
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
				<h2 className="m-0 mb-[8px] [font:var(--type-title)] [overflow-wrap:anywhere]" id={`${id}-title`}>
					{title}
				</h2>
				{description !== undefined && (
					<p className="m-0 mb-[20px] text-secondary [font:var(--type-body)]" id={`${id}-description`}>
						{description}
					</p>
				)}
				<fieldset className="min-w-0 p-0 border-0" disabled={busy} onChange={() => setNotice(null)}>
					{children}
					{notice && (
						<p className="m-0 mb-[20px] text-accent-strong [font:var(--type-body)]" role="alert">
							{notice}
						</p>
					)}
					<ButtonGroup align="end" className="confirm-dialog-actions mt-[24px]">
						<Button size="lg" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" size="lg" variant={danger ? "danger" : "primary"} disabled={disabled}>
							{busy ? "Working…" : confirmLabel}
						</Button>
					</ButtonGroup>
				</fieldset>
			</form>
		</dialog>
	);
}
