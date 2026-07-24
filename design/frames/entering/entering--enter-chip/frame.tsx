import { useEffect, useRef, useState } from "react";
import { HandIcon, PlayIcon, SelectIcon } from "../../../shared/ui/spool-icons";
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
 * entering — B. The affordance, not the gesture. No interact tool and no
 * hidden chord: hovering a frame reveals a ▶ on its own label row, and that is
 * the whole story. Double-click stays where Figma left it, descending into the
 * element under the cursor, so nothing collides. Try it: hover the cart, press ▶.
 */

type Tool = "select" | "hand" | "annotate";

const TOOLS: readonly ToolSpec[] = [
	{ id: "select", label: "select", kbd: "V", Icon: SelectIcon },
	{ id: "hand", label: "hand", kbd: "H", Icon: HandIcon },
	{ id: "annotate", label: "annotate", kbd: "C", Icon: AnnotateIcon, accent: true },
];

const FRAMES = ["cart", "settings"] as const;
type FrameName = (typeof FRAMES)[number];

export default function EnteringEnterChip() {
	const [tool, setTool] = useState<Tool>("select");
	const [selected, setSelected] = useState<FrameName | null>(null);
	const [entered, setEntered] = useState<FrameName | null>(null);
	const [hover, setHover] = useState<FrameName | null>(null);
	const [picked, setPicked] = useState<string | null>(null);
	const enteredRef = useRef(entered);
	enteredRef.current = entered;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey) return;
			if (e.key === "Escape") {
				if (enteredRef.current !== null) {
					setSelected(enteredRef.current);
					setEntered(null);
				} else {
					setPicked(null);
					setSelected(null);
				}
				return;
			}
			if (enteredRef.current !== null) return;
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

	const enter = (name: FrameName) => {
		setEntered(name);
		setSelected(null);
		setPicked(null);
		setHover(null);
	};

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
			if (entered === name) return;
			setEntered(null);
			setPicked(null);
			setSelected(name);
		},
		// double-click is not spent on entering here: it keeps descending into
		// the element under the cursor, the way Select already does today
		onDoubleClick: (e: React.MouseEvent) => {
			e.stopPropagation();
			if (entered !== null) return;
			const el = (e.target as HTMLElement).closest("[data-el]")?.getAttribute("data-el");
			setPicked(el ?? `${name} · root`);
			setSelected(name);
		},
		labelSlot:
			entered === name ? (
				<button
					type="button"
					onClick={() => {
						setSelected(name);
						setEntered(null);
					}}
					className="flex items-center gap-1.5 rounded-full border border-thread/40 bg-thread/10 px-1.5 py-px font-mono text-[9px] text-thread leading-none transition-colors hover:bg-thread/20"
				>
					live
					<span className="text-thread/60">esc</span>
				</button>
			) : hover === name && entered === null ? (
				<button
					type="button"
					aria-label={`enter ${name}`}
					onPointerDown={(e) => {
						e.stopPropagation();
						enter(name);
					}}
					className="flex h-4 items-center gap-1 rounded-[3px] border border-border-raised bg-raised pr-1.5 pl-1 font-mono text-[9px] text-muted leading-none transition-colors hover:border-thread/50 hover:text-thread"
				>
					<PlayIcon className="h-2 w-2" />
					enter
				</button>
			) : null,
	});

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "opencode"]} showCanvasControls={false}>
			{/** biome-ignore lint/a11y/noStaticElementInteractions: the mock canvas is the surface under test */}
			<div
				onPointerDown={() => {
					setEntered(null);
					setSelected(null);
					setPicked(null);
				}}
				className="relative h-full w-full select-none overflow-hidden bg-canvas"
			>
				<DotGrid />

				<Law
					title="B · the affordance"
					law="Nothing is armed and nothing is hidden. Hover a frame and its own label row offers ▶. Double-click stays free, still descending into elements."
					rows={[
						{ keys: ["▶"], does: "enter it, live" },
						{ keys: ["⏎"], does: "enter the selection" },
						{ keys: ["dbl"], does: "descend to element" },
						{ keys: ["esc"], does: "leave, still selected" },
					]}
				/>

				<FrameBox name="cart" x={470} y={250} w={258} {...frameProps("cart")}>
					<MiniCart />
				</FrameBox>
				<FrameBox name="settings" x={840} y={318} w={236} {...frameProps("settings")}>
					<MiniSettings />
				</FrameBox>

				{picked !== null && entered === null ? (
					<div className="pointer-events-none absolute right-8 bottom-40 flex items-center gap-2">
						<span className="rounded-[3px] bg-thread px-1 py-px font-mono text-[9px] text-on-thread leading-none">
							{picked}
						</span>
						<span className="font-mono text-2xs text-muted/60 leading-3">served to the agent</span>
					</div>
				) : null}

				<Note>
					{entered !== null
						? "The frame owns the pointer and the keyboard. Escape hands both back."
						: "Hover a frame. The ▶ on its label row is the only way in, and it is always visible when it applies."}
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
							? "click selects · ▶ enters"
							: tool === "hand"
								? "pan the canvas"
								: "click an element, a frame, or a spot"
				}
			/>
		</SpoolShell>
	);
}

function Note({ children }: { children: React.ReactNode }) {
	return (
		<p className="pointer-events-none absolute right-8 bottom-28 max-w-[268px] text-right font-sans text-base text-muted leading-base">
			{children}
		</p>
	);
}
