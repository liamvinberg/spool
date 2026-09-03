import { useEffect, useState } from "react";
import { cn } from "shared/lib/utils";
import { CARD_H, CARD_W, Scaled, TvarsoCheckout, TvarsoTimetable } from "shared/ui/demo/tvarso-checkout";
import {
	ICONS,
	type LibFile,
	type LibPart,
	Strip,
	TOKEN_COUNT,
	TVARSO_FILES,
	TVARSO_PAGES,
	TVARSO_PARTS,
	TVARSO_TOKENS,
	isSolo,
} from "shared/ui/demo/tvarso-library";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * The library is not a place you go. It is a panel in the dock, beside
 * properties, and it opens over whichever page you are already on
 * ([spool-cloud#31](https://github.com/liamvinberg/spool-cloud/issues/31)).
 *
 * The panel is the outline: every component in file order with a strip of
 * itself and its count, a family under its file's name, `tokens.css` first. Press
 * a row and the reach mark from `shared-reach` does the rest: every frame on the
 * canvas that renders the component lights up, and the pages rail dots the ones
 * that are not on screen. The row opens to list them by name, and a name is a
 * way there.
 *
 * The case for it: nothing new to draw. The library is a list, and reach is
 * already the canvas's job. Nothing is a picture of a component, because the
 * component is right there in the frames. The case against: a component with no
 * frame on this page is a row with a dot in another page's rail and nothing to
 * look at, so you go somewhere to see it after all.
 */

const SCALE = 0.44;

const PAGES: readonly PageRow[] = TVARSO_PAGES.map((page) => ({
	name: page.name,
	frames: page.frames,
	active: page.name === "booking",
	open: page.name === "booking",
}));

/** the four booking frames standing on the canvas, with what each of them renders */
const ON_CANVAS: readonly { name: string; x: number; y: number; body: React.ReactNode }[] = [
	{ name: "timetable", x: 48, y: 96, body: <TvarsoTimetable /> },
	{ name: "checkout", x: 48 + (CARD_W * SCALE + 48) * 1, y: 96, body: <TvarsoCheckout variation="card" /> },
	{ name: "checkout--swish", x: 48 + (CARD_W * SCALE + 48) * 2, y: 96, body: <TvarsoCheckout variation="swish" /> },
	{ name: "checkout--empty", x: 48 + (CARD_W * SCALE + 48) * 3, y: 96, body: <TvarsoCheckout variation="empty" /> },
];

const PARTS = new Map<string, LibPart>(TVARSO_FILES.flatMap((file) => file.parts.map((part) => [part.name, part] as const)));

export default function LibraryDockFrame() {
	const [chosen, setChosen] = useState<string | null>("Button");
	const part = chosen === null ? undefined : PARTS.get(chosen);
	const holders = part?.used ?? [];

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setChosen(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<SpoolShell activeTab="tvarso" tabs={["tvarso"]} zoom="44%">
			<CanvasChrome
				pages={PAGES}
				tool="select"
				railLabel="library"
				railWidth={300}
				holding={holders}
				rail={<Panel chosen={chosen} onChoose={setChosen} />}
			>
				<div className="relative h-full w-full overflow-clip" onPointerDown={() => setChosen(null)}>
					{ON_CANVAS.map((frame) => {
						const lit = holders.includes(frame.name);
						return (
							<div key={frame.name} className="absolute flex flex-col gap-1.5" style={{ left: frame.x, top: frame.y }}>
								<span
									className={cn(
										"font-mono text-sm leading-4 transition-colors duration-150",
										lit ? "text-thread" : "text-muted",
									)}
								>
									{frame.name}
								</span>
								<div className="relative">
									<Scaled scale={SCALE} className="rounded-md">
										{frame.body}
									</Scaled>
									{/* the reach mark, at the frame: this frame renders what the row names */}
									{lit ? <span className="pointer-events-none absolute -inset-[3px] rounded-[10px] border border-thread" /> : null}
								</div>
							</div>
						);
					})}
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/* ---------- the panel ---------- */

const LABEL = "font-mono text-2xs text-muted/55 leading-3";
const VALUE = "font-mono text-sm leading-sm";
const FAINT = "font-mono text-2xs text-muted leading-3";

function Panel({ chosen, onChoose }: { chosen: string | null; onChoose: (name: string | null) => void }) {
	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			<div className="flex h-9 shrink-0 items-center gap-2 border-border border-b px-2.5">
				<span className={cn("text-text", VALUE)}>src/ui</span>
				<span className={cn("ml-auto", FAINT)}>
					{TVARSO_PARTS} components · {TOKEN_COUNT} tokens
				</span>
			</div>
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-4">
				<TokensRow />
				{TVARSO_FILES.map((file) => (
					<FileRows key={file.file} file={file} chosen={chosen} onChoose={onChoose} />
				))}
				<div className="flex h-8 items-center gap-2 px-2.5">
					<span className={cn("w-16 shrink-0 rounded-[5px] border border-border-raised/60 border-dashed", "h-6")} />
					<span className={cn("text-muted/70", VALUE)}>Stepper</span>
					<span className={cn("ml-auto", FAINT)}>no frame yet</span>
				</div>
			</div>
		</div>
	);
}

function TokensRow() {
	const colours = TVARSO_TOKENS.find((group) => group.kind === "colour")?.tokens ?? [];
	return (
		<div className="flex h-9 items-center gap-2 border-border border-b px-2.5">
			<span className="flex w-16 shrink-0 items-center gap-[3px]">
				{colours.map((token) => (
					<span key={token.name} className="h-3 w-2 rounded-[2px] border border-border-raised/60" style={{ background: token.swatch }} />
				))}
			</span>
			<span className={cn("text-text", VALUE)}>tokens.css</span>
			<span className={cn("ml-auto", FAINT)}>{TOKEN_COUNT} tokens</span>
		</div>
	);
}

function FileRows({ file, chosen, onChoose }: { file: LibFile; chosen: string | null; onChoose: (name: string | null) => void }) {
	if (isSolo(file)) {
		const part = file.parts[0] as LibPart;
		return <Row part={part} file={file.file} chosen={chosen === part.name} onChoose={onChoose} />;
	}
	if (file.file === "icons.tsx") {
		return (
			<div className="flex flex-col border-border border-b py-1.5">
				<span className={cn("px-2.5 pb-1", LABEL)}>{file.file}</span>
				<div className="grid grid-cols-5 gap-1 px-2.5">
					{ICONS.map((icon) => {
						const on = chosen === icon.name;
						return (
							<button
								key={icon.name}
								type="button"
								title={icon.name}
								onClick={(event) => {
									event.stopPropagation();
									onChoose(on ? null : icon.name);
								}}
								className={cn(
									"flex h-9 cursor-pointer items-center justify-center rounded-[5px] border transition-colors",
									on ? "border-thread text-text" : "border-border-raised/40 text-muted hover:border-border-raised hover:text-text",
								)}
							>
								<icon.Icon className="h-4 w-4" />
							</button>
						);
					})}
				</div>
			</div>
		);
	}
	return (
		<div className="flex flex-col border-border border-b py-1.5">
			<span className={cn("px-2.5 pb-0.5", LABEL)}>{file.file}</span>
			{file.parts.map((part) => (
				<Row key={part.name} part={part} chosen={chosen === part.name} onChoose={onChoose} inset />
			))}
		</div>
	);
}

function Row({
	part,
	file,
	chosen,
	inset = false,
	onChoose,
}: {
	part: LibPart;
	file?: string;
	chosen: boolean;
	inset?: boolean;
	onChoose: (name: string | null) => void;
}) {
	return (
		<div className={cn("flex flex-col", inset ? "" : "border-border border-b")}>
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation();
					onChoose(chosen ? null : part.name);
				}}
				className={cn(
					"flex h-10 w-full cursor-pointer items-center gap-2 px-2.5 text-left transition-colors hover:bg-surface",
					chosen ? "bg-surface" : "",
				)}
			>
				<Strip part={part} width={64} height={28} className="rounded-[4px]" />
				<span className={cn("truncate", chosen ? "text-thread" : "text-text", VALUE)}>{part.name}</span>
				{file === undefined ? null : <span className={cn("truncate text-muted/35", FAINT)}>{file}</span>}
				<span className={cn("ml-auto shrink-0", FAINT)}>{part.used.length}</span>
			</button>
			{chosen ? (
				<div className="flex flex-col gap-1 px-2.5 pt-0.5 pb-2">
					<span className={LABEL}>rendered by {part.used.length} frames</span>
					<div className="-mx-1 flex flex-col">
						{part.used.map((name) => (
							<button
								key={name}
								type="button"
								className={cn("flex h-6 cursor-pointer items-center gap-2 rounded-xs px-1 text-left text-muted hover:bg-raised hover:text-text", VALUE)}
							>
								<span className="truncate">{name}</span>
								<span className={cn("ml-auto shrink-0", FAINT)}>
									{TVARSO_PAGES.find((page) => page.frames.includes(name))?.name}
								</span>
							</button>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}
