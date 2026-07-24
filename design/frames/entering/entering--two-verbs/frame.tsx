import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { BackIcon, HandIcon, PlayIcon, RestartIcon, SelectIcon } from "../../../shared/ui/spool-icons";
import { AnnotateIcon, DotGrid, Kbd, Law, Toolbar, type ToolSpec } from "../../../shared/ui/entering-stage";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * entering — the fork. Using a frame was always two wishes under one word.
 * Poke it, keeping the field around it: that is entering, and walks move you
 * across the canvas. Use it properly, with nothing else on screen: that is
 * playing. So the selection carries a ▶ and double-click still goes inside.
 * Try both: double-click the cart, escape, then press ▶ under it.
 */

type Mode = "select" | "hand" | "annotate";

const TOOLS: readonly ToolSpec[] = [
	{ id: "select", label: "select", kbd: "V", Icon: SelectIcon },
	{ id: "hand", label: "hand", kbd: "H", Icon: HandIcon },
	{ id: "annotate", label: "annotate", kbd: "C", Icon: AnnotateIcon, accent: true },
];

const SCREENS = {
	cart: { x: 430, y: 176, w: 300, h: 500, label: "cart" },
	settings: { x: 830, y: 236, w: 300, h: 380, label: "settings" },
} as const;
type FrameName = keyof typeof SCREENS;

