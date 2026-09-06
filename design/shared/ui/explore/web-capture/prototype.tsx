import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { FrameLabel } from "shared/ui/spool/frame-label";
import { SpoolMark } from "shared/ui/spool/mark";
import { SpoolShell } from "shared/ui/spool/shell";
import { CapturedContent, type CaptureTarget, SourceWebsite, TARGET_LABEL, TARGET_SIZE, TARGETS } from "./source";
import "./prototype.css";

export type CaptureTake = "toolbar" | "panel" | "paste";
export type CaptureCase = "selected" | "page" | "unavailable" | "incomplete" | "arrival";
type Phase =
	| "dormant"
	| "selecting"
	| "selected"
	| "capturing"
	| "copied"
	| "unavailable"
	| "incomplete"
	| "paste"
	| "arrival";
const TAKE_NAME: Record<CaptureTake, string> = {
	toolbar: "Send from the toolbar",
	panel: "Review in a side panel",
	paste: "Copy, then paste in spool",
};
const DESTINATIONS = ["fieldwork / references", "fieldwork / app", "weekend / ideas"];

function Button({
	children,
	onClick,
	primary = false,
	disabled = false,
	title,
}: {
	children: ReactNode;
	onClick?: () => void;
	primary?: boolean;
	disabled?: boolean;
	title?: string;
}) {
	return (
		<button
			type="button"
			className={cn("wc-button", primary && "wc-primary")}
			onClick={onClick}
			disabled={disabled}
			title={title}
		>
			{children}
		</button>
	);
}

function SmallPreview({
	target,
	incomplete = false,
	width = 280,
	cardIndex = 1,
}: {
	target: CaptureTarget;
	incomplete?: boolean;
	width?: number;
	cardIndex?: number;
}) {
	const size = TARGET_SIZE[target];
	const scale = Math.min(width / size.w, 180 / size.h);
	return (
		<div className="wc-preview" style={{ height: size.h * scale + 24 }}>
			<div style={{ width: size.w * scale, height: size.h * scale }}>
				<div style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
					<CapturedContent target={target} incomplete={incomplete} cardIndex={cardIndex} />
				</div>
			</div>
		</div>
	);
}

