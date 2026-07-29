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
}

const entriesByScope = new Map<HotkeyScope, readonly DispatchEntry[]>();
for (const scope of SCOPE_PRIORITY) {
	entriesByScope.set(
		scope,
		HOTKEYS.filter((entry): entry is KeyedHotkeyEntry => entry.scope === scope && "keys" in entry).map((entry) => ({
			id: entry.id,
			combos: entry.keys.map(parseCombo),
			repeats: !("repeats" in entry && entry.repeats === false),
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
	if (isTyping(event.target)) return;
	for (const scope of SCOPE_PRIORITY) {
		const up = activeLayers(scope);
		if (up.length === 0) continue;
		for (const entry of entriesByScope.get(scope) ?? []) {
			if (!entry.repeats && event.repeat) continue;
			if (!entry.combos.some((combo) => matchesCombo(event, combo))) continue;
			for (const layer of up) {
				const handler = layer.handlers[entry.id];
				if (handler !== undefined) {
					handler(event);
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
