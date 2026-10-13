import { matchesCombo, type ParsedCombo, parseCombo } from "./hotkey-combos";
import {
	EXCLUSIVE_SCOPES,
	HOTKEYS,
	type HotkeyId,
	type HotkeyScope,
	type KeyedHotkeyEntry,
	SCOPE_PRIORITY,
} from "./hotkeys";

/**
 * The one place a key press becomes a spool action. Surfaces attach a layer
 * naming their scope and the register entries they answer; one window
 * listener, installed while any layer is attached, walks the scopes from most
 * modal down and runs the first matching handler. An exclusive scope that is
 * up swallows what it does not answer, exactly as the finder and the export
 * dialog always have.
 *
 * Two rules sit above every layer:
 *
 * - Typing wins. A key born in an input, a textarea, or contenteditable
 *   belongs to the text, never to a shortcut.
 * - An entered frame owns its keyboard (the parity law). That gating lives in
 *   the canvas handlers beside the state that knows it, and the iframe
 *   boundary already keeps most keys from ever reaching this window; what a
 *   frame must hand back arrives by shim relay through `runHotkey`.
 *
 * A handler may run without an event: the shim relays a chord it swallowed
 * inside a frame, and the meaning has already been decided there. Handlers
 * therefore treat the event as optional and gate on state, not on keys.
 */

export type HotkeyHandler = (event?: KeyboardEvent) => void;

export interface HotkeyLayer {
	scope: HotkeyScope;
	/** read per event so it can sit on refs; an absent gate means mounted = up */
	active?: () => boolean;
	handlers: Partial<Record<HotkeyId, HotkeyHandler>>;
}

interface DispatchEntry {
	id: HotkeyId;
	combos: readonly ParsedCombo[];
	repeats: boolean;
	typing: boolean;
}

const entriesByScope = new Map<HotkeyScope, readonly DispatchEntry[]>();
for (const scope of SCOPE_PRIORITY) {
	entriesByScope.set(
		scope,
		HOTKEYS.filter((entry): entry is KeyedHotkeyEntry => entry.scope === scope && "keys" in entry).map((entry) => ({
			id: entry.id,
			combos: entry.keys.map(parseCombo),
			repeats: !("repeats" in entry && entry.repeats === false),
			typing: "typing" in entry && entry.typing === true,
		})),
	);
}

const layers = new Set<HotkeyLayer>();

function isTyping(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
	);
}

function activeLayers(scope: HotkeyScope): HotkeyLayer[] {
	const up: HotkeyLayer[] = [];
	for (const layer of layers) {
		if (layer.scope === scope && (layer.active?.() ?? true)) up.push(layer);
	}
	return up;
}

export function dispatchHotkeyEvent(event: KeyboardEvent): void {
	const typing = isTyping(event.target);
	for (const scope of SCOPE_PRIORITY) {
		const up = activeLayers(scope);
		if (up.length === 0) continue;
		for (const entry of entriesByScope.get(scope) ?? []) {
			if (typing && !entry.typing) continue;
			if (!entry.combos.some((combo) => matchesCombo(event, combo))) continue;
			for (const layer of up) {
				const handler = layer.handlers[entry.id];
				if (handler !== undefined) {
					// a held key's repeats are still the entry's, only not run: let
					// through, each would reach the Mac menu's copy of the key and
					// run there, one tab closed per repeat
					if (!entry.repeats && event.repeat) event.preventDefault();
					else handler(event);
					return;
				}
			}
		}
		if (EXCLUSIVE_SCOPES.has(scope)) return;
	}
}

/**
 * Run a register entry by name: the relay ingress. The highest active layer
 * answering the id takes it; exclusivity does not bar the walk, because the
 * chord was already claimed and decided inside the frame that sent it.
 */
export function runHotkey(id: HotkeyId, event?: KeyboardEvent): boolean {
	for (const scope of SCOPE_PRIORITY) {
		for (const layer of activeLayers(scope)) {
			const handler = layer.handlers[id];
			if (handler !== undefined) {
				handler(event);
				return true;
			}
		}
	}
	return false;
}

/** A menu click uses the same handlers, but cannot reach behind a modal surface. */
export function runMenuHotkey(id: HotkeyId): boolean {
	for (const scope of SCOPE_PRIORITY) {
		const up = activeLayers(scope);
		for (const layer of up) {
			const handler = layer.handlers[id];
			if (handler !== undefined) {
				handler();
				return true;
			}
		}
		if (up.length > 0 && EXCLUSIVE_SCOPES.has(scope)) return false;
	}
	return false;
}

function onWindowKeyDown(event: KeyboardEvent): void {
	dispatchHotkeyEvent(event);
}

/** Attach a surface's layer; the window listener lives while any layer does. */
export function attachHotkeyLayer(layer: HotkeyLayer): () => void {
	if (layers.size === 0) window.addEventListener("keydown", onWindowKeyDown);
	layers.add(layer);
	return () => {
		layers.delete(layer);
		if (layers.size === 0) window.removeEventListener("keydown", onWindowKeyDown);
	};
}

/** Each modal scope's own way out: the entry its Esc runs. */
const CLOSERS: Partial<Record<HotkeyScope, HotkeyId>> = {
	dialog: "dialog.close",
	finder: "finder.close",
	picker: "picker.close",
	help: "help.close",
	settings: "settings.close",
};

/**
 * ⌘W's first meaning: put away the most modal surface that is up, as its Esc
 * would. A surface whose layer only holds the keys and answers Esc itself (a
 * native dialog, the picker) is sent one. False when nothing modal is up.
 */
export function closeTopmost(): boolean {
	for (const scope of SCOPE_PRIORITY) {
		if (!EXCLUSIVE_SCOPES.has(scope)) continue;
		const up = activeLayers(scope);
		if (up.length === 0) continue;
		const id = CLOSERS[scope];
		// the layer attached last is the one drawn on top
		for (const layer of up.reverse()) {
			const handler = id === undefined ? undefined : layer.handlers[id];
			if (handler !== undefined) {
				handler();
				return true;
			}
		}
		escapeTopmost();
		return true;
	}
	return false;
}

/** Esc for a surface that takes its own: a dialog's cancel, else a keydown where the focus is. */
function escapeTopmost(): void {
	// a modal dialog holds the focus inside it, so the focus says which is on top
	const modal =
		document.activeElement?.closest<HTMLDialogElement>("dialog[open]") ??
		[...document.querySelectorAll("dialog")].filter((dialog) => dialog.matches(":modal")).at(-1);
	if (modal !== undefined) {
		const cancel = new Event("cancel", { cancelable: true });
		modal.dispatchEvent(cancel);
		if (!cancel.defaultPrevented) modal.close();
		return;
	}
	(document.activeElement ?? document.body).dispatchEvent(
		new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }),
	);
}
