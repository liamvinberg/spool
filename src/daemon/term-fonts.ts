import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * The pinned terminal font (#42): JetBrains Mono, shipped inside spool's own
 * install like the player-chrome mono — never a CDN. Its 0.6 em advance is
 * what makes the cell math deterministic (see term/cells.ts). Documents load
 * it by URL; stills embed it as data URIs because an <img>-loaded SVG can
 * reach nothing external.
 */

const require = createRequire(import.meta.url);

const TERM_FONT_FILES: Record<string, string> = {
	"jetbrains-mono-latin-400-normal.woff2": require.resolve(
		"@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2",
	),
	"jetbrains-mono-latin-700-normal.woff2": require.resolve(
		"@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2",
	),
};

export function termFontFile(name: string): string | undefined {
	return TERM_FONT_FILES[name];
}

function faces(src: (file: string) => string): string {
	// the metric overrides are the 9×18 contract (term/cells.ts): JetBrains
	// Mono's natural line box is 1.32 em, and the emulator sizes its cell from
	// that measurement — 15px type would land on 24px rows. Pinning the box to
	// exactly 1 em (77/23 keeps the face's own ascent:descent ratio) makes the
	// measured line 15px, so the emulator's 1.2 line height yields the 18px
	// cell every other layer computes with. Glyph ink is untouched.
	const face = (weight: number, file: string) =>
		`@font-face { font-family: "JetBrains Mono"; font-style: normal; font-weight: ${weight}; ` +
		`ascent-override: 77%; descent-override: 23%; line-gap-override: 0%; ` +
		`src: url(${src(file)}) format("woff2"); }`;
	return [face(400, "jetbrains-mono-latin-400-normal.woff2"), face(700, "jetbrains-mono-latin-700-normal.woff2")].join(
		"\n",
	);
}

/** For served documents: the vendor routes. */
export function termFontUrlCss(): string {
	return faces((file) => `/vendor/fonts/${file}`);
}

let dataMemo: string | undefined;

/** For stills: the woff2 bytes inlined, so the SVG is self-contained. */
export function termFontDataCss(): string {
	if (dataMemo === undefined) {
		dataMemo = faces((file) => {
			const path = TERM_FONT_FILES[file] as string;
			return `data:font/woff2;base64,${readFileSync(path).toString("base64")}`;
		});
	}
	return dataMemo;
}
