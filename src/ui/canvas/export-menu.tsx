/**
 * Export (spool#239), the right-click menu's last step before Move to Trash: the
 * menu itself becomes the choice (png, pdf or html, and for html how much of
 * the flow to take, and whether it opens in the player), then the line that says the file is being built, then
 * the line that says where it landed. What a step draws lives here; the menu
 * that morphs between them is the StepMenu primitive, worked by the context menu.
 * Export project… (spool#240) takes the same steps past the choice, in the tab's
 * and the cover's menus.
 */

import { type ReactNode, useCallback, useRef, useState } from "react";
import { fetchExportHtml } from "../api";
import { desktopWindow } from "../desktop-window";
import { CheckIcon } from "../icons";
import { SpinRing } from "../primitives/display";
import { Drain, Progress } from "../primitives/feedback";
import { MenuItem, MenuSeparator } from "../primitives/overlays";
import { Segment, SegmentedControl, Switch } from "../primitives/selection";
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
	/** what could not be captured and is left out of the file, said beside where it saved */
	left?: readonly string[] | undefined;
}

/**
 * Build the files, hand them to the browser to download, and in the Mac app
 * wait for it to say where each one landed. PNG and PDF are captured here,
 * from the frames as the canvas draws them; HTML is the daemon's to build.
 */
