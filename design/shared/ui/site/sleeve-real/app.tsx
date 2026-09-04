import { useEffect, useRef, useState } from "react";
import { CAPTURED, type ModelState, useModels } from "shared/lib/spool/agent-model";
import { SleeveProduct, SLEEVE_TAKES, type SleeveTake } from "shared/ui/demo/sleeve/variations";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { CanvasTools, type CanvasTool } from "shared/ui/spool/canvas-tools";
import { FrameLabel } from "shared/ui/spool/frame-label";
import { AgentIcon, ChevronIcon, CloseIcon, PanelCaret, PlusIcon, PropertiesIcon } from "shared/ui/spool/icons";
import { ModelMenu } from "shared/ui/spool/model-control";
import { NumField, Row, Section, VALUE } from "shared/ui/spool/properties-fields";
import { SpoolShell } from "shared/ui/spool/shell";
import "./app.css";

export type AppView = "canvas" | "agent" | "properties";
const NAMES: Record<SleeveTake, string> = {
	shelf: "sleeve-shelf",
	catalog: "sleeve-catalog",
	listening: "sleeve-listening",
};
const PAGES = [{ name: "app", frames: SLEEVE_TAKES.map((take) => NAMES[take]), active: true, open: true }];
const POSITIONS: Record<SleeveTake, { x: number; y: number }> = {
	shelf: { x: 0, y: 0 },
	catalog: { x: 1320, y: 0 },
	listening: { x: 660, y: 1060 },
};
const ASK = "Make three directions for Sleeve, a place to listen to records.";

/**
 * Site-only specimen. Chrome follows src/ui's shell, dock and settled AgentRail;
 * the transcript and Sleeve frames are demonstration data, disclosed by the page.
 * This never starts an agent, writes a frame or persists application state.
 */
