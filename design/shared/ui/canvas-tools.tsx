import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { CursorIcon, HandIcon, SelectIcon } from "./spool-icons";

/**
 * Shared substrate for the canvas-tools explorations (#54). The three Figma-shape
 * tools that replace the dead live/design mode pair — interact / select / hand —
 * plus a small live mock canvas so each toolbar variant can be judged in situ.
 *
 * No spool knowledge here: the hook is plain React, the canvas is a self-contained
 * mock. Each frame owns its own toolbar chrome and wires it to these pieces.
 *
 * The one behaviour every variant must show truthfully: selecting into a frame
 * freezes only that frame (a pause, not a reset — its live meter holds and resumes
 * from the same value), while every other frame keeps living. Holding Cmd in
 * interact borrows select for as long as it is held, with no tool switch.
 */

export type Tool = "interact" | "select" | "hand";

export interface ToolMeta {
	id: Tool;
	label: string;
	/** Keyboard hint shown in the chrome. interact is the default and has no letter. */
	key: string | null;
	Icon: (props: { className?: string }) => JSX.Element;
	hint: string;
}

export const TOOLS: ToolMeta[] = [
	{ id: "interact", label: "interact", key: null, Icon: CursorIcon, hint: "clicks reach the app" },
	{ id: "select", label: "select", key: "V", Icon: SelectIcon, hint: "pick an element" },
	{ id: "hand", label: "hand", key: "H", Icon: HandIcon, hint: "pan the canvas" },
];

export function toolMeta(id: Tool): ToolMeta {
	const m = TOOLS.find((t) => t.id === id);
	if (!m) throw new Error(`unknown tool ${id}`);
	return m;
}

export interface ToolState {
	/** The committed tool the human has chosen. */
	tool: Tool;
	setTool: (t: Tool) => void;
	/** What is active right now — the transient borrow wins while a modifier is held. */
	effectiveTool: Tool;
	/** The borrowed tool while a modifier is held, else null. Cmd -> select, space -> hand. */
	transient: Tool | null;
	metaHeld: boolean;
	spaceHeld: boolean;
}

/**
 * Tool selection + the transient modifier borrow. V/H commit a tool; Escape or I
 * returns to interact; holding Cmd borrows select and holding space borrows hand,
 * both only while held and without changing the committed tool.
 */
export function useToolState(): ToolState {
	const [tool, setTool] = useState<Tool>("interact");
	const [metaHeld, setMetaHeld] = useState(false);
	const [spaceHeld, setSpaceHeld] = useState(false);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "Meta") {
				setMetaHeld(true);
				return;
			}
			if (e.key === " " || e.code === "Space") {
				setSpaceHeld(true);
				e.preventDefault();
				return;
			}
			// Letter shortcuts never fire while Cmd is held (that is a browser combo).
			if (e.metaKey || e.ctrlKey) return;
			const k = e.key.toLowerCase();
			if (k === "v") setTool("select");
			else if (k === "h") setTool("hand");
			else if (k === "i") setTool("interact");
			else if (e.key === "Escape") setTool("interact");
		};
		const up = (e: KeyboardEvent) => {
			if (e.key === "Meta") setMetaHeld(false);
			if (e.key === " " || e.code === "Space") setSpaceHeld(false);
		};
		const clear = () => {
			setMetaHeld(false);
			setSpaceHeld(false);
		};
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		window.addEventListener("blur", clear);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
			window.removeEventListener("blur", clear);
		};
	}, []);

	const transient: Tool | null = metaHeld ? "select" : spaceHeld ? "hand" : null;
	const effectiveTool = transient ?? tool;
	return { tool, setTool, effectiveTool, transient, metaHeld, spaceHeld };
}

export function cursorClass(effectiveTool: Tool, spaceHeld: boolean): string {
	if (effectiveTool === "hand") return spaceHeld ? "cursor-grabbing" : "cursor-grab";
	if (effectiveTool === "select") return "cursor-crosshair";
	return "cursor-default";
}

/* --- the mock canvas: small live apps behind the toolbar --- */

interface FrameSpec {
	id: string;
	label: string;
	x: number;
	y: number;
	w: number;
}

const FRAMES: FrameSpec[] = [
	{ id: "session", label: "session", x: 132, y: 84, w: 244 },
	{ id: "home", label: "home", x: 470, y: 150, w: 214 },
	{ id: "command-palette", label: "command-palette", x: 236, y: 356, w: 244 },
];

// The living signal: a three-bar meter that advances one step per tick. Frozen
// frames hold their pattern; thaw resumes from the same step, never resetting.
const METER = [
	[7, 13, 9],
	[11, 8, 14],
	[9, 14, 7],
	[14, 10, 12],
	[8, 12, 15],
];

export function MockCanvas({ state, className }: { state: ToolState; className?: string }) {
	const { effectiveTool, spaceHeld } = state;
	const [selected, setSelected] = useState<string | null>(null);

	// Selecting into a frame freezes exactly that frame. Frozen === selected.
	const selectInto = (id: string) => setSelected((cur) => (cur === id ? cur : id));
	const clear = () => setSelected(null);

	return (
		<div
			className={cn("relative h-full w-full overflow-hidden bg-canvas", cursorClass(effectiveTool, spaceHeld), className)}
			onClick={clear}
		>
			{/* Faint dotted canvas grid — spool's engineering-paper backdrop. */}
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.4]"
				style={{
					backgroundImage: "radial-gradient(circle, var(--color-border-raised) 0.75px, transparent 0.75px)",
					backgroundSize: "22px 22px",
				}}
			/>
			{FRAMES.map((f) => (
				<MockFrame
					key={f.id}
					spec={f}
					effectiveTool={effectiveTool}
					selected={selected === f.id}
					frozen={selected === f.id}
					onSelectInto={() => selectInto(f.id)}
				/>
			))}
			<div className="pointer-events-none absolute bottom-3 left-4 font-mono text-2xs text-muted/50 leading-3">
				page · session
			</div>
		</div>
	);
}

