/**
 * The interface's own colours: the eleven in `src/ui/ui.css` and nowhere else.
 *
 * The chrome is already built on these, so this list is the whole of what a
 * theme can change. The values are read off `design/shared/tokens.css`, which
 * mirrors ui.css, and `mark` carries no hex of its own: it is `thread` until a
 * development daemon paints it blue.
 */

export interface ColourToken {
	readonly name: string;
	/** what it paints, in a person's words */
	readonly paints: string;
	/** the shipped value, or absent where the token follows another one */
	readonly value?: string;
	readonly follows?: string;
}

export const COLOUR_TOKENS: readonly ColourToken[] = [
	{ name: "bg", paints: "behind everything", value: "#0e0e0e" },
	{ name: "canvas", paints: "the field the frames sit on", value: "#161616" },
	{ name: "surface", paints: "rails, cards, this sheet", value: "#1c1c1c" },
	{ name: "raised", paints: "menus and toasts", value: "#282828" },
	{ name: "border", paints: "hairlines", value: "#262626" },
	{ name: "border-raised", paints: "an edge meant to be seen", value: "#363636" },
	{ name: "text", paints: "words at full ink", value: "#f0efed" },
	{ name: "muted", paints: "words that stand back", value: "#8e8c88" },
	{ name: "thread", paints: "the accent, and every thread on the canvas", value: "#f5391a" },
	{ name: "mark", paints: "the ribbon in the corner", follows: "thread" },
	{ name: "on-thread", paints: "ink on the accent", value: "#ffffff" },
];

/** What a token is worth right now: the person's value, the token it follows, or spool's. */
export function colourOf(token: ColourToken, changed: Readonly<Record<string, string>>): string {
	const own = changed[token.name];
	if (own !== undefined) return own;
	if (token.follows !== undefined) {
		const followed = COLOUR_TOKENS.find((candidate) => candidate.name === token.follows);
		if (followed !== undefined) return colourOf(followed, changed);
	}
	return token.value ?? "#000000";
}
