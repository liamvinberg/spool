import type { KeyCommand } from "./stage-keys";
import type { StageSession } from "./stage-session";
import { parseKeyCommand, parsePointer, parseSession, type StagePointer } from "./stage-wire";

/**
 * What the presenter view and the room's window say to each other while a talk is presented (spool#265). Both are
 * windows of spool's on its own origin, so a broadcast channel named for the talk carries it; nothing goes through the
 * daemon. The presenter view is the one authority: it publishes each session whole, numbered by its revision, and the
 * room shows the newest and never steps by itself. The room asks for the newest as it opens, and as it opens again on
 * a reload. The pointer over a live slide travels apart from the sessions, light and often.
 */

export type TalkMessage =
	/**
	 * presenter → room: the talk as it now is, `ui.state` and all; `frame` names the slide the room's screen shows, so a
	 * room still on another build of a talk that changed holds its picture until it has the same one
	 */
	| { readonly kind: "session"; readonly session: StageSession; readonly frame: string }
	/** presenter → room: the presenter's pointer over the live slide, or null once it leaves */
	| { readonly kind: "pointer"; readonly at: StagePointer | null }
	/** presenter → room: the talk is over, and the room's window closes */
	| { readonly kind: "end" }
	/** room → presenter: the newest session, please; the room has opened */
	| { readonly kind: "ask" }
	/**
	 * room → presenter: the room's screen shows a new picture, of the session at this revision or a newer one; `apart`:
	 * its stage plays in a process of its own, so the presenter's stages may hold more WebGL contexts (spool#320)
	 */
	| { readonly kind: "shown"; readonly revision: number; readonly apart?: true }
	/** room → presenter: a key pressed or a click in the room's window, for the presenter to carry out */
	| { readonly kind: "command"; readonly command: KeyCommand }
	/** room → presenter: the room's window is going, closed or reloading */
	| { readonly kind: "gone" };

/** The broadcast channel a talk is presented over, named for it. */
export const talkChannel = (talk: string): string => `spool-talk:${talk}`;

/** A talk's name in its room's address: what `mintTalk` makes. */
export const TALK_NAME = /^[A-Za-z0-9_-]{16,64}$/;

/** A fresh name for a talk being presented, so two talks never hear each other. */
export function mintTalk(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * What the room passes on of the keys pressed and the clicks made in its window: every command they make, the keys
 * being the same in every host, for the presenter view to carry out (? lists the keys there, never over the room's
 * slide). Never a write to `ui.state`: what the room's copy of a live slide writes on its own is a mirror's echo, not
 * the talk's.
 */
export function roomPasses(command: KeyCommand): boolean {
	return command.kind !== "state" && command.kind !== "blur";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** A word heard on a talk's channel, checked. */
export function parseTalkMessage(value: unknown): TalkMessage | undefined {
	if (!isRecord(value)) return undefined;
	switch (value.kind) {
		case "session": {
			const session = parseSession(value.session);
			if (session === undefined || typeof value.frame !== "string") return undefined;
			return { kind: "session", session, frame: value.frame };
		}
		case "pointer": {
			const at = parsePointer(value.at);
			return at === undefined ? undefined : { kind: "pointer", at };
		}
		case "command": {
			const command = parseKeyCommand(value.command);
			return command === undefined ? undefined : { kind: "command", command };
		}
		case "shown":
			if (typeof value.revision !== "number") return undefined;
			return { kind: "shown", revision: value.revision, ...(value.apart === true ? { apart: true } : {}) };
		case "end":
		case "ask":
		case "gone":
			return { kind: value.kind };
		default:
			return undefined;
	}
}
