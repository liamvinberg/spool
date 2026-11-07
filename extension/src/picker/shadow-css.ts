/**
 * The compiled sheet, fitted to a shadow root on someone else's page:
 *
 * - `:root` is the document's, so the theme's tokens and its colour scheme move to `:host`;
 * - `rem` is the page's root font size, which a site may have set to anything, so lengths go to pixels;
 * - `@property` is ignored inside a shadow root, so Tailwind's registered defaults are set on every element instead,
 *   in its first layer, where any utility beats them.
 */
export function shadowCss(css: string): string {
	const defaults: string[] = [];
	const body = css
		.replace(/@property\s+(--[\w-]+)\s*\{([^}]*)\}/g, (_all, name: string, block: string) => {
			const initial = /initial-value:\s*([^;]+)/.exec(block)?.[1]?.trim();
			if (initial !== undefined) defaults.push(`${name}: ${initial}`);
			return "";
		})
		.replace(/:root(?![\w-])/g, ":host")
		.replace(/(-?\d*\.?\d+)rem\b/g, (_all, n: string) => `${Number(n) * 16}px`);
	const host = `:host { color-scheme: dark; }`;
	return `@layer properties { :host, *, ::before, ::after, ::backdrop { ${defaults.join("; ")} } }\n${body}\n${host}`;
}
