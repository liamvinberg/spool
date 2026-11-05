import { RECORD_LIMIT_MS, type RecordedInput } from "./record-protocol";

/**
 * The hands, noted while a recording runs (spool#221): every pointer, wheel and
 * key input the person gives the played frame, with when and where, and
 * nothing the frame does itself. It is all a recording is. The daemon plays it
 * back into a fresh copy of the frame, so what the frame did in between needs
 * no noting: given the same inputs at the same moments, it does it again.
 *
 * Listened for on the window in the capture phase and never stopped or
 * prevented, so the frame hears every input exactly as it would unrecorded.
 * Inputs the frame makes itself (`dispatchEvent`) are not the hands' and are
 * left out: the playback would make them again. Escape is the one key kept
 * back: it stops the recording, so it is `onEscape`'s rather than the clip's.
 */
export interface HandsLog {
	start(): void;
	/** Stop noting; what was noted, how long it ran and the size it was played at. Nothing while it is not running. */
	stop(): { inputs: RecordedInput[]; duration: number; w: number; h: number } | undefined;
}

export function createHandsLog(target: Window, onEscape: () => void): HandsLog {
	let began: number | undefined;
	let inputs: RecordedInput[] = [];
	let size = { w: 0, h: 0 };
	const now = () => (began === undefined ? 0 : Math.round((target.performance.now() - began) * 10) / 10);
	const note = (input: RecordedInput) => {
		if (began === undefined || input.t > RECORD_LIMIT_MS) return;
		inputs.push(input);
	};
	const pointer = (kind: "move" | "down" | "up") => (event: PointerEvent) => {
		if (!event.isTrusted) return;
		note({ t: now(), kind, x: event.clientX, y: event.clientY, button: kind === "move" ? 0 : event.button });
	};
	const wheel = (event: WheelEvent) => {
		if (!event.isTrusted) return;
		const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? target.innerHeight : 1;
		note({
			t: now(),
			kind: "wheel",
			x: event.clientX,
			y: event.clientY,
			dx: event.deltaX * unit,
			dy: event.deltaY * unit,
		});
	};
	const key = (kind: "key-down" | "key-up") => (event: KeyboardEvent) => {
		if (!event.isTrusted) return;
		if (event.key === "Escape") {
			if (kind === "key-down") onEscape();
			return;
		}
		note({ t: now(), kind, key: event.key, code: event.code, text: event.key.length === 1 ? event.key : "" });
	};
	const leave = (event: MouseEvent) => {
		if (event.isTrusted && event.relatedTarget === null) note({ t: now(), kind: "leave" });
	};
	const listeners: [string, (event: never) => void][] = [
		["pointermove", pointer("move")],
		["pointerdown", pointer("down")],
		["pointerup", pointer("up")],
		["wheel", wheel],
		["keydown", key("key-down")],
		["keyup", key("key-up")],
		["mouseout", leave],
	];
	return {
		start() {
			if (began !== undefined) return;
			began = target.performance.now();
			inputs = [];
			size = { w: target.innerWidth, h: target.innerHeight };
			for (const [type, listener] of listeners) {
				target.addEventListener(type, listener as EventListener, { capture: true, passive: true });
			}
		},
		stop() {
			if (began === undefined) return undefined;
			for (const [type, listener] of listeners) {
				target.removeEventListener(type, listener as EventListener, { capture: true });
			}
			const duration = Math.min(RECORD_LIMIT_MS, now());
			began = undefined;
			return { inputs, duration, ...size };
		},
	};
}
