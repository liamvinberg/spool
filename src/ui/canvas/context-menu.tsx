/**
 * The right-click menu (#23), the second door to decided actions only (#7),
 * Play from here / Record / Copy path / History… / Reload / Set as thumbnail / Tidy /
 * Export… / Move to Trash. History… is a team project's (spool#187). Set as thumbnail makes the frame's
 * still as it is now the project's picture on Home; it waits, disabled, until
 * the frame has one. Export exists only for a frame selection, and it never
 * leaves the menu (spool#239): the menu becomes the export choice, then the
 * building line, then the saved one, in the same box at the pointer. Tidy is
 * always here — it lays out the field, so it answers to no one frame.
 * Play is the player's door (#13/#24); the player owns cinema in its own tab.
 * Record (spool#221) is the same door, opened recording; only while that experiment is on.
 *
 * Every item that has a bare key wears it, so the menu teaches the shortcut
 * that replaces it. Copying the source path is the one verb without one: it
 * hands the file to something outside spool, which is not a reflex the hands
 * need a key for.
 */

import { useEffect, useRef, useState } from "react";
import { type ExportPlan, fetchExportPlan } from "../api";
import { desktopWindow } from "../desktop-window";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { hotkeyKey } from "../hotkeys";
import { MenuItem, MenuSeparator, StepMenu } from "../primitives/overlays";
import { useRemembered } from "../remembered";
import {
	EXPORT_WIDTH,
	ExportBuilding,
	ExportChoice,
	type Exported,
	ExportFailed,
	type ExportFormat,
	type ExportProgress,
	ExportSaved,
	type ExportScope,
	exportFrames,
	exportTarget,
	isExportFormat,
	onlineFrames,
} from "./export-menu";
import type { CapturedFrame } from "./frame-export";

export interface MenuPlacement {
	x: number;
	y: number;
}

type Step =
	| { kind: "menu" }
	| { kind: "choice" }
	| { kind: "building"; file: string; progress: ExportProgress }
	| { kind: "saved"; exported: Exported }
	| { kind: "failed"; message: string };