export function AppSurface({ view = "agent", className = "" }: { view?: AppView; className?: string }) {
	const container = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	const [dock, setDock] = useState<AppView>(view);
	const [selected, setSelected] = useState<SleeveTake | null>("shelf");
	const [entered, setEntered] = useState<SleeveTake | null>(null);
	const [tool, setTool] = useState<CanvasTool>("select");
	const [geometry, setGeometry] = useState(POSITIONS);
	useEffect(() => setDock(view), [view]);
	useEffect(() => {
		const element = container.current;
		if (element === null) return;
		const resize = () => setScale(element.clientWidth / 1600);
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	const pick = (take: SleeveTake) => {
		setSelected(take);
		setEntered(null);
	};
	return (
		<div ref={container} className={`sr-app ${className}`} data-app-surface="" data-view={dock}>
			<div
				className="sr-app-stage"
				style={{ transform: `scale(${scale})` }}
				onKeyDown={(event) => {
					if (event.key === "Escape") setEntered(null);
				}}
			>
				<SpoolShell activeTab="sleeve" tabs={["sleeve"]} zoom="32%">
					<div className="flex h-full min-w-0">
						<div className="sr-app-canvas min-w-0 flex-1">
							<CanvasChrome
								pages={PAGES}
								selected={selected === null ? undefined : NAMES[selected]}
								tool="none"
								rail={null}
							>
								<div className="sr-app-field">
									{SLEEVE_TAKES.map((take) => (
										<div
											key={take}
											className="sr-app-frame"
											style={{ left: geometry[take].x * 0.32, top: geometry[take].y * 0.32 }}
										>
											<div className="sr-app-frame-document">
												<FrameLabel
													name={NAMES[take]}
													frameWidth={1200}
													k={0.32}
													entered={entered === take}
													paused={entered !== take}
													selected={selected === take}
													hovered={false}
													onPlay={() => {
														pick(take);
														setEntered(take);
													}}
												/>
												<SleeveProduct take={take} />
											</div>
											{entered !== take ? (
												<button
													type="button"
													className="sr-app-select"
													aria-label={`Select ${NAMES[take]}`}
													onClick={() => pick(take)}
													onDoubleClick={() => {
														pick(take);
														setEntered(take);
													}}
												/>
											) : null}
											{selected === take ? (
												<div className="sr-app-selection">
													<i />
													<i />
													<i />
													<i />
													<span>1200 × 800</span>
												</div>
											) : null}
										</div>
									))}
								</div>
								<CanvasTools tool={tool} onTool={setTool} />
							</CanvasChrome>
						</div>
						<aside aria-label="Dock" data-dock="" className="relative z-20 flex h-full shrink-0">
							{dock === "agent" ? (
								<SettledAgent selected={selected} onDrop={() => setSelected(null)} onJump={pick} />
							) : null}
							{dock === "properties" ? (
								<FrameProperties
									selected={selected}
									geometry={geometry}
									onCollapse={() => setDock("canvas")}
									onPosition={(axis, value) => {
										if (selected !== null)
											setGeometry((was) => ({ ...was, [selected]: { ...was[selected], [axis]: value } }));
									}}
								/>
							) : null}
							<div
								data-dock-strip=""
								className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-border border-l bg-bg pt-1.5"
							>
								{(["properties", "agent"] as const).map((surface) => (
									<button
										key={surface}
										type="button"
										data-dock-glyph={surface}
										aria-label={`${dock === surface ? "Shut" : "Expand"} ${surface}`}
										aria-pressed={dock === surface}
										onClick={() => setDock(dock === surface ? "canvas" : surface)}
										className={`relative flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-150 ${dock === surface ? "bg-raised text-text" : "text-muted/70 hover:text-text"}`}
									>
										{surface === "agent" ? <AgentIcon className="h-4 w-4" /> : <PropertiesIcon className="h-4 w-4" />}
									</button>
								))}
								<button
									type="button"
									data-dock-glyph="settings"
									aria-label="Settings"
									title="Settings"
									className="relative mt-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-sm text-muted/70 hover:text-text"
								>
									<Cog />
								</button>
							</div>
						</aside>
					</div>
				</SpoolShell>
			</div>
		</div>
	);
}

function FrameProperties({
	selected,
	geometry,
	onPosition,
	onCollapse,
}: {
	selected: SleeveTake | null;
	geometry: typeof POSITIONS;
	onPosition: (axis: "x" | "y", value: number) => void;
	onCollapse: () => void;
}) {
	return (
		<section aria-label="Properties" className="flex h-full w-[300px] flex-col border-border border-l bg-bg">
			<div className="flex h-9 shrink-0 items-center justify-between border-border border-b px-2.5">
				<span className={VALUE}>{selected === null ? "no selection" : NAMES[selected]}</span>
				<button
					type="button"
					aria-label="Collapse properties"
					onClick={onCollapse}
					className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-muted/50 hover:text-text"
				>
					<PanelCaret dir="right" className="h-3.5 w-2.5" />
				</button>
			</div>
			{selected === null ? (
				<p className="px-2.5 py-3 font-mono text-muted text-xs">select a frame</p>
			) : (
				<>
					<Section name="position" reason="frame.json">
						{(["x", "y"] as const).map((axis) => (
							<Row key={axis} name={axis}>
								<NumField
									value={String(geometry[selected][axis])}
									readout="px"
									ok
									onCommit={(value) => {
										const next = Number(value);
										if (Number.isFinite(next)) onPosition(axis, next);
									}}
								/>
							</Row>
						))}
					</Section>
					<Section name="size" reason="frame.json">
						<Row name="w">
							<NumField value="1200" readout="px" ok onCommit={() => {}} />
						</Row>
						<Row name="h">
							<NumField value="800" readout="px" ok onCommit={() => {}} />
						</Row>
					</Section>
				</>
			)}
		</section>
	);
}

/** Settled branches from src/ui/canvas/agent-rail.tsx, with a fixed local transcript. */
function SettledAgent({
	selected,
	onDrop,
	onJump,
}: {
	selected: SleeveTake | null;
	onDrop: () => void;
	onJump: (take: SleeveTake) => void;
}) {
	const [draft, setDraft] = useState("");
	const [listing, setListing] = useState(false);
	const [fresh, setFresh] = useState(false);
	const [model, setModel] = useState<ModelState>(CAPTURED);
	const models = useModels();
	return (
		<section
			aria-label="Agent"
			data-agent-rail=""
			className="flex h-full w-[420px] min-w-[200px] flex-col overflow-hidden border-border border-l bg-bg"
		>
			<div data-agent-plate="" className="flex h-[34px] shrink-0 items-center gap-1 border-border border-b px-3.5">
				<button
					type="button"
					data-agent-plate-ask=""
					aria-expanded={listing}
					onClick={() => setListing(!listing)}
					className="-ml-1.5 flex h-7 min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 text-left hover:bg-surface"
				>
					<span className="min-w-0 flex-1 truncate text-sm leading-4">{fresh ? "new thread" : ASK}</span>
					<ChevronIcon open={listing} className="h-2.5 w-2.5 shrink-0 text-muted/45" />
				</button>
				<button
					type="button"
					aria-label="New thread"
					onClick={() => {
						setFresh(true);
						setListing(false);
						setDraft("");
					}}
					className="-mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted/45 hover:text-text"
				>
					<PlusIcon className="h-3 w-3" />
				</button>
			</div>
			<div className="relative min-h-0 flex-1 overflow-auto">
				{listing ? (
					<div className="absolute inset-x-0 top-0 z-10 border-border border-b bg-bg p-1.5">
						<button
							type="button"
							className="w-full rounded-sm bg-surface px-3 py-2.5 text-left text-base leading-base"
							onClick={() => {
								setFresh(false);
								setListing(false);
							}}
						>
							{ASK}
							<span className="mt-1 block font-mono text-2xs text-muted">
								sleeve-shelf · sleeve-catalog · sleeve-listening
							</span>
						</button>
					</div>
				) : null}
				{fresh ? null : (
					<div className="flex flex-col gap-5 px-3.5 pt-6 pb-4">
						<div className="relative flex flex-col gap-1.5 pl-3.5">
							<span className="absolute top-[3px] bottom-[3px] left-0 w-[2px] rounded-full bg-border-raised" />
							<p className="whitespace-pre-wrap text-base text-text leading-base">{ASK}</p>
						</div>
						<p className="text-base text-text leading-base">
							I’ll explore a record shelf, a split catalog, and a listening room. Each direction will be a working
							frame.
						</p>
						<div>
							<ToolRow verb="read" subject="shared/ui/demo/sleeve" detail="shared/ui/demo/sleeve/variations.tsx" />
							{SLEEVE_TAKES.map((take) => (
								<ToolRow
									key={take}
									verb="write"
									subject={NAMES[take]}
									detail={`frames/app/${NAMES[take]}/frame.tsx`}
									onJump={() => onJump(take)}
								/>
							))}
							<ToolRow verb="check" subject="3 frames" detail="Type check passed." />
						</div>
						<p className="text-base text-text leading-base">
							Three directions are on the canvas. The shelf leads with the collection. The catalog puts browsing beside
							the featured record. The listening room gives one record the whole stage.
						</p>
						<p className="text-base text-text leading-base">Select a frame to compare it, or press play to try it.</p>
					</div>
				)}
			</div>
			<div className="relative flex shrink-0 flex-col gap-2.5 border-border border-t p-3.5">
				<div className="flex min-h-0 flex-col gap-2.5 rounded-md border border-border-raised bg-surface px-3 py-2.5 focus-within:border-muted/45">
					{selected === null ? null : (
						<span className="flex h-6 w-fit max-w-full items-center gap-2 rounded-sm border border-border-raised bg-raised pr-1 pl-2">
							<span className="h-3 w-[2px] rounded-full bg-thread/55" />
							<span className="font-mono text-text/85 text-xs">{NAMES[selected]}</span>
							<button
								type="button"
								aria-label={`drop ${NAMES[selected]}`}
								onClick={onDrop}
								className="flex h-4 w-4 items-center justify-center text-muted/50 hover:text-text"
							>
								<CloseIcon className="h-2 w-2" />
							</button>
						</span>
					)}
					<textarea
						value={draft}
						rows={3}
						spellCheck={false}
						placeholder="say what to change"
						aria-label="say what to change"
						onChange={(event) => setDraft(event.target.value)}
						className="h-[60px] w-full resize-none bg-transparent text-base text-text leading-base outline-none placeholder:text-muted/50"
					/>
				</div>
				<div className="relative flex h-[18px] items-center justify-between gap-2.5">
					<ModelMenu state={model} models={models} onPick={(next) => setModel((was) => ({ ...was, ...next }))} />
				</div>
			</div>
		</section>
	);
}

function ToolRow({
	verb,
	subject,
	detail,
	onJump,
}: {
	verb: string;
	subject: string;
	detail: string;
	onJump?: () => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="flex flex-col">
			<div className="-mx-1.5 flex h-[26px] w-fit max-w-full items-center gap-2.5 rounded-sm px-1.5">
				<svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" aria-hidden="true">
					<path
						d="m3.1 7 2.5 2.6 5.3-5.2"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
				<button
					type="button"
					onClick={() => setOpen(!open)}
					aria-expanded={open}
					className="font-mono text-muted text-sm leading-4"
				>
					{verb}
				</button>
				{onJump ? (
					<button
						type="button"
						data-agent-jump={subject}
						onClick={onJump}
						className="truncate font-mono text-sm text-text/85 leading-4 hover:underline hover:decoration-dotted hover:decoration-thread/60"
					>
						{subject}
					</button>
				) : (
					<span className="truncate font-mono text-sm text-text/85 leading-4">{subject}</span>
				)}
				<button
					type="button"
					onClick={() => setOpen(!open)}
					aria-label={`Details for ${verb} ${subject}`}
					aria-expanded={open}
				>
					<ChevronIcon open={open} className="h-2.5 w-2.5 text-muted/35" />
				</button>
			</div>
			{open ? (
				<span className="truncate pt-0.5 pb-1 pl-6 font-mono text-2xs text-muted/55 leading-4">{detail}</span>
			) : null}
		</div>
	);
}

function Cog() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M13.23 6.66 14.93 7.01v1.98l-1.7.35-.58 1.41.95 1.45-1.4 1.4-1.45-.95-1.41.58-.35 1.7H7.01l-.35-1.7-1.41-.58-1.45.95-1.4-1.4.95-1.45-.58-1.41-1.7-.35V7.01l1.7-.35.58-1.41-.95-1.45 1.4-1.4 1.45.95 1.41-.58.35-1.7h1.98l.35 1.7 1.41.58 1.45-.95 1.4 1.4-.95 1.45.58 1.41Z"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinejoin="round"
			/>
			<circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.4" />
		</svg>
	);
}
