/**
 * pi's `auth.json`, as the first run writes a pasted key into it (spool#250).
 *
 * pi reads a stored key as more than text: a key starting with `!` is a shell command pi
 * runs for the key, and `$NAME` or `${NAME}` is filled from the environment (pi's
 * `resolveConfigValue`; older pis took a key that was a variable's whole name as that
 * variable). A key a person pastes is the key itself, so spool stores only one pi can't
 * read as anything else, on every pi: no `!` at its start and no `$` anywhere.
 */

/** Why spool won't store this as a key, or undefined when pi can only read it as the key it is. */
export function literalKeyRefusal(key: string): string | undefined {
	// printable ASCII, no spaces: every provider's keys are, and a pasted line break is not part of one
	if (!/^[\x21-\x7e]+$/.test(key)) return "That isn’t a key: a key has no spaces or line breaks.";
	if (key.startsWith("!") || key.includes("$"))
		return "That isn’t a key: pi would run a leading ! or fill in a $ rather than send it.";
	return undefined;
}
