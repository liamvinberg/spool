/**
 * The name Save as variant copies a frame to (#220): `<name>--b`, or the next
 * letter free up to `--z`, a variant's own letter set aside, so a variant of
 * `card--b` is `card--c`. Nothing when every letter is taken. One name, a path
 * segment: what takes one is the caller's to say. Pure, so the daemon that
 * makes the copy and the rail that names it beforehand spell it the same.
 */
export function variantName(name: string, taken: (candidate: string) => boolean): string | undefined {
	const base = name.replace(/--[b-z]$/, "");
	for (let letter = "b".charCodeAt(0); letter <= "z".charCodeAt(0); letter += 1) {
		const candidate = `${base}--${String.fromCharCode(letter)}`;
		if (!taken(candidate)) return candidate;
	}
	return undefined;
}
