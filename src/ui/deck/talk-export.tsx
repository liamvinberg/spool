import { useEffect, useRef } from "react";
import { talkFileName as pageFileName } from "../../deck/wire";
import { pageName } from "../../page-path";
import { type CanvasStore, visibleFramesOf } from "../canvas/canvas-store";
import {
	type BuiltFile,
	EXPORT_WIDTH,
	type Exported,
	type ExportProgress,
	FileName,
	saveFiles,
	useExportSteps,
} from "../canvas/export-menu";
import { buildFramePdf, type CapturedFrame } from "../canvas/frame-export";
import { desktopWindow } from "../desktop-window";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { MenuItem, StepMenu } from "../primitives/overlays";
import { Segment, SegmentedControl } from "../primitives/selection";
import { useRemembered } from "../remembered";
import { fetchTalkHtml } from "./deck-api";

/**
 * A deck's talk exported (spool#275), where export already is: in the export menu while a deck page is open, above
 * the selection's own export, and from the deck page's row in Pages. As a PDF it is the selection's PDF fed the talk's
 * slides in order, one page each, captured as the canvas draws them, at their last beat; a slide that won't capture
 * is left out and named. As HTML it is one file that plays the talk from disk, built by the daemon. Loose frames are in
 * neither.
 */

export type TalkFormat = "pdf" | "html";

export const TALK_FORMATS: readonly TalkFormat[] = ["pdf", "html"];

const isTalkFormat = (value: unknown): value is TalkFormat =>
	typeof value === "string" && (TALK_FORMATS as readonly string[]).includes(value);

/** A talk to export: its page, and its slides in the order they play. */
export interface Talk {
	readonly project: string;
	readonly page: string;
	readonly slides: readonly string[];
}

/** The file a talk exports as, named after its page, whatever the project. */
export const talkFileName = (talk: Talk, format: TalkFormat) => pageFileName(talk.page, format);

/** A slide as the export's words name it: its own name, without the page every slide shares. */
const slideName = (frame: string) => pageName(frame);

/** Build the talk's file and hand it to the browser to download. */
export async function exportTalk(
	talk: Talk,
	format: TalkFormat,
	capture: (frame: string) => Promise<CapturedFrame>,
	progress: (at: ExportProgress) => void,
): Promise<Exported> {
	const name = talkFileName(talk, format);
	if (format === "html") {
		progress({ done: 0, total: 1 });
		const file: BuiltFile = { name, type: "text/html", bytes: await fetchTalkHtml(talk.project, talk.page) };
		progress({ done: 1, total: 1 });
		return saveFiles([file]);
	}
	const total = talk.slides.length + 1;
	const captured: CapturedFrame[] = [];
	const left: string[] = [];
	for (const [index, slide] of talk.slides.entries()) {
		progress({ done: index, total, detail: slideName(slide) });
		try {
			captured.push(await capture(slide));
		} catch {
			// one slide that won't capture costs its page, not the talk
			left.push(slideName(slide));
		}
	}
	if (captured.length === 0) throw new Error("No slide of the talk could be captured. Try again.");
	progress({ done: talk.slides.length, total, detail: "writing the file" });
	const bytes = await buildFramePdf(captured);
	progress({ done: total, total });
	const saved = await saveFiles([{ name, type: "application/pdf", bytes }]);
	return left.length === 0 ? saved : { ...saved, left };
}

/** How long a slide may take to come onto the canvas once its page is opened for the talk's PDF. */
const ON_CANVAS_MS = 10_000;

/** Once the canvas shows the frame: on the page in front, and not on its way to the Trash. */
export function onCanvas(store: CanvasStore, frame: string): Promise<void> {
	const here = () => visibleFramesOf(store.get()).some((one) => one.name === frame);
	if (here()) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			stop();
			reject(new Error(`${slideName(frame)} is not on the canvas.`));
		}, ON_CANVAS_MS);
		const stop = store.subscribe(() => {
			if (!here()) return;
			clearTimeout(timeout);
			stop();
			resolve();
		});
	});
}

