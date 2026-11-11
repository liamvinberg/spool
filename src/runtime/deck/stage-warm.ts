/**
 * What a slide still needs from the network and the decoders once it has been rendered out of sight (spool#265): the
 * fonts its styles name and the images it draws, fetched and decoded in this document. Only this document's own loads
 * count: a font loaded or an image decoded in another document is a cached file here, still to be decoded, and a slide
 * swapped in on it paints its fallback font or an empty box for a frame or more.
 *
 * A face a slide's own stylesheet declares is not the document's until that sheet is switched on, and then it is a new
 * face, unloaded, that fetches its file again and lays the slide out in a fallback until it comes (unless the browser
 * happens to hold the file in its memory cache, which a server's `no-store` or a disabled cache rules out). So each
 * such face is loaded here as a face of its own, and the slide wears it (`wear`) the moment it goes on screen: a
 * loaded face added after the sheet's identical one is the one the text is set in, from the first frame.
 */

/** Fonts and images a slide holds while it is near, so the browser keeps them decoded. */
export interface Warmed {
	/** its stylesheet's own faces, loaded, for it to wear while it is on screen */
	readonly fonts: FontFace[];
	readonly images: HTMLImageElement[];
	/** what would not load or decode in time, each by its face or its address: the slide is not ready while any is */
	readonly failed: readonly string[];
}

let worn: readonly FontFace[] = [];

/** The faces of the slide going on screen, and none of the one before: called before it is laid out. */
export function wear(fonts: readonly FontFace[]): void {
	for (const face of worn) if (!fonts.includes(face)) document.fonts.delete(face);
	for (const face of fonts) if (!worn.includes(face)) document.fonts.add(face);
	worn = fonts;
}

/**
 * Warm everything a slide rendered into `box` shows on its first frame: its `<img>`s decoded where they stand, the
 * images its stylesheet and inline styles draw, the pictures it was seen to reach for as it showed (`learned`), and
 * the fonts its stylesheet declares or names. Never rejects: what would not load, or not in time, is named in `failed`.
 */
export async function warmSlide(
	box: Element,
	sheet: CSSStyleSheet | null,
	text: string,
	learned: readonly string[] = [],
): Promise<Warmed> {
	const rules = sheet === null ? [] : flatRules(sheet);
	// a family is named in the slide's stylesheet, or in a style the slide writes on an element itself
	const inline = [...box.querySelectorAll<HTMLElement>("[style]")].map((element) => element.style.cssText);
	const { own, document: shared } = fontsOf(rules, [text, ...inline].join("\n"));
	const urls = new Set<string>([...cssImagesFor(rules, box), ...inlineImages(box), ...learned]);
	const images = [...urls].map((url) => {
		const image = new Image();
		image.src = url;
		return image;
	});
	const placed = [...box.querySelectorAll("img")];
	for (const img of placed) {
		// out of sight, a lazy image waits for a viewport it is never in
		if (img.loading === "lazy") img.loading = "eager";
	}
	const faces = [...own, ...shared];
	const loaded = await Promise.all(
		faces.map((face) =>
			face.load().then(
				() => face,
				() => undefined,
			),
		),
	);
	const pictures = [...placed, ...images];
	const came = await Promise.all(pictures.map((img) => decoded(img)));
	const failed = [
		...faces.filter((face) => !loaded.includes(face)).map((face) => `the face ${unquote(face.family)}`),
		...pictures.filter((_, index) => !came[index]).map((img) => img.currentSrc || img.src),
	];
	return { fonts: own.filter((face) => loaded.includes(face)), images, failed };
}

const DECODE_PATIENCE_MS = 20_000;

/** Whether an image decoded; false once it failed, or was given up on: a picture never holds the talk for ever. */
function decoded(img: HTMLImageElement): Promise<boolean> {
	if (!img.getAttribute("src") && !img.getAttribute("srcset")) return Promise.resolve(true);
	return new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => resolve(false), DECODE_PATIENCE_MS);
		img.decode().then(
			() => {
				clearTimeout(timer);
				resolve(true);
			},
			() => {
				clearTimeout(timer);
				resolve(false);
			},
		);
	});
}

