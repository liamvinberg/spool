import "./landing-fit.css";
import { type ReactNode, type PointerEvent, memo, useCallback, useEffect, useRef, useState } from "react";
import { CAPTURED, type ModelState, useModels } from "../../../lib/spool/agent-model";
import { cn } from "../../../lib/utils";
import { CanvasChrome } from "../../spool/canvas-chrome";
import { type CanvasTool, CanvasTools } from "../../spool/canvas-tools";
import { FrameLabel } from "../../spool/frame-label";
import { AgentIcon, ChevronIcon, CloseIcon, PanelCaret, PlusIcon, PropertiesIcon } from "../../spool/icons";
import { TabStrip } from "../../spool/tab-strip";
import "../../spool/app-header.css";
import { Offprint } from "./offprint";
import { type Camera, centerOn, entryCamera, fitCamera, zoomAt } from "./canvas-camera";
import "./canvas-motion.css";
import "./mobile-product.css";
import { ModelMenu } from "../../spool/model-control";
import { NumField, Row, Section, VALUE } from "../../spool/properties-fields";
import { DEMO_TAKES, DemoProduct, type DemoTake } from "./landing-product";
import "../sleeve-real/app.css";

export type AppView = "canvas" | "agent" | "properties";
const NAMES: Record<DemoTake, string> = {
	workshops: "offprint-workshops",
	booking: "offprint-booking",
	ticket: "offprint-ticket",
};
const PAGES = [{ name: "app", frames: DEMO_TAKES.map((take) => NAMES[take]), active: true, open: true }];
const POSITIONS: Record<DemoTake, { x: number; y: number }> = {
	workshops: { x: 0, y: 0 },
	booking: { x: 1320, y: 0 },
	ticket: { x: 660, y: 1060 },
};
const CanvasProduct = memo(Offprint);
const MOBILE_QUERY = "(max-width: 760px), (pointer: coarse)";
const ASK = "Prototype a workshop booking app. Show finding a workshop, choosing a time, and the ticket.";

function LandingShell({
	children,
	zoom,
	home,
	onHome,
	onOpen,
	onFit,
}: {
	children: ReactNode;
	zoom: string;
	home: boolean;
	onHome: () => void;
	onOpen: () => void;
	onFit: () => void;
}) {
	const [tabs, setTabs] = useState([{ root: "offprint", name: "offprint" }]);
	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-bg font-sans text-text antialiased">
			<header className="app-header relative z-20 flex h-11 shrink-0 items-center justify-between gap-[18px] bg-bg px-4">
				<div className="flex h-full min-w-0 flex-1 items-center">
					<div className="app-home-zone">
						<button
							type="button"
							className="app-home"
							aria-current={home ? "page" : undefined}
							onClick={onHome}
							title="Home"
						>
							<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
								<path
									d="m3.5 8 6.5-5.5L16.5 8v9h-5v-5h-3v5h-5Z"
									stroke="currentColor"
									strokeWidth="1.45"
									strokeLinejoin="round"
								/>
							</svg>
							<span>Home</span>
						</button>
					</div>
					<TabStrip
						tabs={tabs}
						focused={home ? null : "offprint"}
						onFocus={onOpen}
						onClose={() => {
							setTabs([]);
							onHome();
						}}
						onPick={onHome}
						onReorder={() => {}}
					/>
				</div>
				{!home && (
					<button
						type="button"
						className="font-mono text-xs text-muted"
						aria-label="Fit canvas"
						title="Fit canvas (Shift 1)"
						onClick={onFit}
					>
						{zoom}
					</button>
				)}
			</header>
			<main className="min-h-0 flex-1">
				{home ? (
					<div className="sc-home">
						<h2>Your projects.</h2>
						<button
							type="button"
							onClick={() => {
								setTabs([{ root: "offprint", name: "offprint" }]);
								onOpen();
							}}
						>
							<span>offprint</span>
							<span>3 frames</span>
						</button>
						<p>Open Offprint to try the canvas.</p>
					</div>
				) : (
					children
				)}
			</main>
		</div>
	);
}