export function ContextMenu({
	at,
	project,
	exportable,
	capture,
	tidyLabel,
	onTidy,
	onPlay,
	onRecord,
	onCopyPath,
	onHistory,
	onReload,
	onSetThumbnail,
	onTrash,
	onClose,
}: {
	at: MenuPlacement;
	project: string;
	/** the frames Export takes, in canvas order; null when the menu acts on an element */
	exportable: readonly string[] | null;
	/** one frame's picture as the canvas draws it, for PNG and PDF */
	capture: (frame: string) => Promise<CapturedFrame>;
	tidyLabel: string;
	onTidy: () => void;
	onPlay: () => void;
	/** "Record": the player opened recording; absent while the experiment is off. */
	onRecord?: (() => void) | undefined;
	onCopyPath: () => void;
	/** "History…": the frame's team history in the History pane; absent on a project that isn't a team's. */
	onHistory?: (() => void) | undefined;
	onReload: () => void;
	/** "Set as thumbnail"; absent while the frame has no still, which leaves the item disabled. */
	onSetThumbnail?: (() => void) | undefined;
	onTrash: () => void;
	onClose: () => void;
}) {
	const [last, setLast] = useRemembered<ExportFormat>("export.format", "png", isExportFormat);
	const [step, setStep] = useState<Step>({ kind: "menu" });
	const [format, setFormat] = useState<ExportFormat>(last);
	const [scope, setScope] = useState<ExportScope>("flow");
	const [plans, setPlans] = useState<ReadonlyMap<string, ExportPlan>>(new Map());
	const frames = exportable ?? [];
	const framesKey = frames.join("\n");
	const past = step.kind !== "menu";
	const choosing = step.kind === "choice";

	// past the menu, the step owns the keyboard as the dialog it replaced did
	const closing = useRef(onClose);
	closing.current = onClose;
	useEffect(
		() =>
			past
				? attachHotkeyLayer({ scope: "dialog", handlers: { "dialog.close": () => closing.current() } })
				: undefined,
		[past],
	);

	// what an HTML file would take, asked once the choice is up; a frame the daemon cannot plan takes itself alone
	useEffect(() => {
		if (!choosing || framesKey === "") return;
		let live = true;
		const names = framesKey.split("\n");
		void Promise.all(
			names.map((frame) =>
				fetchExportPlan(project, frame).then(
					(plan): [string, ExportPlan] => [frame, plan],
					(): [string, ExportPlan] => [frame, { reach: [], online: [] }],
				),
			),
		).then((answered) => {
			if (live) setPlans(new Map(answered));
		});
		return () => {
			live = false;
		};
	}, [choosing, framesKey, project]);

	const run = () => {
		if (frames.length === 0) return;
		setLast(format);
		setStep({
			kind: "building",
			file: exportTarget(project, frames, format),
			progress: { done: 0, total: frames.length },
		});
		exportFrames({ project, frames, format, scope }, capture, (progress) =>
			setStep((was) => (was.kind === "building" ? { ...was, progress } : was)),
		).then(
			(exported) => setStep({ kind: "saved", exported }),
			(error: unknown) =>
				setStep({
					kind: "failed",
					message: error instanceof Error && error.message !== "" ? error.message : "Export failed. Try again.",
				}),
		);
	};

	const reveal = (path: string | undefined) => {
		if (path !== undefined) void desktopWindow()?.revealDownload?.(path);
		onClose();
	};
	const finder = desktopWindow()?.onExportDownload !== undefined;

	const [only] = frames;
	const reach = frames.length === 1 && only !== undefined ? (plans.get(only)?.reach.length ?? 0) : 0;

	return (
		<StepMenu
			at={at}
			step={step.kind}
			width={past ? EXPORT_WIDTH : undefined}
			onClose={onClose}
			onKeyDown={(event) => {
				if (event.key !== "Enter") return;
				const act =
					step.kind === "choice" || step.kind === "failed"
						? run
						: step.kind === "saved" && finder && step.exported.path !== undefined
							? () => reveal(step.exported.path)
							: undefined;
				if (act === undefined) return;
				event.preventDefault();
				event.stopPropagation();
				act();
			}}
			onPointerDown={(event) => event.stopPropagation()}
			onContextMenu={(event) => event.preventDefault()}
		>
			{step.kind === "menu" ? (
				<>
					<MenuItem label="Play from here" shortcut={hotkeyKey("canvas.play")} onClick={onPlay} />
					{onRecord === undefined ? null : <MenuItem label="Record" onClick={onRecord} />}
					<MenuItem label="Copy path" onClick={onCopyPath} />
					{onHistory === undefined ? null : <MenuItem label="History…" onClick={onHistory} />}
					<MenuItem label="Reload frame" shortcut={hotkeyKey("canvas.reload")} onClick={onReload} />
					<MenuItem
						label="Set as thumbnail"
						disabled={onSetThumbnail === undefined}
						onClick={() => onSetThumbnail?.()}
					/>
					<MenuSeparator />
					<MenuItem label={tidyLabel} shortcut={hotkeyKey("canvas.tidy")} onClick={onTidy} />
					{exportable === null ? null : (
						<MenuItem
							label={frames.length === 1 ? "Export…" : `Export ${frames.length} frames…`}
							meta={last}
							onClick={() => {
								setFormat(last);
								setStep({ kind: "choice" });
							}}
						/>
					)}
					<MenuSeparator />
					<MenuItem label="Move to Trash" shortcut={hotkeyKey("canvas.trash")} onClick={onTrash} />
				</>
			) : step.kind === "choice" ? (
				<ExportChoice
					format={format}
					onFormat={setFormat}
					scope={scope}
					onScope={setScope}
					reach={reach}
					online={onlineFrames(frames, plans, reach > 0 ? scope : "flow")}
					target={exportTarget(project, frames, format)}
					onExport={run}
				/>
			) : step.kind === "building" ? (
				<ExportBuilding file={step.file} progress={step.progress} />
			) : step.kind === "saved" ? (
				<ExportSaved
					exported={step.exported}
					finder={finder}
					onReveal={() => reveal(step.exported.path)}
					onClose={onClose}
				/>
			) : (
				<ExportFailed message={step.message} onRetry={run} />
			)}
		</StepMenu>
	);
}