/**
 * Exporting a talk from a menu: the format it was last exported as, the file that names, and `run`, which puts the
 * menu's steps on Building, then Saved or Failed.
 */
export function useTalkExport(
	talk: Talk | undefined,
	capture: (frame: string) => Promise<CapturedFrame>,
	exporting: Pick<ReturnType<typeof useExportSteps>, "run">,
) {
	const [format, setFormat] = useRemembered<TalkFormat>("export.talk", "pdf", isTalkFormat);
	const run = () => {
		if (talk === undefined || talk.slides.length === 0) return;
		exporting.run(talkFileName(talk, format), format === "pdf" ? talk.slides.length + 1 : 1, (progress) =>
			exportTalk(talk, format, capture, progress),
		);
	};
	return { format, setFormat, file: talk === undefined ? "" : talkFileName(talk, format), run };
}

/** The talk's rows in an export choice: its format, pdf or html, and the act, which wears ↵ where it is the menu's one. */
export function TalkChoice({
	format,
	onFormat,
	file,
	onExport,
	enter = false,
}: {
	format: TalkFormat;
	onFormat: (format: TalkFormat) => void;
	file: string;
	onExport: () => void;
	enter?: boolean;
}) {
	return (
		<>
			<div className="flex items-center gap-2 px-1 pt-1 pb-0.5">
				<span className="shrink-0 pl-2 text-secondary type-label">talk</span>
				<SegmentedControl
					label="Talk format"
					size="sm"
					value={format}
					onValueChange={(value) => {
						if (isTalkFormat(value)) onFormat(value);
					}}
					className="flex min-w-0 flex-1"
				>
					{TALK_FORMATS.map((one) => (
						<Segment key={one} value={one} className="flex-1 justify-center">
							{one}
						</Segment>
					))}
				</SegmentedControl>
			</div>
			<MenuItem
				label="Export talk"
				meta={<FileName file={file} />}
				shortcut={enter ? "↵" : undefined}
				onClick={onExport}
				className={enter ? "bg-state-hover-raised" : undefined}
			/>
		</>
	);
}

/**
 * Export talk… from a deck page's row in Pages: the menu it was chosen in, opened again in its place as the talk's
 * choice, which goes on into the export's steps in the same box.
 */
export function TalkExportMenu({
	at,
	talk,
	capture,
	onClose,
}: {
	at: { x: number; y: number };
	talk: Talk;
	capture: (frame: string) => Promise<CapturedFrame>;
	onClose: () => void;
}) {
	const exporting = useExportSteps({ finder: desktopWindow()?.onExportDownload !== undefined, onClose });
	const choice = useTalkExport(talk, capture, exporting);
	const box = useRef<HTMLDivElement>(null);
	const closing = useRef(onClose);
	closing.current = onClose;
	// it holds the keyboard as the canvas's export steps do, and a press outside it puts it away
	useEffect(() => {
		const detach = attachHotkeyLayer({ scope: "dialog", handlers: { "dialog.close": () => closing.current() } });
		const outside = (event: PointerEvent) => {
			if (event.target instanceof Node && box.current?.contains(event.target) !== true) closing.current();
		};
		document.addEventListener("pointerdown", outside, true);
		return () => {
			detach();
			document.removeEventListener("pointerdown", outside, true);
		};
	}, []);
	const step = exporting.step?.kind ?? "choice";
	return (
		<StepMenu
			ref={box}
			at={at}
			step={step}
			width={EXPORT_WIDTH}
			aria-label={`Export ${pageName(talk.page)}`}
			className="fixed z-50"
			onClose={onClose}
			onKeyDown={(event) => {
				if (event.key !== "Enter") return;
				const act = step === "choice" ? choice.run : exporting.enter;
				if (act === undefined) return;
				event.preventDefault();
				event.stopPropagation();
				act();
			}}
			onPointerDown={(event) => event.stopPropagation()}
			onContextMenu={(event) => event.preventDefault()}
		>
			{exporting.view ?? (
				<TalkChoice
					format={choice.format}
					onFormat={choice.setFormat}
					file={choice.file}
					onExport={choice.run}
					enter
				/>
			)}
		</StepMenu>
	);
}
