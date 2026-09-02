// Mirrors src/ui/canvas/export-dialog.tsx.
// A preview carries an imported image rather than the daemon's cover route.

import { useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";

export type ExportFormat = "png" | "pdf";

export interface ExportPreview {
	name: string;
	/** an imported still of the frame; absent draws the name in its place */
	still?: string | undefined;
}

export function ExportDialog({
	error,
	exporting,
	frames,
	onCancel,
	onExport,
}: {
	error?: string | undefined;
	exporting: boolean;
	frames: readonly ExportPreview[];
	onCancel?: (() => void) | undefined;
	onExport?: ((format: ExportFormat) => void) | undefined;
}) {
	const [format, setFormat] = useState<ExportFormat>("png");
	const primaryRef = useRef<HTMLButtonElement | null>(null);
	const dialogRef = useRef<HTMLDivElement | null>(null);
	const count = frames.length;
	const visiblePreviews = frames.slice(0, 4);
	useEffect(() => {
		primaryRef.current?.focus();
	}, []);
	useEffect(() => {
		if (exporting) dialogRef.current?.focus();
	}, [exporting]);
	const trapFocus = (event: React.KeyboardEvent) => {
		if (event.key !== "Tab") return;
		const controls = [
			...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") ?? []),
		];
		const first = controls[0];
		const last = controls.at(-1);
		if (first === undefined || last === undefined) {
			event.preventDefault();
			dialogRef.current?.focus();
			return;
		}
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};
	return (
		<div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/55">
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="export-dialog-title"
				aria-busy={exporting}
				tabIndex={-1}
				className="w-[380px] rounded-lg border border-border-raised bg-raised"
				onKeyDown={trapFocus}
			>
				<div className="flex items-center justify-between border-border-raised border-b px-5 py-4">
					<h2 id="export-dialog-title" className="font-medium text-md leading-md">
						Export {count} frames
					</h2>
					<span className="font-mono text-muted text-xs leading-xs">{count} selected</span>
				</div>

				<div className="flex gap-2 border-border-raised border-b px-5 py-4">
					{visiblePreviews.map((frame, index) => (
						<div
							key={frame.name}
							className="relative h-[70px] w-[40px] shrink-0 overflow-hidden rounded-xs border border-border-raised bg-surface"
						>
							{frame.still === undefined ? (
								<span className="absolute inset-0 flex items-center justify-center font-mono text-[7px] text-muted">
									{frame.name}
								</span>
							) : (
								<img src={frame.still} alt="" className="h-full w-full object-cover object-top" />
							)}
							<span className="absolute top-0.5 right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-bg/75 px-0.5 font-mono text-[7px] text-text leading-none">
								{index + 1}
							</span>
						</div>
					))}
					{count > visiblePreviews.length ? (
						<div className="flex h-[70px] w-[40px] shrink-0 items-center justify-center rounded-xs border border-border-raised bg-surface font-mono text-xs text-muted">
							+{count - visiblePreviews.length}
						</div>
					) : null}
					<div className="ml-2 flex min-w-0 flex-1 flex-col justify-center">
						<span className="truncate text-base leading-base">{frames.map((frame) => frame.name).join(", ")}</span>
						<span className="text-muted text-xs leading-xs">Canvas order, left to right</span>
					</div>
				</div>

				<div className="flex flex-col gap-1 px-3 py-3" role="radiogroup" aria-label="Export format">
					<FormatOption
						checked={format === "png"}
						description={`${count} separate image files`}
						disabled={exporting}
						label="PNG images"
						onClick={() => setFormat("png")}
					/>
					<FormatOption
						checked={format === "pdf"}
						description={`One document with ${count} pages`}
						disabled={exporting}
						label="PDF document"
						onClick={() => setFormat("pdf")}
					/>
				</div>

				{error === undefined ? null : (
					<p role="alert" className="px-5 pb-3 text-base text-thread leading-base">
						{error}
					</p>
				)}

				<div className="flex items-center justify-end gap-2 border-border-raised border-t px-4 py-3">
					<button
						type="button"
						disabled={exporting}
						className="flex h-8 items-center rounded-sm px-3 text-base text-muted leading-none disabled:opacity-50"
						onClick={onCancel}
					>
						Cancel
					</button>
					<button
						ref={primaryRef}
						type="button"
						disabled={exporting}
						className="flex h-8 min-w-[74px] items-center justify-center rounded-sm bg-thread px-4 font-medium text-base text-on-thread leading-none disabled:opacity-70"
						onClick={() => onExport?.(format)}
					>
						{exporting ? "Exporting…" : "Export"}
					</button>
				</div>
			</div>
		</div>
	);
}

function FormatOption({
	checked,
	description,
	disabled,
	label,
	onClick,
}: {
	checked: boolean;
	description: string;
	disabled: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<label
			className={cn(
				"flex items-center gap-3 rounded-md border px-3 py-2.5 text-left",
				checked ? "border-thread bg-surface" : "border-transparent",
				disabled ? "cursor-default opacity-60" : "cursor-pointer",
			)}
		>
			<input
				type="radio"
				name="export-format"
				checked={checked}
				disabled={disabled}
				className="sr-only"
				onChange={onClick}
			/>
			<span
				className={cn(
					"flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
					checked ? "border-thread" : "border-muted",
				)}
			>
				{checked ? <span className="h-2 w-2 rounded-full bg-thread" /> : null}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="text-base leading-[16px]">{label}</span>
				<span className="text-muted text-xs leading-[15px]">{description}</span>
			</span>
		</label>
	);
}
