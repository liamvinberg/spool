import { useEffect, useRef, useState } from "react";
import type { Cover } from "../../cover";
import { coverUrl } from "../api";
import { Button } from "../primitives/actions";
import { Thumbnail } from "../primitives/display";
import { Dialog, DialogBody, DialogFooter, DialogHeader, Scrim } from "../primitives/overlays";
import { RadioCard, RadioGroup } from "../primitives/selection";

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
		<>
			<Scrim />
			<div className="absolute inset-0 z-30 flex items-center justify-center p-4">
				<Dialog
					ref={dialogRef}
					aria-labelledby="export-dialog-title"
					aria-busy={exporting}
					tabIndex={-1}
					onKeyDown={trapFocus}
				>
					<DialogHeader
						title={`Export ${count} frames`}
						titleId="export-dialog-title"
						description="Canvas order, left to right"
					/>
					<DialogBody notice={error}>
						<div className="flex gap-2">
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
							<span className="ml-2 min-w-0 flex-1 self-center truncate type-value">
								{frames.map((frame) => frame.name).join(", ")}
							</span>
						</div>
						<RadioGroup label="Export format">
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
					</DialogBody>
					<DialogFooter>
						<Button size="lg" disabled={exporting} onClick={onCancel}>
							Cancel
						</Button>
						<Button
							ref={primaryRef}
							size="lg"
							variant="primary"
							disabled={exporting}
							loading={exporting}
							onClick={() => onExport(format)}
						>
							{exporting ? "Exporting…" : "Export"}
						</Button>
					</DialogFooter>
				</Dialog>
			</div>
		</>
	);
}
