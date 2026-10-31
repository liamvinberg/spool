/**
 * Frames draw at the size they are shown (spool#218, the `frame-resolution`
 * experiment). A live frame on the canvas is shown at the camera's zoom, but a
 * canvas or WebGL surface sized `clientWidth * devicePixelRatio` fills its
 * backing store at the full screen density whatever that zoom is: at k 0.34 on
 * a Retina screen that is 8.65 pixels drawn for every one shown.
 *
 * With the experiment on, the canvas tells the document the density it is
 * actually shown at, and this is what frame code reads as devicePixelRatio.
 * The first value rides the iframe's name, read here before any frame module
 * runs, so code that reads the density once at mount reads the right one; a
 * later {spool:"resolution", dpr} changes it and fires the resize code written
 * the usual way already redraws on. The canvas only sends one at rest and to a
 * frame that is not frozen, so a redraw is never left blank behind a held rAF.
 *
 * The export capture reads the real density (`realDevicePixelRatio`): an
 * export is the frame at full resolution, not at the zoom it was standing at.
 */
const NAME_PREFIX = "spool-dpr=";

const own = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
const inherited = Object.getOwnPropertyDescriptor(Window.prototype, "devicePixelRatio");
const realGetter = (own ?? inherited)?.get;
const realValue = own && "value" in own ? Number(own.value) : 1;

export function realDevicePixelRatio(): number {
	try {
		return realGetter ? Number(realGetter.call(window)) || 1 : realValue;
	} catch {
		return realValue;
	}
}

let shown: number | null = null;

function parseDpr(value: unknown): number | null {
	const dpr = typeof value === "string" ? Number(value) : value;
	return typeof dpr === "number" && Number.isFinite(dpr) && dpr > 0 && dpr <= 16 ? dpr : null;
}

export function shownDensity(): void {
	try {
		if (window.name.startsWith(NAME_PREFIX)) shown = parseDpr(window.name.slice(NAME_PREFIX.length));
	} catch {}
	try {
		Object.defineProperty(window, "devicePixelRatio", {
			configurable: true,
			enumerable: true,
			get: () => shown ?? realDevicePixelRatio(),
			// the attribute is [Replaceable]: an assignment replaces it for good
			set(value: unknown) {
				Object.defineProperty(window, "devicePixelRatio", {
					configurable: true,
					enumerable: true,
					writable: true,
					value,
				});
			},
		});
	} catch {}
}

/** The canvas says this document is now shown at `dpr` device pixels per CSS pixel. */
export function setShownDensity(value: unknown): void {
	const dpr = parseDpr(value);
	if (dpr === null || dpr === (shown ?? realDevicePixelRatio())) return;
	shown = dpr;
	dispatchEvent(new Event("resize"));
}
