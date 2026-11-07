/**
 * Export (spool#239), the right-click menu's last step before Move to Trash: the
 * menu itself becomes the choice (png, pdf or html, and for html how much of
 * the flow to take), then the line that says the file is being built, then
 * the line that says where it landed. What a step draws lives here; the menu
 * that morphs between them is the StepMenu primitive, worked by the context menu.
 */

import { type ExportPlan, fetchExportHtml } from "../api";
import { desktopWindow, type ExportDownload } from "../desktop-window";
import { CheckIcon } from "../icons";
import { SpinRing } from "../primitives/display";
import { Drain, Progress } from "../primitives/feedback";
import { MenuItem, MenuSeparator } from "../primitives/overlays";
import { Segment, SegmentedControl } from "../primitives/selection";
import { buildFramePdf, type CapturedFrame, downloadBytes, exportFileName } from "./frame-export";

export type ExportFormat = "png" | "pdf" | "html";
export type ExportScope = "flow" | "one";

export const EXPORT_FORMATS: readonly ExportFormat[] = ["png", "pdf", "html"];

export const isExportFormat = (value: unknown): value is ExportFormat =>
	typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value);

/** the steps past the menu are wider than it: a format switch and a file name share a row */
export const EXPORT_WIDTH = "calc(var(--spacing-menu) + 64px)";

/** how long the saved line stays before it closes itself, unless the pointer holds it */
export const SAVED_MS = 6000;

/** what the Export row names: the file, or for several frames how many of which */
export function exportTarget(project: string, frames: readonly string[], format: ExportFormat): string {
	const [only] = frames;
	if (frames.length === 1 && only !== undefined) return exportFileName(project, only, format);
	return format === "pdf" ? `${project}.pdf` : `${frames.length} × .${format}`;
}