function MockFrame({
	spec,
	effectiveTool,
	selected,
	frozen,
	onSelectInto,
}: {
	spec: FrameSpec;
	effectiveTool: Tool;
	selected: boolean;
	frozen: boolean;
	onSelectInto: () => void;
}) {
	const [count, setCount] = useState(spec.id === "home" ? 0 : 3);
	const [on, setOn] = useState(spec.id === "home");
	const [step, setStep] = useState(spec.id === "command-palette" ? 2 : 0);

	// The living meter advances while the frame is not frozen. Clearing the
	// interval on freeze holds `step`; re-mounting the interval on thaw resumes it.
	useEffect(() => {
		if (frozen) return;
		const t = setInterval(() => setStep((s) => (s + 1) % METER.length), 620);
		return () => clearInterval(t);
	}, [frozen]);

	const bars = METER[step];
	const live = !frozen;

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation(); // never let a frame click clear the selection
		if (effectiveTool === "select") {
			onSelectInto();
			return;
		}
		if (effectiveTool === "interact" && !frozen) {
			// Clicks reach the live app. The frame body bump is the app responding.
			setCount((c) => c + 1);
		}
		// hand: no-op (the canvas pans).
	};

	return (
		<motion.div
			className="absolute"
			style={{ left: spec.x, top: spec.y, width: spec.w }}
			whileTap={effectiveTool === "interact" && !frozen ? { scale: 0.992 } : undefined}
		>
			<div className="mb-1.5 flex h-4 items-center gap-1.5 font-mono text-sm leading-xs">
				<span className={cn("text-2xs", selected ? "text-thread" : "text-muted/70")}>▸</span>
				<span className={cn(selected ? "text-thread" : "text-muted")}>{spec.label}</span>
			</div>

			<div className="relative">
				<button
					type="button"
					onClick={handleClick}
					className={cn(
						"block w-full overflow-hidden rounded-md border bg-surface text-left transition-colors duration-150",
						selected ? "border-thread" : "border-border hover:border-border-raised",
						frozen && "saturate-[0.6]",
					)}
				>
					<div className="flex items-center justify-between border-border-raised/60 border-b px-3 py-2">
						<div className="flex items-center gap-1.5">
							<span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-thread" : "bg-muted/50")} />
							<span className="font-mono text-2xs text-muted leading-3">{live ? "live" : "paused"}</span>
						</div>
						<div className="flex items-end gap-[3px]" aria-hidden="true">
							{bars.map((h, i) => (
								<span
									key={i}
									className={cn("w-[3px] rounded-full transition-all duration-300", live ? "bg-thread/70" : "bg-muted/35")}
									style={{ height: h }}
								/>
							))}
						</div>
					</div>

					<div className="px-3 py-3">
						{spec.id === "home" ? (
							<div className="flex items-center justify-between">
								<span className="font-mono text-xs text-muted leading-xs">notifications</span>
								<Switch on={on} />
							</div>
						) : spec.id === "command-palette" ? (
							<div className="space-y-1.5">
								<div className="h-1.5 w-full rounded-full bg-raised">
									<div
										className={cn("h-full rounded-full transition-all duration-500", live ? "bg-thread/70" : "bg-muted/40")}
										style={{ width: `${28 + step * 16}%` }}
									/>
								</div>
								<div className="font-mono text-2xs text-muted/70 leading-3">indexing frames</div>
							</div>
						) : (
							<div className="flex items-center justify-between">
								<span className="font-mono text-lg text-text leading-none tabular-nums">{count}</span>
								<span className="font-mono text-2xs text-muted/70 leading-3">clicks reach here</span>
							</div>
						)}
					</div>
				</button>

				{/* select is element-level: freezing shows the picked element outlined inside the frame. */}
				{selected ? <SelectionCorners /> : null}
				{selected ? (
					<>
						<span className="pointer-events-none absolute inset-x-2 bottom-2 h-8 rounded-[3px] border border-thread/70 bg-thread/10" />
						<span className="pointer-events-none absolute bottom-[38px] left-2 rounded-[3px] bg-thread px-1 py-px font-mono text-[9px] text-on-thread leading-none">
							{spec.id === "home" ? "Switch" : spec.id === "command-palette" ? "Progress" : "button"}
						</span>
					</>
				) : null}
			</div>
		</motion.div>
	);
}

function Switch({ on }: { on: boolean }) {
	return (
		<span className={cn("flex h-4 w-7 items-center rounded-full px-[2px]", on ? "bg-thread/70" : "bg-raised")}>
			<span className={cn("h-3 w-3 rounded-full bg-text transition-transform", on ? "translate-x-3" : "translate-x-0")} />
		</span>
	);
}

function SelectionCorners() {
	return (
		<>
			{["-left-[5px] -top-[5px]", "-right-[5px] -top-[5px]", "-bottom-[5px] -left-[5px]", "-bottom-[5px] -right-[5px]"].map(
				(pos) => (
					<span
						key={pos}
						className={cn(
							"pointer-events-none absolute h-[7px] w-[7px] rounded-[1.5px] border-[1.5px] border-thread bg-on-thread",
							pos,
						)}
					/>
				),
			)}
		</>
	);
}
