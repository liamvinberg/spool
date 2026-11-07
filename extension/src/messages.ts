import type { ReferenceCapture, ReferenceOpen, ReferenceOpened, ReferenceSent } from "../../src/reference-wire";

/** what the picker asks the service worker, which alone may reach the daemon (its origin is what the daemon trusts) */
export type Ask = { type: "spool:send"; capture: ReferenceCapture } | { type: "spool:open"; open: ReferenceOpen };

/** the daemon took it; it isn't there (nothing answered on any port); or it answered with an error */
export type SendAnswer =
	| { ok: true; sent: ReferenceSent }
	| { ok: false; offline: true }
	| { ok: false; offline: false; error: string };

export type OpenAnswer = { ok: true; opened: ReferenceOpened } | { ok: false };

/** the picker's handle in the tab's isolated world, so a second click on the icon toggles it */
export interface PickerHandle {
	toggle(): void;
}

export const PICKER_GLOBAL = "__spoolPicker";
