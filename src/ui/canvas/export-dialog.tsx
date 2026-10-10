import { useEffect, useRef, useState } from "react";
import type { Cover } from "../../cover";
import { coverUrl } from "../api";
import { cn } from "../cn";
import { Thumbnail } from "../primitives/display";

export type ExportFormat = "png" | "pdf";

export interface ExportPreview {
	name: string;
	thumbnail?: {
		project: string;
		frame: string;
		cover: Cover;
	};
}

export function ExportDialog({
	error,
	exporting,
	frames,
	onCancel,
	onExport,
}: {
	error?: string;
	exporting: boolean;
	frames: readonly ExportPreview[];
	onCancel: () => void;
	onExport: (format: ExportFormat) => void;
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
		<div className="absolute inset-0 z-20 flex items-center justify-center bg-surface-window/55">
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="export-dialog-title"
				aria-busy={exporting}
				tabIndex={-1}
				className="w-[380px] rounded-lg border border-line-strong bg-surface-raised"
				onKeyDown={trapFocus}
			>
				<div className="flex items-center justify-between border-line-strong border-b px-5 py-4">
					<h2 id="export-dialog-title" className="font-medium type-title">
						Export {count} frames
					</h2>
					<span className="text-secondary type-value">{count} selected</span>
				</div>

				<div className="flex gap-2 border-line-strong border-b px-5 py-4">
					{visiblePreviews.map((frame, index) => (
						<Thumbnail
							key={frame.name}
							src={
								frame.thumbnail === undefined
									? undefined
									: coverUrl(frame.thumbnail.project, frame.thumbnail.frame, frame.thumbnail.cover.hash)
							}
							count={index + 1}
							className="h-[70px] w-[40px]"
						/>
					))}
					{count > visiblePreviews.length ? (
						<Thumbnail className="h-[70px] w-[40px]">
							<span className="flex size-full items-center justify-center text-secondary type-value">
								+{count - visiblePreviews.length}
							</span>
						</Thumbnail>
					) : null}
					<div className="ml-2 flex min-w-0 flex-1 flex-col justify-center">
						<span className="truncate type-control">{frames.map((frame) => frame.name).join(", ")}</span>
						<span className="text-secondary type-label">Canvas order, left to right</span>
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
					<p role="alert" className="px-5 pb-3 text-accent-strong type-control">
						{error}
					</p>
				)}

				<div className="flex items-center justify-end gap-2 border-line-strong border-t px-4 py-3">
					<button
						type="button"
						disabled={exporting}
						className="flex h-8 items-center rounded-sm px-3 text-secondary disabled:opacity-50 type-control"
						onClick={onCancel}
					>
						Cancel
					</button>
					<button
						ref={primaryRef}
						type="button"
						disabled={exporting}
						className="flex h-8 min-w-[74px] items-center justify-center rounded-sm bg-accent-strong px-4 font-medium text-on-accent disabled:opacity-70 type-control"
						onClick={() => onExport(format)}
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
				checked ? "border-accent bg-surface-panel" : "border-transparent",
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
					checked ? "border-accent" : "border-secondary",
				)}
			>
				{checked ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="type-control">{label}</span>
				<span className="text-secondary type-label">{description}</span>
			</span>
		</label>
	);
}
