import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { hotkeyChips, hotkeyEntry } from "../hotkeys";
import { SearchIcon } from "../icons";
import { Kbd } from "../primitives/display";

/**
 * The frame finder's door, at the end of the page path (finder-wake, task 443):
 * a quiet magnifier and the finder's chord, inside the path so it rides the
 * path's own `--wake` (the pointer near the top edge, ⌘ held, a key that just
 * moved you) and is not there at all at rest. Pointed at, "Find a frame" opens
 * out between the two. It stands after the faces of who's here, so nothing on
 * the row moves as it comes up. While the finder is open its magnifier is the
 * finder's, and the door stands down.
 */

/** the faces the finder answers to, from the register: the door wears the chord, the finder's foot both */
export function findKeys(): readonly string[] {
	return hotkeyChips(hotkeyEntry("canvas.find")).keys;
}

/** where the door stands in `view` with the path fully awake, in the view's pixels: the finder's field starts there */
export function doorSpot(view: HTMLElement): { x: number; y: number; w: number; h: number } | null {
	const slot = view.querySelector<HTMLElement>("[data-find-slot]");
	const door = slot?.querySelector<HTMLElement>("[data-find-door]");
	const path = slot?.closest<HTMLElement>("[data-page-path]");
	if (
		slot === null ||
		slot === undefined ||
		door === null ||
		door === undefined ||
		path === null ||
		path === undefined
	)
		return null;
	// layout, not the box on screen: at rest the slot is folded to nothing and the door slid back over the last name,
	// and the names glide on transforms as the path changes, but where they settle is where the field goes
	let x = 0;
	let y = 0;
	for (
		let at: HTMLElement | null = slot;
		at !== null && at !== path;
		at = (at.offsetParent as HTMLElement | null | undefined) ?? null
	) {
		x += at.offsetLeft;
		y += at.offsetTop;
	}
	const p = path.getBoundingClientRect();
	const v = view.getBoundingClientRect();
	return {
		x: Math.round(p.left - v.left + x + SLOT_PAD),
		y: Math.round(p.top - v.top + y + door.offsetTop),
		w: door.offsetWidth,
		h: door.offsetHeight,
	};
}

/** the room the slot leaves before the door, its `pl-1.5` */
const SLOT_PAD = 6;

export function FindDoor({ hidden = false, onOpen }: { hidden?: boolean; onOpen: () => void }) {
	// its footprint rides the wake too, so at rest the path ends at what stands before it
	const door = useRef<HTMLButtonElement>(null);
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		const element = door.current;
		if (element === null) return;
		const read = () => setWidth(element.offsetWidth);
		read();
		const observer = new ResizeObserver(read);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return (
		<span
			data-find-slot=""
			className="flex shrink-0 justify-end overflow-hidden pl-1.5 has-focus-visible:w-(--door)"
			style={
				{
					"--door": `${width + SLOT_PAD}px`,
					width: `calc(var(--wake, 1) * ${width + SLOT_PAD}px)`,
				} as CSSProperties
			}
		>
			<button
				ref={door}
				type="button"
				data-find-door=""
				onClick={onOpen}
				aria-label="Find a frame"
				tabIndex={hidden ? -1 : 0}
				className="group/door flex h-control-sm shrink-0 items-center gap-1.5 rounded-xs px-1.5 transition-colors duration-fast ease-out hover:bg-state-hover focus-visible:opacity-100!"
				style={{
					opacity: hidden ? 0 : "var(--wake)",
					transform: hidden ? "none" : "translateX(calc((1 - var(--wake)) * -6px))",
				}}
			>
				<SearchIcon className="shrink-0 text-tertiary transition-colors duration-fast ease-out group-hover/door:text-secondary" />
				<span className="grid grid-cols-[0fr] transition-[grid-template-columns] duration-base ease-out group-hover/door:grid-cols-[1fr]">
					<span className="min-w-0 overflow-hidden whitespace-nowrap text-secondary type-label">Find a frame</span>
				</span>
				<Kbd>{findKeys().at(-1)}</Kbd>
			</button>
		</span>
	);
}
