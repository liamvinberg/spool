import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { EditIcon, FrameIcon } from "shared/ui/spool/icons";
import { SpoolMark } from "shared/ui/spool/mark";
import { type CaptureTarget, SourceWebsite, TARGET_LABEL, TARGET_SIZE, TARGETS } from "./source";
import "./prototype.css";
import "./toolbars.css";

export type ToolbarTake = "dock" | "strip" | "near" | "edge";
export type ToolbarState = "held" | "page" | "copied";
type Phase = "off" | "selecting" | "held" | "copying" | "copied";
interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}
interface ToolbarModel {
	phase: Phase;
	target: CaptureTarget;
	size: string;
	choose: () => void;
	page: () => void;
	parent: () => void;
	child: () => void;
	copy: () => void;
	close: () => void;
}

function Icon({ name }: { name: "copy" | "check" | "close" | "up" | "down" | "more" }) {
	return (
		<svg
			viewBox="0 0 16 16"
			width="16"
			height="16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{name === "copy" && (
				<>
					<rect x="5.5" y="5.5" width="7" height="8" rx="1.25" />
					<path d="M3.5 10.5h-1v-8h7v1" />
				</>
			)}
			{name === "check" && <path className="ct-check-path" pathLength="1" d="m3 8 3.25 3.25L13 4.5" />}
			{name === "close" && <path d="m4 4 8 8M12 4l-8 8" />}
			{name === "up" && <path d="m4 9.5 4-4 4 4" />}
			{name === "down" && <path d="m4 6.5 4 4 4-4" />}
			{name === "more" && (
				<>
					<circle cx="3" cy="8" r=".6" fill="currentColor" />
					<circle cx="8" cy="8" r=".6" fill="currentColor" />
					<circle cx="13" cy="8" r=".6" fill="currentColor" />
				</>
			)}
		</svg>
	);
}

function Tool({
	label,
	children,
	onClick,
	selected,
	disabled,
	className,
	shortcut,
	popup,
}: {
	label: string;
	children: ReactNode;
	onClick: () => void;
	selected?: boolean;
	disabled?: boolean;
	className?: string;
	shortcut?: string;
	popup?: boolean;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={selected}
			aria-haspopup={popup ? "menu" : undefined}
			aria-expanded={popup ? selected : undefined}
			disabled={disabled}
			className={cn("ct-tool", className)}
			onClick={onClick}
		>
			{children}
			<span className="ct-tooltip">
				{label}
				{shortcut && <kbd>{shortcut}</kbd>}
			</span>
		</button>
	);
}

function Scope({ model, labels = false }: { model: ToolbarModel; labels?: boolean }) {
	const page = model.target === "page";
	return (
		<div className={cn("ct-scope", labels && "ct-scope-labels")} data-page={page}>
			<span className="ct-scope-active" />
			<Tool label="Select an element" selected={!page} onClick={model.choose}>
				<EditIcon className="h-4 w-4" />
				{labels && <span>Element</span>}
			</Tool>
			<Tool label="Whole website page" selected={page} onClick={model.page}>
				<FrameIcon className="h-4 w-4" />
				{labels && <span>Page</span>}
			</Tool>
		</div>
	);
}

function Ladder({ model }: { model: ToolbarModel }) {
	return (
		<div className="ct-ladder">
			<Tool
				label="Select parent"
				shortcut="↑"
				onClick={model.parent}
				disabled={model.target === "page" || model.phase === "copying"}
			>
				<Icon name="up" />
			</Tool>
			<Tool
				label="Select child"
				shortcut="↓"
				onClick={model.child}
				disabled={model.target === "photo" || model.phase === "copying"}
			>
				<Icon name="down" />
			</Tool>
		</div>
	);
}

function Copy({ model, iconOnly = false }: { model: ToolbarModel; iconOnly?: boolean }) {
	return (
		<button
			type="button"
			className={cn("ct-copy", iconOnly && "ct-copy-icon")}
			data-status={model.phase}
			aria-label={model.phase === "copied" ? "Copy again" : "Copy selection"}
			onClick={model.copy}
			disabled={model.phase === "selecting" || model.phase === "copying"}
		>
			<span className="ct-copy-glyphs">
				<span className="ct-copy-original">
					<Icon name="copy" />
				</span>
				<span className="ct-copy-spinner" />
				<span className="ct-copy-done">
					<Icon name="check" />
				</span>
			</span>
			{!iconOnly && (
				<span className="ct-copy-words">
					<span className="ct-word-ready">Copy</span>
					<span className="ct-word-working">Copying</span>
					<span className="ct-word-done">Copied</span>
				</span>
			)}
			{iconOnly && model.phase === "held" && (
				<span className="ct-tooltip">
					Copy selection<kbd>⌘C</kbd>
				</span>
			)}
		</button>
	);
}

function Readout({ model }: { model: ToolbarModel }) {
	const text =
		model.phase === "selecting"
			? "Click to hold an element"
			: model.phase === "copying"
				? "Gathering images and styles"
				: model.phase === "copied"
					? model.target === "page"
						? "Paste in spool · film saved as an image"
						: "Paste in spool"
					: model.size;
	return (
		<span className="ct-readout" data-message={model.phase !== "held"} role="status" aria-live="polite" key={text}>
			{text}
		</span>
	);
}

