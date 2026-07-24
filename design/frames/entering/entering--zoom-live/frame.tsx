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
 * entering — C. The camera is the mode. Nothing is entered and nothing is
 * armed: a frame is live when it is big enough to actually use, and a picture
 * when it is not. Zoom past 70% and whatever is under the cursor answers you.
 * Try it: drag the zoom rail, bottom right, across the tick.
 */

type Tool = "select" | "hand" | "annotate";

const TOOLS: readonly ToolSpec[] = [
	{ id: "select", label: "select", kbd: "V", Icon: SelectIcon },
	{ id: "hand", label: "hand", kbd: "H", Icon: HandIcon },
	{ id: "annotate", label: "annotate", kbd: "C", Icon: AnnotateIcon, accent: true },
];

const LIVE_AT = 0.7;
const MIN = 0.24;
const MAX = 1.35;

const FRAMES = ["cart", "settings"] as const;
type FrameName = (typeof FRAMES)[number];

export default function EnteringZoomLive() {
	const [tool, setTool] = useState<Tool>("select");
	const [zoom, setZoom] = useState(0.42);
	const [selected, setSelected] = useState<FrameName | null>(null);
	const [hover, setHover] = useState<FrameName | null>(null);

	const map = zoom < LIVE_AT;

	// crossing the tick is the whole event: announce it, briefly
	const wasMap = useRef(map);
	const [flash, setFlash] = useState<string | null>(null);
	useEffect(() => {
		if (wasMap.current === map) return;
		wasMap.current = map;
		setFlash(map ? "frames are pictures again" : "frames are live");
		const t = setTimeout(() => setFlash(null), 1600);
		return () => clearTimeout(t);
	}, [map]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey) return;
			const k = e.key.toLowerCase();
			if (k === "v") setTool("select");
			else if (k === "h") setTool("hand");
			else if (k === "c") setTool("annotate");
			else if (e.key === "Escape") setSelected(null);
			else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(MAX, z + 0.08));
			else if (e.key === "-") setZoom((z) => Math.max(MIN, z - 0.08));
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const ringOf = (name: FrameName): Ring =>
		selected === name && map ? "selected" : hover === name ? (map ? "hover" : "entered") : "none";

	const frameProps = (name: FrameName) => ({
		ring: ringOf(name),
		live: !map && hover === name,
		onPointerEnter: () => setHover(name),
		onPointerLeave: () => setHover((h) => (h === name ? null : h)),
		onPointerDown: (e: React.PointerEvent) => {
			e.stopPropagation();
			if (map) setSelected(name);
		},
		labelSlot:
			!map && hover === name ? (
				<span className="flex items-center gap-1 rounded-full border border-thread/40 bg-thread/10 px-1.5 py-px font-mono text-[9px] text-thread leading-none">
					live
				</span>
			) : null,
	});

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "opencode"]} showCanvasControls={false}>
			{/** biome-ignore lint/a11y/noStaticElementInteractions: the mock canvas is the surface under test */}
			<div
				onPointerDown={() => setSelected(null)}
				className="relative h-full w-full select-none overflow-hidden bg-canvas"
			>
				<DotGrid />

				<Law
					title="C · the camera"
					law="No tool and no gesture. A frame is live when it is big enough to use and a picture when it is not, so the zoom you already reach for is the switch."
					rows={[
						{ keys: ["+", "−"], does: "zoom the canvas" },
						{ keys: ["70%"], does: "frames go live" },
						{ keys: ["click"], does: "select, below the tick" },
						{ keys: ["V", "H"], does: "select · hand" },
					]}
				/>

				<div
					className="absolute inset-0 origin-center transition-transform duration-150 ease-out"
					style={{ transform: `scale(${zoom})` }}
				>
					<FrameBox name="cart" x={520} y={210} w={258} {...frameProps("cart")}>
						<MiniCart />
					</FrameBox>
					<FrameBox name="settings" x={900} y={300} w={236} {...frameProps("settings")}>
						<MiniSettings />
					</FrameBox>
				</div>

				{flash !== null ? (
					<div className="-translate-x-1/2 pointer-events-none absolute bottom-32 left-1/2 z-30">
						<span className="rounded-full border border-thread/40 bg-bg/95 px-3 py-1 font-mono text-2xs text-thread leading-3 backdrop-blur">
							{flash}
						</span>
					</div>
				) : null}

				<ZoomRail zoom={zoom} setZoom={setZoom} />

				<p className="pointer-events-none absolute right-8 bottom-32 max-w-[248px] text-right font-sans text-base text-muted leading-base">
					{map
						? "Too small to click anything on purpose. So it does not pretend: this is a map."
						: "Big enough to use. Point at a frame and it answers, with nothing to enter or leave."}
				</p>
			</div>

			<Toolbar
				tools={TOOLS}
				tool={map ? "map" : "live"}
				onTool={(id) => setTool(id as Tool)}
				caption={map ? `${tool} · below ${Math.round(LIVE_AT * 100)}% frames are pictures` : `${tool} · clicks reach the app`}
			/>
		</SpoolShell>
	);
}

function ZoomRail({ zoom, setZoom }: { zoom: number; setZoom: (z: number) => void }) {
	const railRef = useRef<HTMLDivElement>(null);
	const at = (clientX: number) => {
		const r = railRef.current?.getBoundingClientRect();
		if (r === undefined) return;
		setZoom(Math.min(MAX, Math.max(MIN, MIN + ((clientX - r.left) / r.width) * (MAX - MIN))));
	};
	const pct = (zoom - MIN) / (MAX - MIN);
	const tick = (LIVE_AT - MIN) / (MAX - MIN);
	return (
		<div className="absolute right-8 bottom-8 z-30 flex items-center gap-3 rounded-lg border border-border-raised bg-bg/90 px-3 py-2 backdrop-blur">
			{/** biome-ignore lint/a11y/noStaticElementInteractions: the rail is a drag surface, keys are on the canvas */}
			<div
				ref={railRef}
				onPointerDown={(e) => {
					e.stopPropagation();
					e.currentTarget.setPointerCapture(e.pointerId);
					at(e.clientX);
				}}
				onPointerMove={(e) => {
					if (e.buttons === 1) at(e.clientX);
				}}
				className="relative h-4 w-[168px] cursor-ew-resize"
			>
				<span className="-translate-y-1/2 absolute top-1/2 right-0 left-0 h-px bg-border-raised" />
				<span
					className="-translate-y-1/2 absolute top-1/2 left-0 h-px bg-thread/60"
					style={{ width: `${pct * 100}%` }}
				/>
				<span className="absolute top-0 bottom-0 w-px bg-muted/50" style={{ left: `${tick * 100}%` }} />
				<span
					className="-top-3.5 absolute font-mono text-[9px] text-muted/70 leading-none"
					style={{ left: `${tick * 100}%`, transform: "translateX(-50%)" }}
				>
					live
				</span>
				<span
					className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 h-2.5 w-2.5 rounded-full border-2 border-bg bg-thread"
					style={{ left: `${pct * 100}%` }}
				/>
			</div>
			<span className="w-9 text-right font-mono text-2xs text-muted leading-3 tabular-nums">
				{Math.round(zoom * 100)}%
			</span>
		</div>
	);
}
