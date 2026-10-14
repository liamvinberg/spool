import { OVERVIEW_HOLD_MS } from "../../ui/canvas/live-moves";
import { comboMatches } from "../../ui/hotkey-combos";
import { editTakesKey } from "./edit";
import type { RelayKey } from "./globals";
import { shimConfig } from "./natives";

/**
 * What reaches out of an entered frame is the register's to say (its `relay`
 * entries, ui/hotkeys.ts): Esc must still exit (#22), the jump chords are
 * owed mid-walk (#166), and browser zoom chords become the canvas's so a
 * focused frame cannot zoom the whole page into a trap.
 */

const relayKeys = __SPOOL_RELAY_KEYS__;

// A key a prototype may well bind itself (`yields` in the register: ⌥
// arrows, ⌥ hjkl, ⌥ held) is the frame's first. Spool takes it only when no
// listener in the frame called preventDefault (or stopped it on its way
// up), which it can know only once every one of them ran: the window's
// bubble listener added now, mid-dispatch, runs after every one the frame
// already had there. A press stopped on its way never reaches it, so the
// next press clears it away first.
let awaiting: { decide: (seen: Event) => void } | null = null;
const appleShim = /Mac|iPhone|iPad|iPod/.test(
	(navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
		navigator.platform ||
		"",
);
const yieldingMatch = (event: KeyboardEvent) =>
	relayKeys.some((relay) => relay.yields && relay.match.hold === null && comboMatches(event, relay.match, null));
const typingIn = (event: KeyboardEvent): boolean => {
	const path = typeof event.composedPath === "function" ? event.composedPath() : [];
	const el = path[0] instanceof Element ? path[0] : event.target;
	if (!(el instanceof HTMLElement)) return false;
	if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
	if (el.tagName !== "INPUT") return false;
	return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file", "image", "hidden"].includes(
		(el as HTMLInputElement).type,
	);
};
const awaitFrame = (event: KeyboardEvent, relay: RelayKey, frame: string | undefined): void => {
	if (awaiting !== null) removeEventListener("keydown", awaiting.decide);
	const decide = (seen: Event): void => {
		if (seen !== event) return;
		removeEventListener("keydown", decide);
		awaiting = null;
		if (event.defaultPrevented) {
			// the frame keeps it, and a ⌥ it kept is no hold of spool's
			if (altHeld !== null) breakAlt(frame);
			return;
		}
		if (relay.match.hold === null) {
			event.preventDefault();
			// a step under the held ⌥ opens the overview at once
			if (altHeld !== null) altHeld.stepped = true;
		} else altHeld = { broken: false, stepped: false, since: performance.now() };
		window.parent.postMessage(
			{
				spool: "key",
				frame,
				id: relay.id,
				metaKey: event.metaKey,
				ctrlKey: event.ctrlKey,
				key: event.key,
				code: event.code,
			},
			"*",
		);
	};
	awaiting = { decide };
	addEventListener("keydown", decide);
};

// the ⌥ held that spool was told of, once per hold; null while none is
let altHeld: { broken: boolean; stepped: boolean; since: number } | null = null;
const breakAlt = (frame: string | undefined): void => {
	if (altHeld === null || altHeld.broken) return;
	altHeld.broken = true;
	window.parent.postMessage({ spool: "hold", frame, phase: "broken" }, "*");
};

// the rest of a press swallowed under a held ⌥ goes with it
let swallowPress = false;