/** a size as Finder says it */
export function fileSize(bytes: number): string {
	if (bytes < 1000) return `${bytes} B`;
	if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
	return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** which frames the files would need the internet for, as the choice names them */
export function onlineFrames(
	frames: readonly string[],
	plans: ReadonlyMap<string, ExportPlan>,
	scope: ExportScope,
): string[] {
	const named = new Set<string>();
	for (const frame of frames) {
		const plan = plans.get(frame);
		if (plan === undefined) continue;
		for (const name of plan.online) if (frames.length > 1 || scope === "flow" || name === frame) named.add(name);
	}
	return [...named];
}

export interface ExportProgress {
	done: number;
	total: number;
	detail?: string | undefined;
}

export interface Exported {
	/** the file as it was saved, or for several how many */
	file: string;
	bytes: number;
	/** where the Mac app saved it, for Show in Finder; a plain browser never says */
	path?: string | undefined;
}

/**
 * Build the files, hand them to the browser to download, and in the Mac app
 * wait for it to say where each one landed. PNG and PDF are captured here,
 * from the frames as the canvas draws them; HTML is the daemon's to build.
 */
export async function exportFrames(
	request: { project: string; frames: readonly string[]; format: ExportFormat; scope: ExportScope },
	capture: (frame: string) => Promise<CapturedFrame>,
	progress: (at: ExportProgress) => void,
): Promise<Exported> {
	const { project, frames, format } = request;
	const total = frames.length + (format === "pdf" ? 1 : 0);
	const files: { name: string; type: string; bytes: Uint8Array }[] = [];
	const captured: CapturedFrame[] = [];
	for (const [index, frame] of frames.entries()) {
		progress({ done: index, total, detail: frames.length > 1 ? frame : undefined });
		if (format === "html") {
			// several frames give one file each, and each takes its flow
			const scope = frames.length === 1 ? request.scope : "flow";
			const bytes = await fetchExportHtml(project, frame, scope);
			files.push({ name: exportFileName(project, frame, "html"), type: "text/html", bytes });
			continue;
		}
		const image = await capture(frame);
		if (format === "png")
			files.push({ name: exportFileName(project, frame, "png"), type: "image/png", bytes: image.png });
		else captured.push(image);
	}
	if (format === "pdf") {
		progress({ done: frames.length, total, detail: "writing the file" });
		files.push({
			name: exportTarget(project, frames, "pdf"),
			type: "application/pdf",
			bytes: await buildFramePdf(captured),
		});
	}
	progress({ done: total, total });

	const saved = landed(files.map((file) => file.name));
	for (const file of files) downloadBytes(file.bytes, file.type, file.name);
	const reports = await saved;
	const bytes = files.reduce((sum, file) => sum + file.bytes.length, 0);
	const [first] = reports ?? [];
	if (files.length > 1) return { file: `${files.length} files`, bytes, path: first?.path };
	return { file: first?.filename ?? files[0]?.name ?? "", bytes, path: first?.path };
}

type Completed = Extract<ExportDownload, { status: "completed" }>;

/**
 * The Mac app's word on where each file landed, heard before any is handed
 * over so none is missed; null in a plain browser, which says nothing.
 */
function landed(requested: readonly string[]): Promise<Completed[]> | null {
	const bridge = desktopWindow();
	if (bridge?.onExportDownload === undefined) return null;
	const listen = bridge.onExportDownload.bind(bridge);
	return new Promise((resolve, reject) => {
		const waiting = [...requested];
		const reports: Completed[] = [];
		const stop = listen((report) => {
			const at = waiting.indexOf(report.requested);
			if (at === -1) return;
			waiting.splice(at, 1);
			if (report.status === "failed") {
				stop();
				reject(new Error(report.message));
				return;
			}
			reports.push(report);
			if (waiting.length > 0) return;
			stop();
			resolve(reports);
		});
	}) as Promise<Completed[]>;
}

/* ------------------------------------------------------------------ steps -- */

export function ExportChoice({
	format,
	onFormat,
	scope,
	onScope,
	reach,
	online,
	target,
	onExport,
}: {
	format: ExportFormat;
	onFormat: (format: ExportFormat) => void;
	scope: ExportScope;
	onScope: (scope: ExportScope) => void;
	/** the frames beyond the one exported that its links reach; empty for several frames */
	reach: number;
	online: readonly string[];
	target: string;
	onExport: () => void;
}) {
	const html = format === "html";
	return (
		<>
			<div className="px-1 pt-1 pb-0.5">
				<SegmentedControl
					label="Export format"
					size="sm"
					value={format}
					onValueChange={(value) => {
						if (isExportFormat(value)) onFormat(value);
					}}
					className="flex w-full"
				>
					{EXPORT_FORMATS.map((one) => (
						<Segment key={one} value={one} className="flex-1 justify-center">
							{one}
						</Segment>
					))}
				</SegmentedControl>
			</div>
			{html && reach > 0 ? (
				<>
					<MenuSeparator />
					<MenuItem
						role="menuitemradio"
						label={`This frame and the ${reach} it links to`}
						checked={scope === "flow"}
						onClick={() => onScope("flow")}
					/>
					<MenuItem
						role="menuitemradio"
						label="Only this frame"
						checked={scope === "one"}
						onClick={() => onScope("one")}
					/>
				</>
			) : null}
			{html && online.length > 0 ? (
				<p className="animate-step-in pt-0.5 pr-3 pb-1.5 pl-8 text-secondary type-label">
					<span className="text-primary type-value">{online.join(", ")}</span>{" "}
					{online.length === 1 ? "needs" : "need"} the internet to work
				</p>
			) : null}
			<MenuSeparator />
			<MenuItem
				label="Export"
				meta={<FileName file={target} />}
				shortcut="↵"
				onClick={onExport}
				className="bg-state-hover-raised"
			/>
		</>
	);
}

/** the file name, its extension rising anew as the format changes */
function FileName({ file }: { file: string }) {
	const dot = file.lastIndexOf(".");
	if (dot === -1) return <>{file}</>;
	const extension = file.slice(dot);
	return (
		<span className="inline-flex">
			{file.slice(0, dot)}
			<span key={extension} className="animate-step-in">
				{extension}
			</span>
		</span>
	);
}

export function ExportBuilding({ file, progress }: { file: string; progress: ExportProgress }) {
	return (
		<div className="relative flex flex-col px-2 py-1.5">
			<div className="flex items-center gap-2">
				<SpinRing className="size-3.5 text-secondary" />
				<span className="min-w-0 truncate text-primary type-control">Building {file}</span>
			</div>
			{progress.detail === undefined ? null : (
				<span key={progress.detail} className="animate-step-in truncate pl-5.5 text-secondary type-detail">
					{progress.detail}
				</span>
			)}
			<Progress
				value={progress.total > 1 ? progress.done / progress.total : undefined}
				label="Building"
				className="-inset-x-1 -bottom-1"
			/>
		</div>
	);
}

export function ExportSaved({
	exported,
	finder,
	onReveal,
	onClose,
}: {
	exported: Exported;
	/** the Mac app saved it, so it can be shown */
	finder: boolean;
	onReveal: () => void;
	onClose: () => void;
}) {
	return (
		<div className="group/saved relative flex flex-col">
			<div className="flex flex-col gap-0.5 px-2 pt-1.5 pb-2">
				<div className="flex items-center gap-2">
					<span className="flex size-4 animate-step-in items-center justify-center rounded-full bg-accent text-on-accent">
						<CheckIcon className="size-3" />
					</span>
					<span className="text-primary type-control">{finder ? "Saved to Downloads" : "Downloaded"}</span>
				</div>
				<span className="truncate pl-6 text-secondary type-detail">
					{exported.file} · {fileSize(exported.bytes)}
				</span>
			</div>
			{finder && exported.path !== undefined ? (
				<>
					<MenuSeparator />
					<MenuItem label="Show in Finder" shortcut="↵" onClick={onReveal} />
				</>
			) : null}
			<Drain
				duration={SAVED_MS}
				className="-inset-x-1 -bottom-1 group-hover/saved:[animation-play-state:paused]"
				onAnimationEnd={onClose}
			/>
		</div>
	);
}

export function ExportFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
	return (
		<>
			<p role="alert" className="px-2 pt-1.5 pb-2 text-danger-strong type-body [overflow-wrap:anywhere]">
				{message}
			</p>
			<MenuSeparator />
			<MenuItem label="Try again" shortcut="↵" onClick={onRetry} />
		</>
	);
}