export async function exportFrames(
	request: { project: string; frames: readonly string[]; format: ExportFormat; scope: ExportScope; player: boolean },
	capture: (frame: string) => Promise<CapturedFrame>,
	progress: (at: ExportProgress) => void,
): Promise<Exported> {
	const { project, frames, format } = request;
	const total = frames.length + (format === "pdf" ? 1 : 0);
	const files: BuiltFile[] = [];
	const captured: CapturedFrame[] = [];
	for (const [index, frame] of frames.entries()) {
		progress({ done: index, total, detail: frames.length > 1 ? frame : undefined });
		if (format === "html") {
			// several frames give one file each, and each takes its flow
			const scope = frames.length === 1 ? request.scope : "flow";
			const bytes = await fetchExportHtml(project, frame, scope, request.player);
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
	return saveFiles(files);
}

/** A file an export built, before it is handed to the browser. */
export interface BuiltFile {
	name: string;
	type: string;
	bytes: Uint8Array;
}

/** Hand the files to the browser to download, and in the Mac app wait for it to say where each one landed. */
export async function saveFiles(files: readonly BuiltFile[]): Promise<Exported> {
	const bridge = desktopWindow();
	const saved = landed(
		files.map((file) => file.name),
		bridge?.onExportDownload?.bind(bridge),
	);
	for (const file of files) downloadBytes(file.bytes, file.type, file.name);
	const reports = await saved;
	const bytes = files.reduce((sum, file) => sum + file.bytes.length, 0);
	const [first] = reports ?? [];
	if (files.length > 1) return { file: `${files.length} files`, bytes, path: first?.path };
	return { file: first?.filename ?? files[0]?.name ?? "", bytes, path: first?.path };
}

/** the Mac app's report on one download, by the name the page asked for */
export type Landed =
	| { status: "completed"; requested: string; filename: string; path?: string | undefined }
	| { status: "failed"; requested: string; message: string };

type Completed = Extract<Landed, { status: "completed" }>;

/**
 * The Mac app's word on where each file landed, heard before any is handed
 * over so none is missed; null in a plain browser, which says nothing. An app
 * that stays silent never holds the box on Building: after 15 s it settles
 * with the reports it has, and a file without one has no Finder path.
 */
export function landed(
	requested: readonly string[],
	listen: ((heard: (report: Landed) => void) => () => void) | undefined,
): Promise<Completed[]> | null {
	if (listen === undefined) return null;
	return new Promise((resolve, reject) => {
		const waiting = [...requested];
		const reports: Completed[] = [];
		const quiet = setTimeout(() => {
			stop();
			resolve(reports);
		}, 15_000);
		const stop = listen((report) => {
			const at = waiting.indexOf(report.requested);
			if (at === -1) return;
			waiting.splice(at, 1);
			if (report.status === "failed") {
				clearTimeout(quiet);
				stop();
				reject(new Error(report.message));
				return;
			}
			reports.push(report);
			if (waiting.length > 0) return;
			clearTimeout(quiet);
			stop();
			resolve(reports);
		});
	}) as Promise<Completed[]>;
}

/* ------------------------------------------------------------------ steps -- */

/** the steps past the choice: the file being built, then where it landed or why it did not */
export type ExportStep =
	| { kind: "building"; file: string; progress: ExportProgress }
	| { kind: "saved"; exported: Exported }
	| { kind: "failed"; message: string };

type ExportWork = (progress: (at: ExportProgress) => void) => Promise<Exported>;

/**
 * A menu's export once it is under way: `run` puts it on Building and on to
 * Saved or Failed, `enter` is what ↵ does in the step standing, `view` draws
 * it, and `reset` puts the menu back, dropping a run still going. `finder`
 * says the Mac app saves the file and may show it.
 */
export function useExportSteps({ finder, onClose }: { finder: boolean; onClose: () => void }): {
	step: ExportStep | null;
	run: (file: string, total: number, work: ExportWork) => void;
	reset: () => void;
	enter: (() => void) | undefined;
	view: ReactNode;
} {
	const [step, setStep] = useState<ExportStep | null>(null);
	const last = useRef<{ file: string; total: number; work: ExportWork } | null>(null);
	const runs = useRef(0);
	const run = useCallback((file: string, total: number, work: ExportWork) => {
		last.current = { file, total, work };
		const id = ++runs.current;
		const now = (next: (was: ExportStep | null) => ExportStep | null) =>
			setStep((was) => (runs.current === id ? next(was) : was));
		setStep({ kind: "building", file, progress: { done: 0, total } });
		work((progress) => now((was) => (was?.kind === "building" ? { ...was, progress } : was))).then(
			(exported) => now(() => ({ kind: "saved", exported })),
			(error: unknown) =>
				now(() => ({
					kind: "failed",
					message: error instanceof Error && error.message !== "" ? error.message : "Export failed. Try again.",
				})),
		);
	}, []);
	const reset = useCallback(() => {
		runs.current++;
		last.current = null;
		setStep(null);
	}, []);
	const retry = () => {
		const again = last.current;
		if (again !== null) run(again.file, again.total, again.work);
	};
	const reveal = (path: string | undefined) => {
		if (path !== undefined) void desktopWindow()?.revealDownload?.(path);
		onClose();
	};
	const enter =
		step?.kind === "failed"
			? retry
			: step?.kind === "saved" && finder && step.exported.path !== undefined
				? () => reveal(step.exported.path)
				: undefined;
	const view =
		step === null ? null : step.kind === "building" ? (
			<ExportBuilding file={step.file} progress={step.progress} />
		) : step.kind === "saved" ? (
			<ExportSaved
				exported={step.exported}
				finder={finder}
				onReveal={() => reveal(step.exported.path)}
				onClose={onClose}
			/>
		) : (
			<ExportFailed message={step.message} onRetry={retry} />
		);
	return { step, run, reset, enter, view };
}

export function ExportChoice({
	format,
	onFormat,
	scope,
	onScope,
	reach,
	player,
	onPlayer,
	target,
	onExport,
}: {
	format: ExportFormat;
	onFormat: (format: ExportFormat) => void;
	scope: ExportScope;
	onScope: (scope: ExportScope) => void;
	/** HTML opens in the player (spool#304) */
	player: boolean;
	onPlayer: (player: boolean) => void;
	/** the frames beyond the one exported that its links reach; empty for several frames */
	reach: number;
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
			{html ? (
				<>
					<MenuSeparator />
					<PlayerRow on={player} onChange={onPlayer} />
				</>
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

/**
 * With player: the row is the switch, a press anywhere on it flips it, and the line under it says what the file opens
 * as, rising anew as it flips.
 */
function PlayerRow({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
	return (
		<div
			role="menuitemcheckbox"
			aria-checked={on}
			tabIndex={-1}
			onClick={() => onChange(!on)}
			onKeyDown={(event) => {
				if (event.key !== " ") return;
				event.preventDefault();
				onChange(!on);
			}}
			className="flex cursor-pointer flex-col rounded-sm pt-1.5 pr-2 pb-2 pl-3 transition-colors duration-fast ease-out hover:bg-state-hover-raised motion-reduce:transition-none"
		>
			<span className="flex items-center gap-2">
				<span className="min-w-0 flex-1 text-primary type-control">With player</span>
				{/* the switch flips it on its own, so its press is not the row's too */}
				<Switch
					checked={on}
					onCheckedChange={onChange}
					onClick={(event) => event.stopPropagation()}
					aria-label="With player"
				/>
			</span>
			<span key={on ? "on" : "off"} className="block animate-step-in pt-0.5 pr-8 text-secondary type-label">
				{on ? "Anyone can resize it in the browser." : "Opens as the frame alone."}
			</span>
		</div>
	);
}

/** the file name, its extension rising anew as the format changes; a long one gives way before its extension */
export function FileName({ file }: { file: string }) {
	const dot = file.lastIndexOf(".");
	if (dot === -1) return <>{file}</>;
	const extension = file.slice(dot);
	return (
		<span className="flex min-w-0 whitespace-pre">
			<span className="min-w-0 truncate">{file.slice(0, dot)}</span>
			<span key={extension} className="shrink-0 animate-step-in">
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
	// a file missing a page stays up until it is read
	const left = exported.left ?? [];
	return (
		<div className="group/saved relative flex flex-col">
			<div className="flex flex-col gap-0.5 px-2 pt-1.5 pb-2">
				<div className="flex items-center gap-2">
					<span className="flex size-4 animate-step-in items-center justify-center rounded-full bg-accent text-on-accent">
						<CheckIcon className="size-3" />
					</span>
					<span className="text-primary type-control">{finder ? "Saved to Downloads" : "Downloaded"}</span>
				</div>
				<span className="flex min-w-0 pl-6 text-secondary type-detail">
					<span className="min-w-0 truncate">{exported.file}</span>
					<span className="shrink-0 whitespace-pre"> · {fileSize(exported.bytes)}</span>
				</span>
				{left.length === 0 ? null : (
					<span role="status" className="pl-6 text-danger-strong type-detail [overflow-wrap:anywhere]">
						Left out {left.join(", ")}: {left.length === 1 ? "it" : "they"} couldn’t be captured
					</span>
				)}
			</div>
			{finder && exported.path !== undefined ? (
				<>
					<MenuSeparator />
					<MenuItem label="Show in Finder" shortcut="↵" onClick={onReveal} />
				</>
			) : null}
			{left.length > 0 ? null : (
				<Drain
					duration={SAVED_MS}
					className="-inset-x-1 -bottom-1 group-hover/saved:[animation-play-state:paused]"
					onAnimationEnd={onClose}
				/>
			)}
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
