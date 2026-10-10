import { useEffect, useRef, useState } from "react";
import type { Cover } from "../../cover";
import { RadioCard, RadioGroup } from "../primitives/selection";
import { Thumbnail } from "../thumbnail";

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
						<div
							key={frame.name}
							className="relative h-[70px] w-[40px] shrink-0 overflow-hidden rounded-xs border border-line-strong bg-surface-panel"
						>
							{frame.thumbnail === undefined ? (
								<span className="absolute inset-0 flex items-center justify-center text-secondary type-preview">
									{frame.name}
								</span>
							) : (
								<Thumbnail {...frame.thumbnail} alt="" className="h-full w-full object-cover object-top" />
							)}
							<span className="absolute top-0.5 right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-surface-window/75 px-0.5 text-primary type-preview">
								{index + 1}
							</span>
						</div>
					))}
					{count > visiblePreviews.length ? (
						<div className="flex h-[70px] w-[40px] shrink-0 items-center justify-center rounded-xs border border-line-strong bg-surface-panel text-secondary type-value">
							+{count - visiblePreviews.length}
						</div>
					) : null}
					<div className="ml-2 flex min-w-0 flex-1 flex-col justify-center">
						<span className="truncate type-control">{frames.map((frame) => frame.name).join(", ")}</span>
						<span className="text-secondary type-label">Canvas order, left to right</span>
					</div>
				</div>

				<RadioGroup label="Export format" className="px-3 py-3">
					<RadioCard
						name="export-format"
						value="png"
						checked={format === "png"}
						onSelect={() => setFormat("png")}
						disabled={exporting}
						label="PNG images"
						description={`${count} separate image files`}
					/>
					<RadioCard
						name="export-format"
						value="pdf"
						checked={format === "pdf"}
						onSelect={() => setFormat("pdf")}
						disabled={exporting}
						label="PDF document"
						description={`One document with ${count} pages`}
					/>
				</RadioGroup>

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