export default function EnteringTwoVerbs() {
	const [mode, setMode] = useState<Mode>("select");
	const [selected, setSelected] = useState<FrameName | null>("cart");
	const [entered, setEntered] = useState<FrameName | null>(null);
	const [played, setPlayed] = useState<FrameName | null>(null);
	const state = useRef({ selected, entered, played });
	state.current = { selected, entered, played };

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey) return;
			const s = state.current;
			if (e.key === "Escape") {
				if (s.played !== null) {
					setPlayed(null);
					setSelected(s.played);
				} else if (s.entered !== null) {
					setSelected(s.entered);
					setEntered(null);
				} else setSelected(null);
				return;
			}
			if (s.played !== null || s.entered !== null) return;
			if (e.key === "Enter" && s.selected !== null) {
				// ⇧⏎ plays it, bare ⏎ goes inside: the heavier verb takes the modifier
				if (e.shiftKey) setPlayed(s.selected);
				else setEntered(s.selected);
				return;
			}
			const k = e.key.toLowerCase();
			if (k === "v") setMode("select");
			else if (k === "h") setMode("hand");
			else if (k === "c") setMode("annotate");
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "opencode"]} showCanvasControls={false}>
			{/** biome-ignore lint/a11y/noStaticElementInteractions: the mock canvas is the surface under test */}
			<div
				onPointerDown={() => {
					if (played !== null) return;
					setEntered(null);
					setSelected(null);
				}}
				className="relative h-full w-full select-none overflow-hidden bg-canvas"
			>
				<DotGrid />

				<Law
					title="the fork"
					law="Using a frame is two wishes. Poke it and keep the field around it, or use it properly with nothing else on screen. One is a gesture, the other is a verb."
					rows={[
						{ keys: ["dbl"], does: "inside, in place" },
						{ keys: ["▶"], does: "play it, full bleed" },
						{ keys: ["⇧", "⏎"], does: "play the selection" },
						{ keys: ["esc"], does: "back out either way" },
					]}
				/>

				{/* the canvas stays visible behind a played frame, and goes quiet */}
				<motion.div className="absolute inset-0" animate={{ opacity: played === null ? 1 : 0 }}>
					{(Object.keys(SCREENS) as FrameName[]).map((name) => {
						const box = SCREENS[name];
						const isEntered = entered === name;
						const isSelected = selected === name && entered === null;
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: the mock frame is the surface under test
							<div
								key={name}
								className="absolute transition-opacity duration-200"
								style={{
									left: box.x,
									top: box.y,
									width: box.w,
									opacity: entered !== null && !isEntered ? 0.45 : 1,
								}}
								onPointerDown={(e) => {
									e.stopPropagation();
									if (isEntered) return;
									setEntered(null);
									setSelected(name);
								}}
								onDoubleClick={(e) => {
									e.stopPropagation();
									setSelected(null);
									setEntered(name);
								}}
							>
								<div className="mb-1.5 flex h-4 items-center justify-between">
									<span
										className={cn(
											"font-mono text-sm leading-xs",
											isEntered ? "text-thread" : isSelected ? "text-text" : "text-muted",
										)}
									>
										{name}
									</span>
									{isEntered ? (
										<span className="flex items-center gap-1.5 rounded-full border border-thread/40 bg-thread/10 px-1.5 py-px font-mono text-[9px] text-thread leading-none">
											live<span className="text-thread/60">esc</span>
										</span>
									) : null}
								</div>

								<div className="relative" style={{ height: box.h }}>
									<div
										className={cn(
											"h-full overflow-hidden rounded-md border bg-surface",
											isEntered ? "border-thread" : isSelected ? "border-text/60" : "border-border",
										)}
										style={{ pointerEvents: isEntered ? "auto" : "none" }}
									>
										<Screen name={name} live={isEntered} />
									</div>
									{isSelected ? <Handles /> : null}
									{isEntered ? (
										<span className="pointer-events-none absolute -inset-[3px] rounded-[10px] border border-thread/35" />
									) : null}
								</div>

								{/* the selection's own row: what it is, and the verb it can take */}
								{isSelected ? (
									<div className="-bottom-9 -translate-x-1/2 absolute left-1/2 flex items-center gap-1">
										<span className="flex h-5 items-center rounded-[4px] bg-thread px-1.5 font-mono text-[10px] text-on-thread leading-none tabular-nums">
											{box.w} × {box.h}
										</span>
										<button
											type="button"
											aria-label={`play ${name}`}
											onPointerDown={(e) => {
												e.stopPropagation();
												setPlayed(name);
											}}
											className="flex h-5 items-center gap-1 rounded-[4px] border border-border-raised bg-raised px-1.5 font-mono text-[10px] text-muted leading-none transition-colors hover:border-thread/60 hover:text-thread"
										>
											<PlayIcon className="h-2 w-2" />
											play
										</button>
									</div>
								) : null}
							</div>
						);
					})}
				</motion.div>

				<AnimatePresence>
					{played !== null ? <Player name={played} onExit={() => (setPlayed(null), setSelected(played))} /> : null}
				</AnimatePresence>

				{played === null ? (
					<p className="pointer-events-none absolute right-8 bottom-28 max-w-[272px] text-right font-sans text-base text-muted leading-base">
						{entered !== null
							? "Inside, with the field still around it. This is where a walk moves you frame to frame across the canvas."
							: selected !== null
								? "Double-click to go inside and keep the canvas. Press ▶ to use it with nothing else on screen."
								: "Click a frame to take it."}
					</p>
				) : null}
			</div>

			{played === null ? (
				<Toolbar
					tools={TOOLS}
					tool={entered !== null ? "inside" : mode}
					onTool={(id) => {
						setEntered(null);
						setMode(id as Mode);
					}}
					caption={
						entered !== null
							? `inside ${entered} · the canvas is still there`
							: mode === "select"
								? "dbl goes inside · ▶ plays it"
								: mode === "hand"
									? "pan the canvas"
									: "click an element, a frame, or a spot"
					}
				/>
			) : null}
		</SpoolShell>
	);
}

/** The played frame: the canvas is gone, and only the prototype is left. */
function Player({ name, onExit }: { name: FrameName; onExit: () => void }) {
	const box = SCREENS[name];
	return (
		<motion.div
			className="absolute inset-0 z-40 flex flex-col bg-bg"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.18 }}
		>
			<div className="flex flex-1 items-center justify-center overflow-hidden p-8">
				<motion.div
					className="overflow-hidden rounded-md border border-border bg-surface"
					initial={{ width: box.w, height: box.h, opacity: 0.6 }}
					animate={{ width: 380, height: 620, opacity: 1 }}
					transition={{ type: "spring", stiffness: 260, damping: 30 }}
				>
					<Screen name={name} live />
				</motion.div>
			</div>
			<div className="flex h-14 shrink-0 items-center justify-between border-border border-t px-4">
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={onExit}
						aria-label="back to canvas"
						className="flex h-7 items-center gap-1.5 rounded-md border border-border-raised px-2 font-mono text-2xs text-muted leading-3 transition-colors hover:text-text"
					>
						<BackIcon className="h-3 w-3" />
						canvas
						<Kbd>esc</Kbd>
					</button>
					<button
						type="button"
						aria-label="restart"
						className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:text-text"
					>
						<RestartIcon className="h-3.5 w-3.5" />
					</button>
				</div>
				<span className="font-mono text-2xs text-muted/60 leading-3">
					{name} · session live · no canvas, no chrome in the way
				</span>
			</div>
		</motion.div>
	);
}

