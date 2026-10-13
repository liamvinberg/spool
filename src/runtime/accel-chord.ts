import { matchesCombo, parseCombo } from "../ui/hotkey-combos";
import { hotkeyEntry } from "../ui/hotkeys";
import { accelPressed, currentPlatform, type ModifierLike } from "./platform-keys";

/** The register's own leave chord, read once. */
let leaveCombos: ReturnType<typeof parseCombo>[] | undefined;

/**
 * The one gesture spool keeps for itself, and the only one it may take from a
 * live frame (#227). Every ordinary key belongs to the prototype being used,
 * its own `esc` for modals included, so spool's own lives behind accel and
 * nowhere else: the register's leave keys (`canvas.leave`), with accel read
 * exclusively, because on a Mac a ctrl press is the frame's. Undefined means
 * the press was never spool's.
 */
export function accelChord(
	event: ModifierLike & { key: string; code?: string; altKey: boolean; shiftKey: boolean },
	platform = currentPlatform(),
): "leave" | undefined {
	if (!accelPressed(event, platform)) return undefined;
	const entry = hotkeyEntry("canvas.leave");
	leaveCombos ??= "keys" in entry ? entry.keys.map(parseCombo) : [];
	const press = { ...event, code: event.code ?? "" };
	return leaveCombos.some((combo) => matchesCombo(press, combo, platform)) ? "leave" : undefined;
}
