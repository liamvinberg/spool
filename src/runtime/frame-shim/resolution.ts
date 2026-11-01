import { nativeRaf, shimConfig } from "./natives";

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
 * Code that read the density once and never again (a canvas sized at mount)
 * cannot follow a change: when the density goes up, the shim watches whether
 * the frame reads it again by two frames after the resize, and if a frame that
 * read it once did not, asks the canvas to reload it behind its last paint
 * ({spool:"resolution-reload"}), to boot again at the new density. Going down
 * needs nothing: drawn finer than shown is only cost.
 *
 * An export is the frame at the screen's density, not the zoom it stood at:
 * the capture lifts it to the real density for as long as it takes
 * (`atFullDensity`), and says so when the frame cannot follow without a reload.
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
/** Whether frame code has read devicePixelRatio, ever and since the last change. */
let readEver = false;
let readSince = false;

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
			get: () => {
				readEver = true;
				readSince = true;
				return shown ?? realDevicePixelRatio();
			},
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

const twoFrames = () => new Promise<void>((done) => nativeRaf(() => nativeRaf(() => done())));

/**
 * Change the density and tell the frame. Resolves whether the frame followed
 * it: true unless the density went up and a frame that read it before did not
 * read it again by two frames on.
 */
async function changeDensity(next: number | null): Promise<boolean> {
	const was = shown ?? realDevicePixelRatio();
	shown = next;
	const now = shown ?? realDevicePixelRatio();
	if (now === was) return true;
	readSince = false;
	dispatchEvent(new Event("resize"));
	if (now < was || !readEver) return true;
	await twoFrames();
	return readSince;
}

/** The canvas says this document is now shown at `dpr` device pixels per CSS pixel. */
export async function setShownDensity(value: unknown): Promise<void> {
	const dpr = parseDpr(value);
	if (dpr === null) return;
	if (!(await changeDensity(dpr))) askReload();
}

function askReload(): void {
	parent.postMessage({ spool: "resolution-reload", frame: shimConfig().frame }, "*");
}

/**
 * Run `capture` with the frame drawn at the screen's density, then put the
 * shown one back. A frame that cannot follow without a reload is asked to be
 * reloaded and the capture fails, for the canvas to take again from the
 * reloaded document: an export is never softer than the screen.
 */

export async function atFullDensity<T>(capture: () => Promise<T>): Promise<T> {
	const kept = shown;
	if (kept === null || kept >= realDevicePixelRatio()) return capture();
	try {
		if (!(await changeDensity(null))) {
			askReload();
			throw new Error("frame reloads at the screen's density");
		}
		return await capture();
	} finally {
		void changeDensity(kept);
	}
}
