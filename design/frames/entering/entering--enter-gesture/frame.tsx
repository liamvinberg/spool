import { useEffect, useRef, useState } from "react";
import { HandIcon, SelectIcon } from "../../../shared/ui/spool-icons";
import {
	AnnotateIcon,
	DotGrid,
	FrameBox,
	Kbd,
	Law,
	MiniCart,
	MiniSettings,
	type Ring,
	Toolbar,
	type ToolSpec,
} from "../../../shared/ui/entering-stage";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * entering — A. The gesture, not the mode. There is no interact tool: Select is
 * the default and the only pointer tool, and a frame becomes live by being
 * entered, exactly the way every nested object in software has always opened.
 * Click selects. Double-click (or ⏎) enters. Escape leaves, keeping it selected.
 * Try it: double-click the cart, then work the stepper.
 */

type Tool = "select" | "hand" | "annotate";

const TOOLS: readonly ToolSpec[] = [
	{ id: "select", label: "select", kbd: "V", Icon: SelectIcon },
	{ id: "hand", label: "hand", kbd: "H", Icon: HandIcon },
	{ id: "annotate", label: "annotate", kbd: "C", Icon: AnnotateIcon, accent: true },
];

const FRAMES = ["cart", "settings"] as const;
type FrameName = (typeof FRAMES)[number];

export default function EnteringEnterGesture() {
	const [tool, setTool] = useState<Tool>("select");
	const [selected, setSelected] = useState<FrameName | null>(null);
	const [entered, setEntered] = useState<FrameName | null>(null);
	const [hover, setHover] = useState<FrameName | null>(null);
	const enteredRef = useRef(entered);
	enteredRef.current = entered;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey) return;
			if (e.key === "Escape") {
				// leaving keeps the frame selected: the pointer comes back to you,
				// the thing you were looking at stays the thing you point at
				if (enteredRef.current !== null) {
					setSelected(enteredRef.current);
					setEntered(null);
				} else setSelected(null);
				return;
			}
			if (enteredRef.current !== null) return; // an entered frame owns the keyboard
			const k = e.key.toLowerCase();
			if (k === "v") setTool("select");
			else if (k === "h") setTool("hand");
			else if (k === "c") setTool("annotate");
			else if (e.key === "Enter") {
				setSelected((s) => {
					if (s !== null) setEntered(s);
					return null;
				});
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const ringOf = (name: FrameName): Ring =>
		entered === name ? "entered" : selected === name ? "selected" : hover === name && entered === null ? "hover" : "none";

	const frameProps = (name: FrameName) => ({
		ring: ringOf(name),
		live: entered === name,
		dim: entered !== null && entered !== name,
		onPointerEnter: () => setHover(name),
		onPointerLeave: () => setHover((h) => (h === name ? null : h)),
		onPointerDown: (e: React.PointerEvent) => {
			e.stopPropagation();
			if (entered === name) return; // the pointer is the frame's now
			setEntered(null);
			setSelected(name);
		},
		onDoubleClick: (e: React.MouseEvent) => {
			e.stopPropagation();
			setSelected(null);
			setEntered(name);
			setHover(null);
		},
		labelSlot:
			entered === name ? (
				<LivePill />
			) : hover === name && entered === null ? (
				<span className="flex items-center gap-1 font-mono text-2xs text-muted/70 leading-3">
					<Kbd>⏎</Kbd> enter
				</span>
			) : null,
	});

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "opencode"]} showCanvasControls={false}>
			{/** biome-ignore lint/a11y/noStaticElementInteractions: the mock canvas is the surface under test */}
			<div
				onPointerDown={() => {
					setEntered(null);
					setSelected(null);
				}}
				className="relative h-full w-full select-none overflow-hidden bg-canvas"
			>
				<DotGrid />

				<Law
					title="A · the gesture"
					law="Select is the default and the only pointer tool. A frame becomes live by being entered, the way every nested object in software opens."
					rows={[
						{ keys: ["click"], does: "select the frame" },
						{ keys: ["dbl"], does: "enter it, live" },
						{ keys: ["esc"], does: "leave, still selected" },
						{ keys: ["V", "H"], does: "select · hand" },
					]}
				/>

				<FrameBox name="cart" x={470} y={250} w={258} {...frameProps("cart")}>
					<MiniCart />
				</FrameBox>
				<FrameBox name="settings" x={840} y={318} w={236} {...frameProps("settings")}>
					<MiniSettings />
				</FrameBox>

				<Note>
					{entered !== null
						? "The frame owns the pointer and the keyboard. Escape hands both back."
						: selected !== null
							? "Selected. Double-click or press ⏎ to go live inside it."
							: "Double-click a frame to enter it."}
				</Note>
			</div>

			<Toolbar
				tools={TOOLS}
				tool={entered !== null ? "entered" : tool}
				onTool={(id) => {
					setEntered(null);
					setTool(id as Tool);
				}}
				caption={
					entered !== null
						? `inside ${entered} · esc to leave`
						: tool === "select"
							? "click selects · double-click enters"
							: tool === "hand"
								? "pan the canvas"
								: "click an element, a frame, or a spot"
				}
			/>
		</SpoolShell>
	);
}

function LivePill() {
	return (
		<span className="flex items-center gap-1.5 rounded-full border border-thread/40 bg-thread/10 px-1.5 py-px font-mono text-[9px] text-thread leading-none">
			live
			<span className="text-thread/60">esc</span>
		</span>
	);
}

function Note({ children }: { children: React.ReactNode }) {
	return (
		<p className="pointer-events-none absolute right-8 bottom-28 max-w-[260px] text-right font-sans text-base text-muted leading-base">
			{children}
		</p>
	);
}
