import { useEffect, useRef, useState } from "react";
import { HandIcon, SelectIcon } from "../../../shared/ui/spool-icons";
import {
	AnnotateIcon,
	DotGrid,
	FrameBox,
	Law,
	MiniCart,
	MiniSettings,
	type Ring,
	Toolbar,
	type ToolSpec,
} from "../../../shared/ui/entering-stage";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * entering — D. The inversion. The canvas is a browser: every frame is live
 * from the first paint, and there is nothing to enter because you were never
 * outside. The canvas verbs are the ones behind a key. Hold ⌘ and the field
 * freezes into something you can select and drag; let go and it runs again.
 */

type Tool = "select" | "hand" | "annotate";

const TOOLS: readonly ToolSpec[] = [
	{ id: "select", label: "select", kbd: "⌘", Icon: SelectIcon },
	{ id: "hand", label: "hand", kbd: "space", Icon: HandIcon },
	{ id: "annotate", label: "annotate", kbd: "C", Icon: AnnotateIcon, accent: true },
];

const FRAMES = ["cart", "settings"] as const;
type FrameName = (typeof FRAMES)[number];

interface Placed {
	x: number;
	y: number;
}

export default function EnteringAlwaysLive() {
	const [tool, setTool] = useState<Tool>("select");
	const [held, setHeld] = useState(false);
	const [latched, setLatched] = useState(false);
	const [selected, setSelected] = useState<FrameName | null>(null);
	const [hover, setHover] = useState<FrameName | null>(null);
	const [at, setAt] = useState<Record<FrameName, Placed>>({
		cart: { x: 470, y: 250 },
		settings: { x: 840, y: 318 },
	});
	const drag = useRef<{ name: FrameName; dx: number; dy: number } | null>(null);

	const arranging = held || latched;

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "Meta" || e.key === "Control") setHeld(true);
			if (e.key === "Escape") {
				setLatched(false);
				setSelected(null);
			}
			if (!e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "c") setTool("annotate");
		};
		const up = (e: KeyboardEvent) => {
			if (e.key === "Meta" || e.key === "Control") setHeld(false);
		};
		// a chord that steals focus can swallow the keyup: never stay stuck held
		const clear = () => setHeld(false);
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		window.addEventListener("blur", clear);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
			window.removeEventListener("blur", clear);
		};
	}, []);

	const ringOf = (name: FrameName): Ring =>
		!arranging ? "none" : selected === name ? "selected" : hover === name ? "hover" : "none";

	const frameProps = (name: FrameName) => ({
		ring: ringOf(name),
		live: !arranging,
		onPointerEnter: () => setHover(name),
		onPointerLeave: () => setHover((h) => (h === name ? null : h)),
		onPointerDown: (e: React.PointerEvent) => {
			if (!arranging) return;
			e.stopPropagation();
			setSelected(name);
			const p = at[name];
			drag.current = { name, dx: e.clientX - p.x, dy: e.clientY - p.y };
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		},
		// no per-frame live badge: when everything runs, marking it is noise
		labelSlot: null,
	});

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "opencode"]} showCanvasControls={false}>
			{/** biome-ignore lint/a11y/noStaticElementInteractions: the mock canvas is the surface under test */}
			<div
				onPointerDown={() => {
					if (arranging) setSelected(null);
				}}
				onPointerMove={(e) => {
					const d = drag.current;
					if (d === null || !arranging) return;
					setAt((cur) => ({ ...cur, [d.name]: { x: e.clientX - d.dx, y: e.clientY - d.dy } }));
				}}
				onPointerUp={() => {
					drag.current = null;
				}}
				className="relative h-full w-full select-none overflow-hidden bg-canvas"
			>
				<DotGrid />

				<Law
					title="D · the inversion"
					law="The canvas is a browser. Every frame runs from the first paint, so there is nothing to enter. The canvas verbs are the ones you reach for."
					rows={[
						{ keys: ["⌘"], does: "hold: freeze and arrange" },
						{ keys: ["V"], does: "click: latch it on" },
						{ keys: ["esc"], does: "back to live" },
						{ keys: ["space"], does: "pan the canvas" },
					]}
				/>

				{/* the wash: holding the key visibly takes the field away from the apps */}
				<div
					className="pointer-events-none absolute inset-0 z-10 bg-bg transition-opacity duration-150"
					style={{ opacity: arranging ? 0.28 : 0 }}
				/>

				<div className="absolute inset-0 z-20">
					<FrameBox name="cart" x={at.cart.x} y={at.cart.y} w={258} {...frameProps("cart")}>
						<MiniCart />
					</FrameBox>
					<FrameBox name="settings" x={at.settings.x} y={at.settings.y} w={236} {...frameProps("settings")}>
						<MiniSettings />
					</FrameBox>
				</div>

				<p className="pointer-events-none absolute right-8 bottom-28 z-30 max-w-[268px] text-right font-sans text-base text-muted leading-base">
					{arranging
						? "The apps are frozen and the canvas is yours. Drag a frame. Let go of ⌘ and they run again."
						: "Everything already works. Click the stepper, flip the toggle. To move a frame instead, hold ⌘."}
				</p>
			</div>

			<Toolbar
				tools={TOOLS}
				tool={arranging ? "arrange" : "live"}
				onTool={(id) => {
					setTool(id as Tool);
					setLatched(true);
				}}
				caption={arranging ? `${tool} · release ⌘ to go live` : "clicks reach the app · hold ⌘ for the canvas"}
			/>
		</SpoolShell>
	);
}
