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
import { type Talk, TalkChoice, useTalkExport } from "../deck/talk-export";
import { desktopWindow } from "../desktop-window";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { hotkeyKey } from "../hotkeys";
import { MenuItem, MenuSeparator, StepMenu } from "../primitives/overlays";
import { useRemembered } from "../remembered";
import {
	EXPORT_WIDTH,
	ExportChoice,
	type ExportFormat,
	type ExportScope,
	exportFrames,
	exportTarget,
	isExportFormat,
	useExportSteps,
} from "./export-menu";
import type { CapturedFrame } from "./frame-export";

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export interface MenuPlacement {
	x: number;
	y: number;
}

export function ContextMenu({
	at,
	project,
	exportable,
	capture,
	talk,
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
	/** the talk of the deck page in front (spool#275), exported above the selection; absent on any other page */
	talk?: Talk | undefined;
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
	const [kept, keep] = useRemembered<boolean>("export.player", true, isBoolean);
	const [choosing, setChoosing] = useState(false);
	const exporting = useExportSteps({ finder: desktopWindow()?.onExportDownload !== undefined, onClose });
	const step = exporting.step?.kind ?? (choosing ? "choice" : "menu");
	const [format, setFormat] = useState<ExportFormat>(last);
	const [scope, setScope] = useState<ExportScope>("flow");
	const [player, setPlayer] = useState(kept);
	const [plans, setPlans] = useState<ReadonlyMap<string, ExportPlan>>(new Map());
	const talkExport = useTalkExport(talk, capture, exporting);
	const frames = exportable ?? [];
	const framesKey = frames.join("\n");
	const past = step !== "menu";

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
		if (step !== "choice" || framesKey === "") return;
		let live = true;
		const names = framesKey.split("\n");
		void Promise.all(
			names.map((frame) =>
				fetchExportPlan(project, frame).then(
					(plan): [string, ExportPlan] => [frame, plan],
					(): [string, ExportPlan] => [frame, { reach: [] }],
				),
			),
		).then((answered) => {
			if (live) setPlans(new Map(answered));
		});
		return () => {
			live = false;
		};
	}, [step, framesKey, project]);

	const run = () => {
		if (frames.length === 0) return;
		setLast(format);
		if (format === "html") keep(player);
		exporting.run(
			frames.length > 1 && format !== "pdf" ? `${frames.length} files` : exportTarget(project, frames, format),
			frames.length,
			(progress) => exportFrames({ project, frames, format, scope, player }, capture, progress),
		);
	};

	const [only] = frames;
	const reach = frames.length === 1 && only !== undefined ? (plans.get(only)?.reach.length ?? 0) : 0;

	return (
		<StepMenu
			at={at}
			step={step}
			width={past ? EXPORT_WIDTH : undefined}
			onClose={onClose}
			onKeyDown={(event) => {
				if (event.key !== "Enter") return;
				const act = step === "choice" ? run : exporting.enter;
				if (act === undefined) return;
				event.preventDefault();
				event.stopPropagation();
				act();
			}}
			onPointerDown={(event) => event.stopPropagation()}
			onContextMenu={(event) => event.preventDefault()}
		>
			{step === "menu" ? (
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
								setPlayer(kept);
								setChoosing(true);
							}}
						/>
					)}
					<MenuSeparator />
					<MenuItem label="Move to Trash" shortcut={hotkeyKey("canvas.trash")} onClick={onTrash} />
				</>
			) : step === "choice" ? (
				<>
					{talk === undefined ? null : (
						<>
							<TalkChoice
								format={talkExport.format}
								onFormat={talkExport.setFormat}
								file={talkExport.file}
								onExport={talkExport.run}
							/>
							<MenuSeparator />
						</>
					)}
					<ExportChoice
						format={format}
						onFormat={setFormat}
						scope={scope}
						onScope={setScope}
						reach={reach}
						player={player}
						onPlayer={setPlayer}
						target={exportTarget(project, frames, format)}
						onExport={run}
					/>
				</>
			) : (
				exporting.view
			)}
		</StepMenu>
	);
}