/** Shared local demo. Tabs mirror the app; camera and flow use its spatial rules. */
export function OffprintSurface({ view = "agent", className = "" }: { view?: AppView; className?: string }) {
	const [dock, setDock] = useState<AppView>(view);
	const [selected, setSelected] = useState<DemoTake | null>("workshops");
	const [entered, setEntered] = useState<DemoTake | null>(null);
	const [tool, setTool] = useState<CanvasTool>("select");
	const [geometry, setGeometry] = useState(POSITIONS);
	const [camera, setCameraState] = useState<Camera>(() =>
		// Match the fixed 1600 × 900 stage, 248px page rail and 44px header/strip
		// in prerendered HTML too. Hydration must not zoom already-visible frames.
		fitCamera(
			{ x: 0, y: 0, w: 2520, h: 1860 },
			1600 - 248 - 44 - (view === "agent" ? 420 : view === "properties" ? 300 : 0),
			900 - 44,
		),
	);
	const current = useRef(camera);
	const viewport = useRef<HTMLDivElement>(null);
	const flight = useRef(0);
	const pointer = useRef(false);
	const space = useRef(false);
	const moved = useRef(false);
	const drag = useRef<{
		id: number;
		x: number;
		y: number;
		from: Camera;
		take: DemoTake | null;
		position: { x: number; y: number };
	} | null>(null);
	const [home, setHome] = useState(false);
	const [session, setSession] = useState({ time: "10:00", seats: 1 });
	const settings = useRef<HTMLDialogElement>(null);
	const player = useRef<HTMLDialogElement>(null);
	const playerReturn = useRef<HTMLElement | null>(null);
	const [playing, setPlaying] = useState<DemoTake>("workshops");
	const [quiet, setQuiet] = useState(false);
	const [mobile, setMobile] = useState(false);
	const navigation = useRef<(take: DemoTake) => void>(() => {});
	const openWorkshop = useCallback(() => navigation.current("booking"), []);
	const backToWorkshops = useCallback(() => navigation.current("workshops"), []);
	const bookWorkshop = useCallback((time: string, seats: number) => {
		setSession({ time, seats });
		navigation.current("ticket");
	}, []);
	useEffect(() => {
		const media = window.matchMedia(MOBILE_QUERY);
		const update = () => setMobile(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);
	useEffect(() => setDock(view), [view]);
	const put = useCallback((next: Camera) => {
		current.current = next;
		setCameraState(next);
	}, []);
	const fly = (next: Camera) => {
		cancelAnimationFrame(flight.current);
		if (quiet || !pointer.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			put(next);
			return;
		}
		const from = current.current,
			start = performance.now();
		const step = (now: number) => {
			const p = Math.min((now - start) / 220, 1),
				e = 1 - (1 - p) ** 3;
			put({
				x: from.x + (next.x - from.x) * e,
				y: from.y + (next.y - from.y) * e,
				k: from.k + (next.k - from.k) * e,
			});
			if (p < 1) flight.current = requestAnimationFrame(step);
		};
		flight.current = requestAnimationFrame(step);
	};
	const box = (take: DemoTake) => ({ ...geometry[take], w: 1200, h: 800 });
	const fitAll = () => {
		const node = viewport.current;
		if (!node) return;
		const xs = DEMO_TAKES.map((t) => geometry[t].x),
			ys = DEMO_TAKES.map((t) => geometry[t].y);
		setEntered(null);
		fly(
			fitCamera(
				{
					x: Math.min(...xs),
					y: Math.min(...ys),
					w: Math.max(...xs) - Math.min(...xs) + 1200,
					h: Math.max(...ys) - Math.min(...ys) + 800,
				},
				node.clientWidth,
				node.clientHeight,
			),
		);
	};
	useEffect(() => {
		const node = viewport.current;
		if (!node) return;
		put(fitCamera({ x: 0, y: 0, w: 2520, h: 1860 }, node.clientWidth, node.clientHeight));
		return () => cancelAnimationFrame(flight.current);
	}, [put]);
	useEffect(() => {
		if (home) return;
		const node = viewport.current;
		if (!node) return;
		const wheel = (event: WheelEvent) => {
			if (!event.ctrlKey && !event.metaKey) return;
			event.preventDefault();
			cancelAnimationFrame(flight.current);
			const rect = node.getBoundingClientRect(),
				scale = rect.width / node.clientWidth;
			put(
				zoomAt(
					current.current,
					(event.clientX - rect.left) / scale,
					(event.clientY - rect.top) / scale,
					Math.exp(-event.deltaY * 0.002),
				),
			);
		};
		node.addEventListener("wheel", wheel, { passive: false });
		return () => node.removeEventListener("wheel", wheel);
	}, [home, put]);
	const pick = (take: DemoTake) => {
		setSelected(take);
		setEntered(null);
	};
	const enter = (take: DemoTake) => {
		const node = viewport.current;
		if (!node) return;
		setEntered(take);
		setSelected(null);
		node.focus({ preventScroll: true });
		fly(entryCamera(current.current, box(take), node.clientWidth, node.clientHeight));
	};
	const walk = (take: DemoTake) => {
		const node = viewport.current;
		if (!node) return;
		setEntered(take);
		setSelected(null);
		node.focus({ preventScroll: true });
		fly(centerOn(current.current, box(take), node.clientWidth, node.clientHeight));
	};
	navigation.current = walk;
	const startDrag = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === "touch" || !event.isPrimary) return;
		if (event.button !== 0 && event.button !== 1) return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		const frame = target.closest<HTMLElement>("[data-demo-frame]");
		const take = DEMO_TAKES.find((t) => t === frame?.dataset.demoFrame) ?? null;
		const pan = tool === "hand" || space.current || event.button === 1;
		if (
			!pan &&
			(target.closest("button:not(.sr-app-select),input,textarea,[data-frame-label]") ||
				(entered === take && take !== null))
		)
			return;
		cancelAnimationFrame(flight.current);
		moved.current = false;
		if (!pan && take) pick(take);
		event.currentTarget.focus({ preventScroll: true });
		drag.current = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			from: current.current,
			take: pan ? null : take,
			position: take ? geometry[take] : { x: 0, y: 0 },
		};
	};
	const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
		const held = drag.current,
			node = viewport.current;
		if (!held || held.id !== event.pointerId || !node) return;
		const scale = node.getBoundingClientRect().width / node.clientWidth;
		const dx = (event.clientX - held.x) / scale,
			dy = (event.clientY - held.y) / scale;
		if (Math.abs(dx) + Math.abs(dy) < 4 && !moved.current) return;
		if (!moved.current) event.currentTarget.setPointerCapture(event.pointerId);
		moved.current = true;
		if (held.take) {
			const take = held.take;
			setGeometry((was) => ({
				...was,
				[take]: {
					x: Math.round(held.position.x + dx / held.from.k),
					y: Math.round(held.position.y + dy / held.from.k),
				},
			}));
		} else put({ ...held.from, x: held.from.x + dx, y: held.from.y + dy });
	};
	const panelWidth = dock === "agent" ? 420 : dock === "properties" ? 300 : 0;
	return (
		<div
			className={cn("sr-app sc-current", className)}
			data-app-surface=""
			data-view={dock}
			data-quiet={quiet}
			data-mobile={mobile}
		>
			<div
				className="sr-app-stage"
				inert={mobile}
				data-input={pointer.current ? "pointer" : "keyboard"}
				onPointerDownCapture={() => {
					pointer.current = true;
				}}
				onKeyDownCapture={(event) => {
					pointer.current = false;
					if (event.key === "Escape") {
						setEntered(null);
						viewport.current?.focus({ preventScroll: true });
						event.stopPropagation();
					}
					const target = event.target;
					if (target instanceof Element && target.closest('button,input,textarea,[contenteditable="true"]'))
						return;
					if (entered) return;
					if (event.code === "Space") {
						space.current = true;
						event.preventDefault();
					}
					if (event.key.toLowerCase() === "h") setTool("hand");
					if (event.key.toLowerCase() === "v") setTool("select");
					if (event.code === "Digit1" && event.shiftKey) {
						fitAll();
						event.preventDefault();
					}
					if (event.key === "Enter" && selected) {
						enter(selected);
						event.preventDefault();
					}
				}}
				onBlurCapture={() => {
					space.current = false;
				}}
				onKeyUpCapture={(event) => {
					if (event.code === "Space") space.current = false;
				}}
			>
				<LandingShell
					zoom={`${Math.round(camera.k * 100)}%`}
					home={home}
					onHome={() => setHome(true)}
					onOpen={() => setHome(false)}
					onFit={fitAll}
				>
					<div className="flex h-full min-w-0">
						<div className="sr-app-canvas min-w-0 flex-1">
							<CanvasChrome
								pages={PAGES}
								selected={selected ? NAMES[selected] : undefined}
								tool="none"
								rail={null}
								onSelectFrame={(name) => {
									const take = DEMO_TAKES.find((t) => NAMES[t] === name);
									if (take) pick(take);
								}}
								onFocusFrame={(name) => {
									const take = DEMO_TAKES.find((t) => NAMES[t] === name),
										node = viewport.current;
									if (take && node) fly(fitCamera(box(take), node.clientWidth, node.clientHeight));
								}}
							>
								<div
									ref={viewport}
									className="sc-viewport"
									// biome-ignore lint/a11y/noNoninteractiveTabindex: The canvas owns keyboard navigation and Escape focus.
									tabIndex={0}
									role="application"
									aria-label="Offprint canvas"
									data-tool={tool}
									onPointerDown={startDrag}
									onPointerMove={moveDrag}
									onPointerUp={() => {
										drag.current = null;
									}}
									onPointerCancel={() => {
										drag.current = null;
										space.current = false;
									}}
									onLostPointerCapture={() => {
										drag.current = null;
									}}
								>
									<div
										className="sc-world"
										data-demo-camera=""
										style={{ transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.k})` }}
									>
										{DEMO_TAKES.map((take) => (
											<div
												key={take}
												className="sc-frame"
												data-demo-frame={take}
												style={{ left: geometry[take].x, top: geometry[take].y }}
											>
												<FrameLabel
													name={NAMES[take]}
													frameWidth={1200}
													k={camera.k}
													entered={entered === take}
													selected={selected === take}
													hovered={false}
													onPlay={() => {
														playerReturn.current = viewport.current;
														setPlaying(take);
														player.current?.showModal();
													}}
												/>
												<div className="sc-document" inert={entered !== take}>
													<CanvasProduct
														key={`${take}:${session.time}:${session.seats}`}
														screen={take}
														time={session.time}
														seats={session.seats}
														onOpen={openWorkshop}
														onBook={bookWorkshop}
														onBack={backToWorkshops}
													/>
												</div>
												{entered !== take && (
													<button
														type="button"
														className="sr-app-select"
														aria-label={`Select ${NAMES[take]}`}
														onClick={() => {
															if (!moved.current) pick(take);
														}}
														onDoubleClick={() => enter(take)}
													/>
												)}
												{selected === take && (
													<div className="sr-app-selection" style={{ borderWidth: 1.5 / camera.k }}>
														<i />
														<i />
														<i />
														<i />
														<span>1200 × 800</span>
													</div>
												)}
											</div>
										))}
									</div>
								</div>
								<CanvasTools
									tool={tool}
									onTool={(next) => {
										setTool(next);
										setEntered(null);
									}}
								/>
							</CanvasChrome>
						</div>
						<aside aria-label="Dock" data-dock="" className="relative z-20 flex h-full shrink-0">
							<div className="sc-dock-panel" style={{ width: panelWidth }}>
								<div
									className="sc-dock-face"
									data-open={dock === "agent"}
									inert={dock !== "agent"}
									aria-hidden={dock !== "agent"}
								>
									<SettledAgent
										selected={selected}
										onDrop={() => setSelected(null)}
										onJump={(take) => {
											pick(take);
											const node = viewport.current;
											if (node) fly(fitCamera(box(take), node.clientWidth, node.clientHeight));
										}}
									/>
								</div>
								<div
									className="sc-dock-face"
									data-open={dock === "properties"}
									inert={dock !== "properties"}
									aria-hidden={dock !== "properties"}
								>
									<FrameProperties
										selected={selected}
										geometry={geometry}
										onCollapse={() => setDock("canvas")}
										onPosition={(axis, value) => {
											if (selected)
												setGeometry((was) => ({ ...was, [selected]: { ...was[selected], [axis]: value } }));
										}}
									/>
								</div>
							</div>
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
										className={cn(
											"sc-dock-button relative flex h-8 w-8 items-center justify-center rounded-sm",
											dock === surface ? "bg-raised text-text" : "text-muted/70 hover:text-text",
										)}
									>
										{surface === "agent" ? (
											<AgentIcon className="h-4 w-4" />
										) : (
											<PropertiesIcon className="h-4 w-4" />
										)}
									</button>
								))}
								<button
									type="button"
									aria-label="Settings"
									onClick={() => settings.current?.showModal()}
									className="sc-dock-button mt-auto mb-1.5 flex h-8 w-8 items-center justify-center text-muted/70"
								>
									<Cog />
								</button>
							</div>
						</aside>
					</div>
				</LandingShell>
			</div>
			<button
				type="button"
				className="sc-mobile-open"
				onClick={(event) => {
					playerReturn.current = event.currentTarget;
					setPlaying("workshops");
					player.current?.showModal();
				}}
			>
				Open interactive demo
			</button>
			<dialog ref={settings} className="sc-settings">
				<div>
					<h2>Settings</h2>
					<button type="button" aria-label="Close settings" onClick={() => settings.current?.close()}>
						<CloseIcon />
					</button>
				</div>
				<label>
					<span>Reduce motion</span>
					<input type="checkbox" checked={quiet} onChange={(event) => setQuiet(event.target.checked)} />
				</label>
				<p>Applies to this preview.</p>
			</dialog>
			<dialog
				ref={player}
				className="sc-player"
				data-mobile={mobile}
				onClose={() => playerReturn.current?.focus({ preventScroll: true })}
			>
				<div className="sc-player-top">
					<span>{NAMES[playing]}</span>
					<button type="button" onClick={() => player.current?.close()}>
						Close preview
					</button>
				</div>
				<div className="sg-product sc-mobile-product">
					<div className="sg-product-inner">
						<DemoProduct key={playing} take={playing} reduceMotion={quiet} />
					</div>
				</div>
			</dialog>
		</div>
	);
}

function FrameProperties({
	selected,
	geometry,
	onPosition,
	onCollapse,
}: {
	selected: DemoTake | null;
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
	selected: DemoTake | null;
	onDrop: () => void;
	onJump: (take: DemoTake) => void;
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
								offprint-workshops · offprint-booking · offprint-ticket
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
							I’ll build three connected screens. You can pick a time, add a friend, and see those choices on the
							ticket.
						</p>
						<div>
							<ToolRow verb="read" subject="shared/ui/offprint" detail="shared/ui/offprint.tsx" />
							{DEMO_TAKES.map((take) => (
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
							The workshop, booking, and ticket are on the canvas. The poster carries through the flow, and your
							chosen time and seats stay with you.
						</p>
						<p className="text-base text-text leading-base">
							Select a frame to compare it, or press play to try it.
						</p>
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