function Dock({ model }: { model: ToolbarModel }) {
	return (
		<div className="ct-dock-anchor">
			<div className="ct-dock ct-surface" role="toolbar" aria-label="Copy toolbar">
				<SpoolMark className="ct-mark" />
				<span className="ct-divider" />
				<Scope model={model} />
				<span className="ct-divider" />
				<Ladder model={model} />
				<span className="ct-divider" />
				<Copy model={model} />
				<Tool label="Exit capture" shortcut="esc" className="ct-close" onClick={model.close}>
					<Icon name="close" />
				</Tool>
				{model.phase !== "held" && (
					<div className="ct-dock-readout">
						<Readout model={model} />
					</div>
				)}
			</div>
		</div>
	);
}

function Strip({ model }: { model: ToolbarModel }) {
	return (
		<div className="ct-strip ct-surface" role="toolbar" aria-label="Copy toolbar">
			<SpoolMark className="ct-mark" />
			<Scope model={model} labels />
			<span className="ct-divider" />
			<span className="ct-strip-name">{TARGET_LABEL[model.target]}</span>
			<Ladder model={model} />
			<div className="ct-strip-space" />
			<Readout model={model} />
			<Copy model={model} />
			<Tool label="Exit capture" shortcut="esc" className="ct-close" onClick={model.close}>
				<Icon name="close" />
			</Tool>
			{model.phase === "copying" && <span className="ct-strip-progress" />}
		</div>
	);
}

function Near({ model, box }: { model: ToolbarModel; box: Box }) {
	const [menu, setMenu] = useState(false);
	useEffect(() => {
		if (model.phase === "off" || model.phase === "copying") setMenu(false);
	}, [model.phase]);
	const left = Math.min(1120, Math.max(24, box.x + box.w - 296));
	const below = box.y + box.h + 76 + 14;
	const top = below < 932 ? below : Math.max(134, box.y + 76 - 64);
	return (
		<div className="ct-near-anchor" data-menu-down={top < 240} style={{ transform: `translate(${left}px, ${top}px)` }}>
			<div className="ct-near ct-surface" role="toolbar" aria-label="Copy toolbar">
				<div className="ct-menu-trigger">
					<Tool label="Capture options" selected={menu} popup onClick={() => setMenu(!menu)}>
						<SpoolMark className="ct-mark" />
						<Icon name="down" />
					</Tool>
					<div
						className="ct-scope-menu ct-surface"
						data-open={menu}
						inert={!menu}
						role="menu"
						aria-label="Capture options"
					>
						<button
							type="button"
							role="menuitem"
							onClick={() => {
								model.choose();
								setMenu(false);
							}}
						>
							<EditIcon className="h-4 w-4" />
							Select an element
						</button>
						<button
							type="button"
							role="menuitem"
							onClick={() => {
								model.page();
								setMenu(false);
							}}
						>
							<FrameIcon className="h-4 w-4" />
							Whole website page
						</button>
						<span />
						<button type="button" role="menuitem" onClick={model.close}>
							<Icon name="close" />
							Exit capture <kbd>esc</kbd>
						</button>
					</div>
				</div>
				<span className="ct-divider" />
				<Ladder model={model} />
				<Copy model={model} />
			</div>
			{model.phase !== "held" && (
				<div className="ct-near-readout">
					<Readout model={model} />
				</div>
			)}
		</div>
	);
}

function Edge({ model }: { model: ToolbarModel }) {
	return (
		<div className="ct-edge-anchor">
			<div className="ct-edge ct-surface" role="toolbar" aria-label="Copy toolbar" aria-orientation="vertical">
				<SpoolMark className="ct-mark" />
				<span className="ct-divider" />
				<Scope model={model} />
				<span className="ct-divider" />
				<Ladder model={model} />
				<span className="ct-divider" />
				<Copy model={model} iconOnly />
				<Tool label="Exit capture" shortcut="esc" className="ct-close" onClick={model.close}>
					<Icon name="close" />
				</Tool>
				{model.phase !== "held" && (
					<div className="ct-edge-readout">
						<Readout model={model} />
					</div>
				)}
			</div>
		</div>
	);
}