// Throwaway UI for "copying a website into Spool". Three separate canvas
// rows, with failure and arrival states across. All transfer lives in memory.
export function CapturePrototype({ take, initial = "selected" }: { take: CaptureTake; initial?: CaptureCase }) {
	const [phase, setPhase] = useState<Phase>(initial === "page" ? "selected" : initial);
	const [target, setTarget] = useState<CaptureTarget>(initial === "page" ? "page" : "card");
	const [cardIndex, setCardIndex] = useState(1);
	const [destination, setDestination] = useState(DESTINATIONS[0] ?? "fieldwork / references");
	const [name, setName] = useState("sund-stays");
	const [partial, setPartial] = useState(false);
	const [problem, setProblem] = useState<"none" | "image" | "destination">(
		initial === "incomplete" ? "image" : initial === "unavailable" ? "destination" : "none",
	);
	const [message, setMessage] = useState("");
	const [rectangle, setRectangle] = useState({ x: 528, y: 369, w: 384, h: 424 });
	const scroller = useRef<HTMLDivElement>(null);
	const source = useRef<HTMLDivElement>(null);
	const active = phase === "selecting" || phase === "selected";
	const inSpool = phase === "arrival" || phase === "paste";
	const size = TARGET_SIZE[target];
	const project = destination.split(" / ")[0] ?? "fieldwork";
	const pageName = destination.split(" / ")[1] ?? "references";

	const measure = () => {
		const element = source.current?.querySelector(
			target === "card" || target === "photo"
				? `[data-capture="${target}"][data-card-index="${cardIndex}"]`
				: `[data-capture="${target}"]`,
		);
		const parent = scroller.current;
		if (element === undefined || element === null || parent === null) return;
		const bounds = element.getBoundingClientRect();
		const viewport = parent.getBoundingClientRect();
		setRectangle({ x: bounds.x - viewport.x, y: bounds.y - viewport.y, w: bounds.width, h: bounds.height });
	};
	useLayoutEffect(measure, [target, phase, cardIndex]);

	const cancel = () => {
		setPhase("dormant");
		setMessage("Capture cancelled. Nothing was added.");
		setPartial(false);
	};
	const selectTarget = (next: CaptureTarget) => {
		setTarget(next);
		setPhase("selected");
		setMessage("");
	};
	const moveTarget = (direction: number) => {
		const next = TARGETS[TARGETS.indexOf(target) + direction];
		if (next !== undefined) selectTarget(next);
	};
	const startCapture = () => {
		setMessage("");
		setPhase("capturing");
	};
	const complete = () => {
		setPartial(problem === "image");
		setPhase(take === "paste" ? "copied" : "arrival");
	};
	const reset = () => {
		setPhase("dormant");
		setTarget("card");
		setCardIndex(1);
		setPartial(false);
		setProblem("none");
		setMessage("");
		setName("sund-stays");
	};
	useEffect(() => {
		if (phase !== "capturing") return;
		const timer = setTimeout(() => {
			if (problem === "image") setPhase("incomplete");
			else if (problem === "destination" && take !== "paste") setPhase("unavailable");
			else setPhase("copied");
		}, 1100);
		return () => clearTimeout(timer);
	}, [phase, problem, take]);
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
			if (event.key === "Escape" && !inSpool && phase !== "dormant") {
				event.preventDefault();
				cancel();
			}
			if (active && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
				event.preventDefault();
				moveTarget(event.key === "ArrowUp" ? 1 : -1);
			}
			if (phase === "selected" && event.key === "Enter") {
				event.preventDefault();
				startCapture();
			}
			if (phase === "paste" && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
				event.preventDefault();
				setPhase(problem === "destination" ? "unavailable" : "arrival");
			}
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	});

	const scope = (
		<div className="wc-scope">
			<Button
				onClick={() => {
					setPhase("selecting");
					setMessage("");
				}}
				primary={target !== "page"}
			>
				Select component
			</Button>
			<Button
				onClick={() => {
					scroller.current?.scrollTo({ top: 0 });
					selectTarget("page");
				}}
				primary={target === "page"}
			>
				Whole page
			</Button>
		</div>
	);
	const targetControls = (
		<div className="wc-target">
			<span className="type-value">{TARGET_LABEL[target]}</span>
			<span className="type-detail text-muted">
				{size.w} × {size.h}
			</span>
			<div className="wc-grow">
				<Button title="Select parent (↑)" onClick={() => moveTarget(1)} disabled={target === "page"}>
					↑
				</Button>
				<Button title="Select child (↓)" onClick={() => moveTarget(-1)} disabled={target === "photo"}>
					↓
				</Button>
			</div>
		</div>
	);
	const destinationField = (
		<label className="wc-field">
			<span>Destination</span>
			<select
				aria-label="Destination"
				value={destination}
				onChange={(event) => {
					setDestination(event.target.value);
					if (event.target.value !== DESTINATIONS[0]) setProblem("none");
				}}
			>
				{DESTINATIONS.map((item) => (
					<option key={item}>{item}</option>
				))}
			</select>
		</label>
	);
	const nameField = (
		<label className="wc-field">
			<span>Frame name</span>
			<input aria-label="Frame name" value={name} onChange={(event) => setName(event.target.value)} />
		</label>
	);
	const disclosure =
		target === "page" ? (
			<p className="wc-note">Includes the footer. The film becomes a still image you can replace in spool.</p>
		) : null;
	const goToSpool = () => setPhase(take === "paste" ? "paste" : "arrival");

	return (
		<div className="wc-prototype" data-capture-take={take} data-phase={phase}>
			<div className="wc-experiment">
				{inSpool ? (
					<SpoolShell activeTab={project} tabs={[project, "weekend"]} zoom={target === "page" ? "46%" : "100%"}>
						<CanvasChrome
							pages={[
								{ name: "app", frames: ["home", "about"] },
								{
									name: pageName,
									frames: phase === "arrival" ? ["notes", name || "sund-stays"] : ["notes"],
									open: true,
									active: true,
								},
							]}
							selected={phase === "arrival" ? name || "sund-stays" : undefined}
							rail={null}
						>
							<div className="wc-existing">
								<div className="type-value text-muted mb-2">notes</div>
								<div>
									<h3>Places worth keeping.</h3>
									<p>
										A quieter pace.
										<br />
										Warm paper and green ink.
										<br />A little room around things.
									</p>
								</div>
							</div>
							{phase === "arrival" ? (
								<Arrival cardIndex={cardIndex} target={target} name={name || "sund-stays"} incomplete={partial} />
							) : (
								<div className="wc-paste-prompt">
									<SpoolMark className="h-7 w-6 text-muted" />
									<h2 className="type-heading">Paste into {pageName}</h2>
									<p className="type-body text-muted">
										Your copied {target === "page" ? "website page" : "component"} is ready.
									</p>
									<Button primary onClick={() => setPhase(problem === "destination" ? "unavailable" : "arrival")}>
										Paste here <kbd>⌘V</kbd>
									</Button>
									<label className="wc-field">
										<span>Paste somewhere else</span>
										<select
											aria-label="Paste destination"
											value={destination}
											onChange={(event) => setDestination(event.target.value)}
										>
											{DESTINATIONS.map((item) => (
												<option key={item}>{item}</option>
											))}
										</select>
									</label>
								</div>
							)}
							{phase === "arrival" && (
								<div className="wc-arrived" role="status">
									<span>
										Added <span className="type-value">{name || "sund-stays"}</span>
									</span>
									<button
										type="button"
										onClick={() => {
											setPhase("paste");
											setMessage("Import undone.");
										}}
									>
										Undo
									</button>
								</div>
							)}
						</CanvasChrome>
					</SpoolShell>
				) : (
					<>
						<div className="wc-browser">
							<div className="wc-browser-tab">
								<i />
								<i />
								<i />
								<span>Sund · Stays</span>
								<span>×</span>
							</div>
							<div className="wc-browser-address">
								<span>←</span>
								<span>→</span>
								<span>↻</span>
								<div>
									⊙ <span>sund.example/stays</span>
									<span>☆</span>
								</div>
								<button
									type="button"
									aria-label="Activate spool capture"
									title="Copy into spool"
									className={cn("wc-extension", phase !== "dormant" && "wc-extension-active")}
									onClick={() => {
										if (phase === "dormant") {
											setPhase("selecting");
											setMessage("");
										} else cancel();
									}}
								>
									<SpoolMark className="h-5 w-4" />
								</button>
								<span>⋮</span>
							</div>
						</div>
						<div className="wc-source" ref={scroller} onScroll={measure}>
							<div
								ref={source}
								onPointerMove={(event) => {
									if (phase !== "selecting" || !(event.target instanceof Element)) return;
									const value = event.target.closest("[data-capture]")?.getAttribute("data-capture");
									const next = TARGETS.find((item) => item === value);
									if (next !== undefined) {
										setTarget(next);
										const picked = event.target.closest("[data-card-index]")?.getAttribute("data-card-index");
										if (picked !== null && picked !== undefined) setCardIndex(Number(picked));
									}
								}}
								onClickCapture={(event) => {
									if (!active) return;
									event.preventDefault();
									event.stopPropagation();
									if (phase === "selecting") setPhase("selected");
								}}
							>
								<SourceWebsite />
							</div>
						</div>
						{active && (
							<div className="wc-selection-window">
								<div
									className="wc-selection"
									style={{ left: rectangle.x, top: rectangle.y, width: rectangle.w, height: rectangle.h }}
								>
									<span>
										{TARGET_LABEL[target]}{" "}
										<span>
											{size.w} × {size.h}
										</span>
									</span>
								</div>
							</div>
						)}
						{active && take !== "panel" && (
							<div className="wc-top-tools">
								<SpoolMark className="h-5 w-4 text-thread" />
								{scope}
								<Button title="Cancel capture" onClick={cancel}>
									✕
								</Button>
							</div>
						)}
						{active && take === "toolbar" && (
							<div className="wc-toolbar">
								<div>
									{targetControls}
									{phase === "selecting" && <p className="wc-note">Point to a component, then click to hold it.</p>}
									{disclosure}
								</div>
								<div className="wc-toolbar-destination">{destinationField}</div>
								<Button primary disabled={phase === "selecting"} onClick={startCapture}>
									Send to spool <span>↗</span>
								</Button>
							</div>
						)}
						{active && take === "panel" && (
							<aside className="wc-panel">
								<div className="wc-panel-heading">
									<SpoolMark className="h-5 w-4 text-thread" />
									<h2>Copy into spool</h2>
									<Button title="Cancel capture" onClick={cancel}>
										✕
									</Button>
								</div>
								{scope}
								{phase === "selecting" ? (
									<p className="wc-note">Point to a component, then click to hold it.</p>
								) : (
									<SmallPreview cardIndex={cardIndex} target={target} />
								)}
								{targetControls}
								<Button onClick={() => setPhase("selecting")}>Choose another element</Button>
								<div className="wc-rule" />
								{destinationField}
								{nameField}
								{disclosure}
								<Button primary disabled={phase === "selecting" || name.trim() === ""} onClick={startCapture}>
									Add to spool <span>↗</span>
								</Button>
								<p className="wc-note">Its appearance stays the same. Edit it in spool.</p>
							</aside>
						)}
						{active && take === "paste" && (
							<div
								className="wc-copy-chip"
								style={{
									left: target === "page" || target === "stays" ? 528 : Math.max(24, rectangle.x),
									top: Math.min(rectangle.y + rectangle.h + 88, 734),
								}}
							>
								{targetControls}
								<Button primary disabled={phase === "selecting"} onClick={startCapture}>
									Copy <kbd>↵</kbd>
								</Button>
								{disclosure}
							</div>
						)}
						{phase === "dormant" && (
							<div className="wc-idle" role="status">
								{message || "Press the spool extension to start selecting."}
							</div>
						)}
						{phase === "capturing" && (
							<div className="wc-feedback" role="status">
								<div className="wc-progress" />
								<SpoolMark className="h-6 w-5 text-thread" />
								<div>
									<h2 className="type-title">
										{target === "page" ? "Copying through the footer…" : "Copying the selected component…"}
									</h2>
									<p className="wc-note">Gathering images, fonts and styles.</p>
								</div>
								<Button onClick={cancel}>Cancel</Button>
							</div>
						)}
						{phase === "copied" && (
							<div className="wc-result" role="status">
								<div className="wc-result-heading">
									<span>✓</span>
									<h2>{take === "paste" ? "Copied. Paste it into spool." : `Added to ${destination}.`}</h2>
								</div>
								{take !== "paste" && <p className="type-value text-muted">{name || "sund-stays"}</p>}
								{partial && <p className="wc-note">Kept with the stay photo missing.</p>}
								{disclosure}
								<div className="wc-result-actions">
									<Button onClick={() => setPhase("selecting")}>Copy another</Button>
									<Button primary onClick={goToSpool}>
										Open spool <span>↗</span>
									</Button>
								</div>
							</div>
						)}
						{phase === "unavailable" && (
							<div className="wc-scrim">
								<section className="wc-dialog" role="dialog" aria-label="Destination unavailable">
									<h2>This destination is unavailable.</h2>
									<p className="wc-note">
										spool cannot reach <span className="type-value">{destination}</span>. Your capture is still here;
										nothing was added.
									</p>
									<SmallPreview cardIndex={cardIndex} target={target} />
									{destinationField}
									<div className="wc-result-actions">
										<Button onClick={cancel}>Cancel</Button>
										<Button
											primary
											onClick={() => {
												if (problem === "destination")
													setMessage("Still unavailable. Open spool and try again, or choose another destination.");
												else setPhase(take === "paste" ? "paste" : "copied");
											}}
										>
											Try again
										</Button>
									</div>
									{message && (
										<p className="wc-note" role="status">
											{message}
										</p>
									)}
								</section>
							</div>
						)}
						{phase === "incomplete" && (
							<div className="wc-scrim">
								<section className="wc-dialog" role="dialog" aria-label="Incomplete capture">
									<h2>One image could not be copied.</h2>
									<p className="wc-note">
										The stay photo will be missing. Everything else in this preview is included.
									</p>
									<SmallPreview cardIndex={cardIndex} target={target} incomplete />
									<div className="wc-resource">
										<span className="type-value">coast.jpg</span>
										<span className="type-detail text-muted">could not retrieve</span>
									</div>
									<p className="wc-note">
										Keep this incomplete {target === "page" ? "website page" : "component"}, or go back to the website.
									</p>
									<div className="wc-result-actions">
										<Button
											onClick={() => {
												setPhase("selected");
												setMessage("");
											}}
										>
											Go back
										</Button>
										<Button primary onClick={complete}>
											Keep incomplete
										</Button>
									</div>
								</section>
							</div>
						)}
					</>
				)}
			</div>
			<footer className="wc-test-bar">
				<span>{TAKE_NAME[take]}</span>
				<span className="type-detail">
					mock import · {phase}
					{partial ? " · incomplete accepted" : ""}
				</span>
				<div />
				<button
					type="button"
					onClick={() => {
						setProblem("destination");
						setPhase("unavailable");
						setMessage("");
					}}
				>
					Try unavailable destination
				</button>
				<button
					type="button"
					onClick={() => {
						setProblem("image");
						setPhase("incomplete");
						setMessage("");
					}}
				>
					Try missing image
				</button>
				<button type="button" onClick={reset}>
					Restart
				</button>
			</footer>
		</div>
	);
}

function Arrival({
	target,
	name,
	incomplete,
	cardIndex,
}: {
	target: CaptureTarget;
	name: string;
	incomplete: boolean;
	cardIndex: number;
}) {
	const size = TARGET_SIZE[target];
	const scale = Math.min(1, 720 / size.w, 640 / size.h);
	return (
		<div
			className="wc-imported"
			style={{
				left: target === "card" || target === "photo" ? 350 : 240,
				top: 100,
				width: size.w * scale,
				height: size.h * scale,
			}}
		>
			<FrameLabel
				name={name}
				frameWidth={size.w * scale}
				k={1}
				selected
				entered={false}
				paused={false}
				hovered={false}
			/>
			<div
				className="wc-imported-content"
				style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: "top left" }}
			>
				<CapturedContent target={target} incomplete={incomplete} cardIndex={cardIndex} />
			</div>
			<div className="wc-frame-outline">
				{["tl", "tr", "bl", "br"].map((corner) => (
					<i className={corner} key={corner} />
				))}
			</div>
			<span className="wc-frame-size type-detail">
				{size.w} × {size.h}
			</span>
		</div>
	);
}