export function relayKeysOut(): void {
	addEventListener(
		"keydown",
		(event) => {
			if (window.parent === window) return;
			const frame = shimConfig().frame;
			if (editTakesKey(event)) return;
			// a key the page made up itself is no press of the person's: it moves
			// nothing out on the canvas, as a made-up drag drops nothing
			if (!event.isTrusted) return;
			// ⌥ held for the overview (DEV-295): any other key under it, the
			// modifiers included, ends it unopened, so ⌥2 still types @
			if (event.key === "Alt") {
				if (!event.repeat) altHeld = null;
			} else if (altHeld !== null && !yieldingMatch(event)) breakAlt(frame);
			// which key is the accel modifier is the canvas's rule, not the frame's:
			// report the key that moved and let the canvas decide it counts
			if (event.key === "Meta" || event.key === "Control") {
				window.parent.postMessage({ spool: "modifier", frame, modifier: event.key, held: true }, "*");
				return;
			}
			for (const relay of relayKeys) {
				if (!comboMatches(event, relay.match, null)) continue;
				if (relay.yields) {
					if (relay.match.hold !== null && event.repeat) return;
					// accel is ⌘ on a Mac and ctrl elsewhere: ctrl+⌥ arrows on a Mac
					// are the frame's, and the system's, never spool's
					if (relay.match.accel && !(appleShim ? event.metaKey : event.ctrlKey)) continue;
					// the frame's own listeners come first: decide once they all ran
					if (!relay.typing && typingIn(event)) {
						if (event.key !== "Alt") breakAlt(frame);
						return;
					}
					awaitFrame(event, relay, frame);
					return;
				}
				if (relay.prevent) event.preventDefault();
				window.parent.postMessage(
					{ spool: "key", frame, id: relay.id, metaKey: event.metaKey, ctrlKey: event.ctrlKey },
					"*",
				);
				return;
			}
		},
		true,
	);

	addEventListener(
		"keyup",
		(event) => {
			if (window.parent === window || event.key !== "Alt" || altHeld === null) return;
			const broken = altHeld.broken;
			altHeld = null;
			// a broken hold was told once already: its overview is gone
			if (!broken) window.parent.postMessage({ spool: "hold", frame: shimConfig().frame, phase: "up" }, "*");
		},
		true,
	);
	addEventListener("blur", () => {
		if (window.parent === window || altHeld === null) return;
		breakAlt(shimConfig().frame);
		altHeld = null;
	});
	// a press under a held ⌥ is a gesture of its own, the frame's or the
	// canvas's. Once the overview may be open (held past its delay) the camera
	// has moved under the pointer, so the press is no click on what it lands
	// on: it only closes the overview, and never reaches the page. Once the
	// overview is up the canvas lays its catcher over every frame, so this is
	// the press that beat it here, over the live frame itself, where a click
	// on the overview stays anyway
	addEventListener(
		"pointerdown",
		(event) => {
			if (window.parent === window || altHeld === null) return;
			const open = !altHeld.broken && (altHeld.stepped || performance.now() - altHeld.since >= OVERVIEW_HOLD_MS);
			breakAlt(shimConfig().frame);
			if (!open) return;
			swallowPress = true;
			event.preventDefault();
			event.stopImmediatePropagation();
		},
		true,
	);
	for (const type of ["pointerup", "mousedown", "mouseup", "click", "auxclick", "contextmenu"]) {
		addEventListener(
			type,
			(event) => {
				if (!swallowPress) return;
				if (type === "click" || (type === "pointerup" && (event as PointerEvent).pointerType !== "mouse"))
					swallowPress = false;
				event.preventDefault();
				event.stopImmediatePropagation();
			},
			true,
		);
	}
}

/**
 * The accel modifier going up, and losing focus, which releases both
 * candidates: the canvas owns the accel rule, so naming only one would leave
 * the other platform's modifier stuck down.
 */
export function relayModifierRelease(): void {
	addEventListener(
		"keyup",
		(event) => {
			if (window.parent === window) return;
			if (event.key !== "Meta" && event.key !== "Control") return;
			window.parent.postMessage(
				{
					spool: "modifier",
					frame: shimConfig().frame,
					modifier: event.key,
					held: false,
				},
				"*",
			);
		},
		true,
	);

	addEventListener("blur", () => {
		if (window.parent === window) return;
		const frame = shimConfig().frame;
		// told as a blur: the key may still be down, the focus only moved on
		for (const modifier of ["Meta", "Control"]) {
			window.parent.postMessage({ spool: "modifier", frame, modifier, held: false, blur: true }, "*");
		}
	});
}