// A toolbar-only discussion after Liam chose copy and paste. No clipboard
// writes or destination selection. Each take is its own visible canvas row.
export function CaptureToolbar({ take, initial = "held" }: { take: ToolbarTake; initial?: ToolbarState }) {
	const [phase, setPhase] = useState<Phase>(initial === "page" ? "held" : initial);
	const [target, setTarget] = useState<CaptureTarget>(initial === "page" ? "page" : "card");
	const [cardIndex, setCardIndex] = useState(1);
	const [instant, setInstant] = useState(false);
	const [box, setBox] = useState<Box>({ x: 528, y: 368.5, w: 384, h: 424 });
	const [anchor, setAnchor] = useState<Box>(box);
	const [heldTick, setHeldTick] = useState(0);
	const source = useRef<HTMLDivElement>(null);
	const scroller = useRef<HTMLDivElement>(null);
	const active = phase !== "off";
	const size = TARGET_SIZE[target];
	const measure = () => {
		const node = source.current?.querySelector(
			target === "photo" || target === "card"
				? `[data-capture="${target}"][data-card-index="${cardIndex}"]`
				: `[data-capture="${target}"]`,
		);
		if (!node || !scroller.current) return;
		const rect = node.getBoundingClientRect();
		const viewport = scroller.current.getBoundingClientRect();
		const next = { x: rect.x - viewport.x, y: rect.y - viewport.y, w: rect.width, h: rect.height };
		setBox(next);
		if (phase !== "selecting") setAnchor(next);
	};
	useLayoutEffect(measure, [target, cardIndex, phase]);
	const hold = (next: CaptureTarget) => {
		setTarget(next);
		setPhase("held");
		setHeldTick((value) => value + 1);
	};
	const step = (amount: number) => {
		if (phase === "copying") return;
		const next = TARGETS[TARGETS.indexOf(target) + amount];
		if (next) hold(next);
	};
	const copy = () => {
		if (phase !== "held" && phase !== "copied") return;
		setPhase("copying");
	};
	const close = () => setPhase("off");
	useEffect(() => {
		if (phase !== "copying") return;
		const timer = setTimeout(() => setPhase("copied"), 900);
		return () => clearTimeout(timer);
	}, [phase]);
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (!active || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
			if (event.key === "Escape") {
				event.preventDefault();
				setInstant(true);
				close();
			}
			if (event.key === "ArrowUp" || event.key === "ArrowDown") {
				event.preventDefault();
				setInstant(true);
				step(event.key === "ArrowUp" ? 1 : -1);
			}
			if (
				((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") ||
				(event.key === "Enter" && !(event.target instanceof HTMLButtonElement))
			) {
				event.preventDefault();
				setInstant(true);
				copy();
			}
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	});
	const model: ToolbarModel = {
		phase,
		target,
		size: `${size.w} × ${size.h}`,
		choose: () => {
			setTarget("card");
			setPhase("selecting");
		},
		page: () => {
			hold("page");
			scroller.current?.scrollTo({ top: 0 });
		},
		parent: () => step(1),
		child: () => step(-1),
		copy,
		close,
	};
	return (
		<div
			className="ct-prototype"
			data-take={take}
			data-phase={phase}
			data-instant={instant}
			onPointerDownCapture={() => setInstant(false)}
			onKeyDownCapture={() => setInstant(true)}
		>
			<div className="ct-browser-stage">
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
							className={cn("wc-extension", active && "wc-extension-active")}
							onClick={() => {
								if (active) close();
								else setPhase("selecting");
							}}
						>
							<SpoolMark className="h-5 w-4" />
						</button>
						<span>⋮</span>
					</div>
				</div>
				<div className="ct-source" ref={scroller} onScroll={measure}>
					<div
						ref={source}
						onPointerMove={(event) => {
							if (phase !== "selecting" || !(event.target instanceof Element)) return;
							const part = event.target.closest("[data-capture]");
							const next = TARGETS.find((item) => item === part?.getAttribute("data-capture"));
							if (!next) return;
							setTarget(next);
							const card = part?.getAttribute("data-card-index");
							if (card !== null && card !== undefined) setCardIndex(Number(card));
						}}
						onClickCapture={(event) => {
							if (!active) return;
							event.preventDefault();
							event.stopPropagation();
							if (phase === "selecting") hold(target);
						}}
					>
						<SourceWebsite />
					</div>
				</div>
				<div className="ct-selection-window" data-visible={active}>
					<div
						className="ct-outline"
						data-held={phase !== "selecting"}
						data-copied={phase === "copied"}
						style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
					>
						<div className="ct-selection-label">
							{TARGET_LABEL[target]}
							<span>
								{size.w} × {size.h}
							</span>
						</div>
						{["tl", "tr", "bl", "br"].map((corner) => (
							<span className={cn("ct-corner", corner)} key={`${corner}-${heldTick}`} />
						))}
					</div>
				</div>
				<div className="ct-tools-layer" data-visible={active} inert={!active}>
					{take === "dock" && <Dock model={model} />}
					{take === "strip" && <Strip model={model} />}
					{take === "near" && <Near model={model} box={anchor} />}
					{take === "edge" && <Edge model={model} />}
				</div>
				{!active && <div className="ct-off-note">Press the spool extension to start again.</div>}
			</div>
			<footer className="ct-specimen-footer">
				<span>{take}</span>
				<span>copy-and-paste prototype</span>
				<div />
				<span className="ct-help">click to hold · ↑ parent · ↓ child · ⌘c copy · esc exits</span>
				<button
					type="button"
					onClick={() => {
						setTarget("card");
						setCardIndex(1);
						setPhase("selecting");
						scroller.current?.scrollTo({ top: 0 });
					}}
				>
					Select again
				</button>
				<button
					type="button"
					onClick={() => {
						setPhase("off");
						setTarget("card");
						setCardIndex(1);
						scroller.current?.scrollTo({ top: 0 });
					}}
				>
					Restart
				</button>
			</footer>
		</div>
	);
}
