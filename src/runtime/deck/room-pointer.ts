import { type PenState, POINTER_COLOURS, pointerScale } from "../../deck/pointer";

/** The pointer's spring: stiff and heavily damped, so it follows the hand closely and never overshoots. */
const STIFFNESS = 900;
const DAMPING = 60;
const MASS = 0.4;
const OUT = "cubic-bezier(0.22, 0.61, 0.36, 1)";
/** Its fade in and out, and how its colour changes. */
const FADE = `180ms ${OUT}`;
/** A press sinks it on a quick, firm curve, and it springs back a touch past. */
const PRESS = "140ms cubic-bezier(0.34, 1.56, 0.64, 1)";
/** A click's ring going out, and how long the colours stand beside it after the wheel turns them. */
const RIPPLE_MS = 600;
const COLOURS_MS = 900;

/** Where the pointer stands in its box, the width of the slide drawn there, and what the hand is doing. */
export interface PointerPlace extends PenState {
	readonly x: number;
	readonly y: number;
	readonly width: number;
}

export interface RoomPointer {
	/** follow `where` again: null hides it */
	draw(): void;
	destroy(): void;
}

/**
 * The presenter's pointer as the room sees it over a live slide (`src/deck/pointer.ts`), drawn into `root`: gliding
 * after the hand on a spring, sized to the slide on screen, sunk while the button is down, a ring going out for each
 * click, and the colours shown beside it for a moment as the wheel turns them.
 */
export function roomPointer(root: HTMLElement, where: () => PointerPlace | null): RoomPointer {
	const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
	const wrap = document.createElement("span");
	wrap.setAttribute("aria-hidden", "true");
	Object.assign(wrap.style, { position: "absolute", left: "0", top: "0", zIndex: "1", pointerEvents: "none" });
	const core = document.createElement("span");
	core.dataset.spoolRoomDot = "";
	Object.assign(core.style, {
		position: "absolute",
		borderRadius: "9999px",
		opacity: "0",
		scale: "0.6",
		transition: `opacity ${FADE}, scale ${PRESS}, background-color ${FADE}`,
	});
	const colours = document.createElement("span");
	Object.assign(colours.style, {
		position: "absolute",
		display: "flex",
		alignItems: "center",
		borderRadius: "9999px",
		background: "rgba(20, 20, 22, 0.82)",
		backdropFilter: "blur(8px)",
		opacity: "0",
		transformOrigin: "left bottom",
		transition: `opacity 160ms ${OUT}, transform 160ms ${OUT}`,
	});
	const chips = POINTER_COLOURS.map((colour) => {
		const chip = document.createElement("span");
		Object.assign(chip.style, {
			borderRadius: "9999px",
			background: colour,
			transition: `scale 200ms ${OUT}, opacity 200ms ${OUT}`,
		});
		colours.append(chip);
		return chip;
	});
	wrap.append(core, colours);
	root.append(wrap);

	let at: { x: number; y: number } | undefined;
	const speed = { x: 0, y: 0 };
	let goal = { x: 0, y: 0 };
	let frame = 0;
	let last = 0;
	let shown = false;
	let k = 1;
	let colour: number | undefined;
	let taps: number | undefined;
	let coloursTimer = 0;

	const place = () => {
		if (at !== undefined) wrap.style.transform = `translate(${at.x}px, ${at.y}px)`;
	};
	const step = (now: number) => {
		frame = 0;
		if (at === undefined) return;
		let left = Math.min(0.05, (now - last) / 1000);
		last = now;
		while (left > 0) {
			const h = Math.min(left, 0.004);
			left -= h;
			for (const axis of ["x", "y"] as const) {
				const pull = -STIFFNESS * (at[axis] - goal[axis]) - DAMPING * speed[axis];
				speed[axis] += (pull / MASS) * h;
				at[axis] += speed[axis] * h;
			}
		}
		const resting =
			Math.abs(at.x - goal.x) < 0.1 && Math.abs(at.y - goal.y) < 0.1 && Math.hypot(speed.x, speed.y) < 1;
		if (resting) at = { ...goal };
		place();
		if (!resting) frame = requestAnimationFrame(step);
	};

	const measure = (scale: number) => {
		if (scale === k && core.style.width !== "") return;
		k = scale;
		const size = 18 * k;
		Object.assign(core.style, {
			width: `${size}px`,
			height: `${size}px`,
			left: `${-size / 2}px`,
			top: `${-size / 2}px`,
			boxShadow: `0 0 0 ${3 * k}px #fff, 0 0 0 ${4 * k}px rgba(0, 0, 0, 0.35), 0 ${3 * k}px ${10 * k}px rgba(0, 0, 0, 0.4)`,
		});
		Object.assign(colours.style, {
			left: `${size}px`,
			top: `${-size * 2.1}px`,
			gap: `${6 * k}px`,
			padding: `${6 * k}px`,
		});
		for (const chip of chips) Object.assign(chip.style, { width: `${14 * k}px`, height: `${14 * k}px` });
	};

	const ripple = (x: number, y: number, tint: string) => {
		if (still) return;
		const size = 90 * k;
		const ring = document.createElement("span");
		Object.assign(ring.style, {
			position: "absolute",
			left: `${x - size / 2}px`,
			top: `${y - size / 2}px`,
			width: `${size}px`,
			height: `${size}px`,
			zIndex: "1",
			borderRadius: "9999px",
			border: `${3 * k}px solid ${tint}`,
			pointerEvents: "none",
		});
		root.append(ring);
		const run = ring.animate(
			[
				{ scale: 0.2, opacity: 1 },
				{ scale: 1, opacity: 0 },
			],
			{ duration: RIPPLE_MS, easing: OUT },
		);
		run.onfinish = () => ring.remove();
	};

	const showColours = (pick: number) => {
		chips.forEach((chip, i) => {
			chip.style.scale = i === pick ? "1" : "0.62";
			chip.style.opacity = i === pick ? "1" : "0.7";
		});
		colours.style.opacity = "1";
		colours.style.transform = "none";
		window.clearTimeout(coloursTimer);
		coloursTimer = window.setTimeout(hideColours, COLOURS_MS);
	};
	const hideColours = () => {
		colours.style.opacity = "0";
		colours.style.transform = "translateY(4px) scale(0.95)";
	};
	hideColours();

	return {
		draw() {
			const now = where();
			if (now === null) {
				shown = false;
				core.style.opacity = "0";
				core.style.scale = "0.6";
				hideColours();
				return;
			}
			measure(pointerScale(now.width));
			goal = { x: now.x, y: now.y };
			// a pointer that comes back comes back where the hand is, not gliding from where it left
			if (at === undefined || !shown || still) {
				at = { ...goal };
				speed.x = 0;
				speed.y = 0;
				place();
			} else if (frame === 0) {
				last = performance.now();
				frame = requestAnimationFrame(step);
			}
			const tint = POINTER_COLOURS[now.colour] ?? POINTER_COLOURS[0];
			core.style.background = tint;
			// a click made while it was hidden, or before it was first drawn, sends nothing out
			if (shown && taps !== undefined && now.taps > taps) ripple(now.x, now.y, tint);
			if (shown && colour !== undefined && now.colour !== colour) showColours(now.colour);
			taps = now.taps;
			colour = now.colour;
			shown = true;
			core.style.opacity = "1";
			core.style.scale = now.down ? "0.78" : "1";
		},
		destroy() {
			cancelAnimationFrame(frame);
			window.clearTimeout(coloursTimer);
			wrap.remove();
		},
	};
}