function Handles() {
	return (
		<>
			{(
				[
					{ k: "nw", s: { left: -3, top: -3 } },
					{ k: "ne", s: { right: -3, top: -3 } },
					{ k: "sw", s: { left: -3, bottom: -3 } },
					{ k: "se", s: { right: -3, bottom: -3 } },
				] as const
			).map((c) => (
				<span
					key={c.k}
					className="pointer-events-none absolute h-1.5 w-1.5 rounded-[1px] border border-text bg-bg"
					style={c.s}
				/>
			))}
		</>
	);
}

/* ---------- the same screen, on the canvas and full bleed ---------- */

function Screen({ name, live }: { name: FrameName; live: boolean }) {
	return name === "cart" ? <CartScreen live={live} /> : <SettingsScreen live={live} />;
}

function CartScreen({ live }: { live: boolean }) {
	const [qty, setQty] = useState(1);
	const [paid, setPaid] = useState(false);
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-border-raised/60 border-b px-4 py-3">
				<span className="font-sans font-medium text-md text-text leading-none">Din beställning</span>
				<span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-thread" : "bg-muted/40")} />
			</div>
			<div className="flex flex-1 flex-col gap-1 px-4 py-3">
				<Row label="Bryggkaffe" trailing={`${qty * 30} kr`} />
				<div className="flex items-center gap-1.5 pb-2">
					<Bump label="−" onClick={() => setQty((q) => Math.max(1, q - 1))} />
					<span className="w-4 text-center font-mono text-sm text-text leading-none tabular-nums">{qty}</span>
					<Bump label="+" onClick={() => setQty((q) => Math.min(9, q + 1))} />
				</div>
				<Row label="Havremjölk" trailing="5 kr" />
				<Row label="Kanelbulle" trailing="35 kr" />
				<div className="mt-auto border-border-raised/60 border-t pt-3">
					<Row label="Summa" trailing={`${qty * 30 + 40} kr`} strong />
					<button
						type="button"
						onClick={() => {
							setPaid(true);
							setTimeout(() => setPaid(false), 1400);
						}}
						className={cn(
							"mt-3 flex h-10 w-full items-center justify-center rounded-sm font-sans font-medium text-base leading-none transition-colors",
							paid ? "bg-raised text-muted" : "bg-thread text-on-thread",
						)}
					>
						{paid ? "Betald ✓" : "Till kassan"}
					</button>
				</div>
			</div>
		</div>
	);
}

function SettingsScreen({ live }: { live: boolean }) {
	const [notify, setNotify] = useState(true);
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-border-raised/60 border-b px-4 py-3">
				<span className="font-sans font-medium text-md text-text leading-none">Inställningar</span>
				<span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-thread" : "bg-muted/40")} />
			</div>
			<div className="flex flex-col gap-1 px-4 py-3">
				<div className="flex h-10 items-center justify-between">
					<span className="font-sans text-base text-text leading-none">Notiser</span>
					<button
						type="button"
						onClick={() => setNotify((n) => !n)}
						aria-pressed={notify}
						className={cn(
							"flex h-4 w-7 items-center rounded-full px-[2px] transition-colors",
							notify ? "bg-thread/70" : "bg-raised",
						)}
					>
						<span className={cn("h-3 w-3 rounded-full bg-text transition-transform", notify && "translate-x-3")} />
					</button>
				</div>
				<Row label="Språk" trailing="Svenska" />
				<Row label="Betalsätt" trailing="Swish" />
			</div>
		</div>
	);
}

function Row({ label, trailing, strong }: { label: string; trailing: string; strong?: boolean }) {
	return (
		<div className="flex h-8 items-center justify-between">
			<span className={cn("font-sans leading-none", strong ? "text-base text-text" : "text-base text-muted")}>
				{label}
			</span>
			<span
				className={cn(
					"font-mono leading-none tabular-nums",
					strong ? "text-base text-text" : "text-sm text-muted",
				)}
			>
				{trailing}
			</span>
		</div>
	);
}

function Bump({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-raised font-mono text-sm text-muted leading-none transition-colors hover:text-text"
		>
			{label}
		</button>
	);
}