/**
 * The pictures a slide on screen is still waiting for: `<img>`s its effects gave an address as it mounted, which
 * nothing rendered out of sight could have warmed.
 */
export function stillComing(box: Element): string[] {
	return [...box.querySelectorAll("img")]
		.filter((img) => (img.getAttribute("src") || img.getAttribute("srcset")) && !img.complete)
		.map((img) => img.currentSrc || img.src)
		.filter((url) => url !== "");
}

/** Every rule of a sheet, the ones inside layers, media and supports blocks included. */
function flatRules(sheet: CSSStyleSheet): CSSRule[] {
	const out: CSSRule[] = [];
	const walk = (list: CSSRuleList | undefined) => {
		if (list === undefined) return;
		for (const rule of list) {
			out.push(rule);
			if (rule instanceof CSSImportRule) {
				try {
					walk(rule.styleSheet?.cssRules);
				} catch {
					// a sheet from another origin keeps its rules to itself
				}
			} else if ("cssRules" in rule) {
				walk((rule as CSSGroupingRule).cssRules);
			}
		}
	};
	try {
		walk(sheet.cssRules);
	} catch {
		// as above
	}
	return out;
}

const unquote = (family: string) => family.trim().replace(/^["']|["']$/g, "");

/**
 * The faces a slide's stylesheet declares, as faces of their own to load (`own`), and the faces this document already
 * declares whose family the slide names, to load where they are (`document`).
 */
function fontsOf(rules: readonly CSSRule[], text: string): { own: FontFace[]; document: FontFace[] } {
	const faces: FontFace[] = [];
	for (const rule of rules) {
		if (!(rule instanceof CSSFontFaceRule)) continue;
		const style = rule.style;
		const family = unquote(style.getPropertyValue("font-family"));
		const src = style.getPropertyValue("src");
		if (family === "" || src === "") continue;
		const descriptor = (name: string) => style.getPropertyValue(name).trim() || undefined;
		const descriptors: FontFaceDescriptors = {};
		const weight = descriptor("font-weight");
		const fontStyle = descriptor("font-style");
		const stretch = descriptor("font-stretch");
		const range = descriptor("unicode-range");
		if (weight !== undefined) descriptors.weight = weight;
		if (fontStyle !== undefined) descriptors.style = fontStyle;
		if (stretch !== undefined) descriptors.stretch = stretch;
		if (range !== undefined) descriptors.unicodeRange = range;
		try {
			faces.push(new FontFace(family, src, descriptors));
		} catch {
			// a face the browser cannot read is one the sheet cannot use either
		}
	}
	const named = new Set(faces.map((face) => face.family));
	const shared: FontFace[] = [];
	for (const face of document.fonts) {
		const family = unquote(face.family);
		if (face.status === "unloaded" && !named.has(family) && text.includes(family)) shared.push(face);
	}
	return { own: faces, document: shared };
}

const URL_IN = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;

function urlsIn(value: string): string[] {
	const found: string[] = [];
	for (const match of value.matchAll(URL_IN)) {
		const raw = match[2];
		if (raw === undefined || raw.startsWith("#")) continue;
		try {
			found.push(new URL(raw, document.baseURI).href);
		} catch {
			// not an address
		}
	}
	return found;
}

/** The images the stylesheet draws on something this slide rendered. */
function cssImagesFor(rules: readonly CSSRule[], box: Element): string[] {
	const found: string[] = [];
	for (const rule of rules) {
		if (!(rule instanceof CSSStyleRule) || !rule.style.cssText.includes("url(")) continue;
		// a pseudo-element is drawn on its element, so the element is what has to be there
		const selector = rule.selectorText.replace(
			/::?(before|after|marker|placeholder|backdrop|first-line|first-letter)/g,
			"",
		);
		try {
			if (box.querySelector(selector) === null) continue;
		} catch {
			continue;
		}
		found.push(...urlsIn(rule.style.cssText));
	}
	return found;
}

function inlineImages(box: Element): string[] {
	const found: string[] = [];
	for (const element of box.querySelectorAll<HTMLElement>("[style*='url(']"))
		found.push(...urlsIn(element.style.cssText));
	return found;
}
