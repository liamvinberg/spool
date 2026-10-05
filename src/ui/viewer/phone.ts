import { useEffect, useState } from "react";
import type { Box } from "../canvas/camera";

/**
 * The phone's side of the read-only canvas (DEV-161, DEV-115): what counts as a phone, a phone frame and a
 * desktop one, and the screen a played frame fills, notch and home bar included.
 */

/** A phone: a touch screen with no hover, too narrow either way up for the spatial canvas. */
export function onPhone(): boolean {
	return (
		window.matchMedia("(hover: none) and (pointer: coarse)").matches &&
		Math.min(window.screen.width, window.screen.height) < 600
	);
}

/** Opened from the Home Screen, as an app, rather than in the browser. */
export function standalone(): boolean {
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

/** A frame drawn wider than any phone, which plays whole and scaled rather than filling the screen. */
export function isDesktop(frame: { w: number }): boolean {
	return frame.w > DESKTOP_FRAME;
}

const DESKTOP_FRAME = 500;

/** The screen as a played frame has it: the window, and the safe areas the notch and home bar keep. */
export interface PhoneScreen {
	w: number;
	h: number;
	top: number;
	bottom: number;
	landscape: boolean;
}

/** The screen, read again whenever it turns or resizes. */
export function useScreen(): PhoneScreen {
	const [screen, setScreen] = useState(readScreen);
	useEffect(() => {
		const read = () => setScreen(readScreen());
		window.addEventListener("resize", read);
		window.visualViewport?.addEventListener("resize", read);
		return () => {
			window.removeEventListener("resize", read);
			window.visualViewport?.removeEventListener("resize", read);
		};
	}, []);
	return screen;
}

function readScreen(): PhoneScreen {
	// the safe areas are only told to CSS, so an element padded by them says how large they are
	const probe = document.createElement("div");
	probe.style.cssText =
		"position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
	document.body.appendChild(probe);
	const style = getComputedStyle(probe);
	const top = Number.parseFloat(style.paddingTop) || 0;
	const bottom = Number.parseFloat(style.paddingBottom) || 0;
	probe.remove();
	const w = window.innerWidth;
	const h = window.innerHeight;
	return { w, h, top, bottom, landscape: w > h };
}

/**
 * Where a desktop frame plays, whole and centred at its authored size scaled: between the notch and the home bar
 * upright, the whole screen turned.
 */
export function contained(screen: PhoneScreen, frame: { w: number; h: number }): Box & { scale: number } {
	const top = screen.landscape ? 0 : screen.top;
	const room = screen.h - top - (screen.landscape ? 0 : screen.bottom);
	const scale = Math.min(screen.w / frame.w, room / frame.h);
	const w = frame.w * scale;
	const h = frame.h * scale;
	return { x: (screen.w - w) / 2, y: top + (room - h) / 2, w, h, scale };
}
