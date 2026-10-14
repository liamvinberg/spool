import type { ComboMatch } from "../../ui/hotkey-combos";

/** One key an entered frame hands back to the canvas (src/frame-shim-build.ts). */
export interface RelayKey {
	id: string;
	match: ComboMatch;
	/** whether the browser's own meaning is eaten */
	prevent: boolean;
	yields: boolean;
	typing: boolean;
}

declare global {
	/** Baked in at build from the register (ui/hotkeys.ts), which the frame does not carry. */
	const __SPOOL_RELAY_KEYS__: readonly RelayKey[];
	const __SPOOL_EDIT_HELD_KEYS__: readonly ComboMatch[];
}
