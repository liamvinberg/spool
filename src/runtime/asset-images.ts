import { isAssetUrl } from "../daemon/assets";

/**
 * An imported image's URL (#216) is the render host's, and a frame is a
 * sandboxed document with an opaque origin, so every one is cross-origin to the
 * frame that shows it. Loaded plainly it displays, but a canvas it is drawn into
 * can no longer be read back and WebGL refuses it as a texture, where the data
 * URL it used to be never stopped either. So an image element pointed at one
 * loads it under CORS, which the asset route always allows, unless its author
 * chose a mode: whichever way it was pointed there, a JSX `src`, `new Image()`
 * or `setAttribute`, before the load the change starts.
 */
export function loadAssetImagesUnderCors(): void {
	const image = HTMLImageElement.prototype;
	const corsFor = (element: HTMLImageElement, name: string, value: unknown): void => {
		if (element.getAttribute("crossorigin") !== null) return;
		const urls =
			name === "srcset"
				? String(value)
						.split(",")
						.map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
				: [String(value)];
		if (urls.some((url) => isAssetUrl(url, document.baseURI))) element.crossOrigin = "anonymous";
	};
	for (const name of ["src", "srcset"]) {
		const property = Object.getOwnPropertyDescriptor(image, name);
		const set = property?.set;
		if (property === undefined || set === undefined) continue;
		Object.defineProperty(image, name, {
			...property,
			set(this: HTMLImageElement, value: unknown) {
				corsFor(this, name, value);
				set.call(this, value);
			},
		});
	}
	const setAttribute = Element.prototype.setAttribute;
	Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
		const lowered = String(name).toLowerCase();
		if (this instanceof HTMLImageElement && (lowered === "src" || lowered === "srcset"))
			corsFor(this, lowered, value);
		setAttribute.call(this, name, value);
	};
}
