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
			className="flex shrink-0 justify-end overflow-hidden pl-1.5 has-focus-visible:w-(--door)"
			style={{ "--door": `${width + 6}px`, width: `calc(var(--wake, 1) * ${width + 6}px)` } as CSSProperties}
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
