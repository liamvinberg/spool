import type { StageCommand } from "./stage-session";

/**
 * The keys of a talk (spool#265), the same in every host: the ladder a clicker sends and Keynote and PowerPoint
 * taught, read as commands. One pure table, applied wherever the key lands: in the slide's own document, where the
 * focus is, or in the host's.
 *
 *   → ↓ Space ↵ PageDown N    the next beat, then the next slide
 *   ← ↑ PageUp P ⌫            back
 *   ⇧→ ⇧←                     the next or previous slide, its beats skipped
 *   Home End                  the first slide, the last
 *   digits then ↵             that slide
 *   B .                       the room's screen black; any key brings it back and does nothing else
 *   F                         the room's screen holds its picture; F again and it catches up
 *                             (with no room, played in place on the canvas, these three are nobody's; with the
 *                             slides filling this screen, which is the room, B and the period black it, F is nobody's)
 *   R                         this slide from its start
 *   X                         the room's screen is the other screen (with the slides filling this one, nobody's)
 *   ?                         these keys
 *   ⇥                         the whole keyboard to a live slide; Esc takes it back
 *   Esc                       otherwise up one step: out of the slide, or the talk ends
 *
 * A focused text field keeps its keys, and a live slide holding the keyboard keeps them all, but for PageDown and
 * PageUp, which a clicker sends and which always move the talk. A key with a modifier, or one a slide already took,
 * is left alone.
 */

/** A command only a host can carry out: the talk itself does not move. */
export type HostCommand =
	/** up one step: out of the slide, or the talk ends */
	| { readonly kind: "escape" }
	| { readonly kind: "swap" }
	| { readonly kind: "help" }
	/** the focused text field lets go of the keys */
	| { readonly kind: "blur" };

export type KeyCommand = StageCommand | HostCommand;

/** A key as it was pressed. */
export interface PressedKey {
	/** `KeyboardEvent.key` */
	readonly key: string;
	readonly shift: boolean;
	readonly meta: boolean;
	readonly ctrl: boolean;
	readonly alt: boolean;
	/** something below already handled it */
	readonly prevented: boolean;
}

/** Where the key landed, and the talk's state it reads. */
export interface KeyPlace {
	/** a text field has the focus */
	readonly typing: boolean;
	/** the slide on screen is live */
	readonly live: boolean;
	/** that live slide holds the whole keyboard */
	readonly keys: boolean;
	readonly black: boolean;
	readonly frozen: boolean;
	/** no room watches the talk (it plays in place on the canvas): B, the period and F have no screen to act on */
	readonly alone: boolean;
	/** the slides fill this screen, which is the room's (spool#298): B and the period black it, F and X have nothing apart to act on */
	readonly filling: boolean;
}

/** What a key did: the command it is, if any, the digits typed so far, and whether the key was the talk's to take. */
export interface KeyRead {
	readonly command?: KeyCommand;
	readonly digits: string;
	readonly taken: boolean;
}

/** How long typed digits wait for ↵ before they are forgotten. */
export const DIGITS_FORGET_MS = 2500;

const BARE = new Set(["Shift", "Meta", "Control", "Alt", "AltGraph", "CapsLock", "Fn", "FnLock", "Hyper", "Super"]);

/** Read one key against the table, with the digits typed before it. */
export function readKey(pressed: PressedKey, place: KeyPlace, digits: string): KeyRead {
	const left: KeyRead = { digits, taken: false };
	if (BARE.has(pressed.key) || pressed.meta || pressed.ctrl || pressed.alt || pressed.prevented) return left;
	const take = (command: KeyCommand, typed = ""): KeyRead => ({ command, digits: typed, taken: true });
	if (place.black) return take({ kind: "black", on: false });
	// the clicker's two always move the talk
	if (pressed.key === "PageDown") return take({ kind: "next" });
	if (pressed.key === "PageUp") return take({ kind: "back" });
	if (place.typing) return pressed.key === "Escape" ? take({ kind: "blur" }, digits) : left;
	if (pressed.key === "Escape") return take(place.keys ? { kind: "keys", on: false } : { kind: "escape" });
	if (place.keys) return left;
	if (pressed.key === "Tab") return place.live && !pressed.shift ? take({ kind: "keys", on: true }) : left;
	if (/^[0-9]$/.test(pressed.key)) return { digits: (digits + pressed.key).slice(-3), taken: true };
	if (pressed.key === "Enter" && digits !== "") return take({ kind: "go", slide: Number(digits) - 1 });
	const command = commandOf(pressed, place);
	return command === undefined ? { digits: "", taken: false } : take(command);
}

function commandOf(pressed: PressedKey, place: KeyPlace): KeyCommand | undefined {
	switch (pressed.key) {
		case "ArrowRight":
			return { kind: pressed.shift ? "next-slide" : "next" };
		case "ArrowLeft":
			return { kind: pressed.shift ? "previous-slide" : "back" };
		case "ArrowDown":
		case " ":
		case "Enter":
		case "n":
		case "N":
			return { kind: "next" };
		case "ArrowUp":
		case "p":
		case "P":
		case "Backspace":
			return { kind: "back" };
		case "Home":
			return { kind: "first" };
		case "End":
			return { kind: "last" };
		case "b":
		case "B":
		case ".":
			return place.alone ? undefined : { kind: "black", on: true };
		case "f":
		case "F":
			return place.alone || place.filling ? undefined : { kind: "freeze", on: !place.frozen };
		case "r":
		case "R":
			return { kind: "restart" };
		case "x":
		case "X":
			return place.filling ? undefined : { kind: "swap" };
		case "?":
			return { kind: "help" };
		default:
			return undefined;
	}
}

/** A field that takes typing, where a key belongs to what is typed: an input, a text area, a select, editable text. */
export function typingIn(target: EventTarget | null): boolean {
	if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
	if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
		return true;
	}
	return (
		target instanceof HTMLInputElement &&
		!["range", "checkbox", "radio", "button", "submit", "reset", "color", "file", "image"].includes(target.type)
	);
}

/** A DOM key event as the table reads it. */
export function pressedKey(event: KeyboardEvent): PressedKey {
	return {
		key: event.key,
		shift: event.shiftKey,
		meta: event.metaKey,
		ctrl: event.ctrlKey,
		alt: event.altKey,
		prevented: event.defaultPrevented,
	};
}
