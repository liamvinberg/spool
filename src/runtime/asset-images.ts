import { isAssetUrl } from "../daemon/assets";

/**
 * An imported image's URL (#216) is the render host's, and a frame is a
 * sandboxed document with an opaque origin, so every one is cross-origin to the
 * frame that shows it. Loaded plainly it displays, but a canvas it is drawn into
 * can no longer be read back and WebGL refuses it as a texture, where the data
 * URL it used to be never stopped either. So an image element pointed at one
 * loads it under CORS, which the asset route always allows, unless its author
 * chose a mode: whichever way it was pointed there, a JSX `src`, `new Image()`,
 * `setAttribute` or a `<picture>` source, before the load the change starts.
 */
export function loadAssetImagesUnderCors(): void {
	const names = (name: string, value: unknown): boolean => {
		const urls =
			name === "srcset"
				? String(value)
						.split(",")
						.map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
				: [String(value)];
		return urls.some((url) => isAssetUrl(url, document.baseURI));
	};
	const cors = (element: HTMLImageElement): void => {
		if (element.getAttribute("crossorigin") === null) element.crossOrigin = "anonymous";
	};
	// a picture's img loads whichever candidate its sources offer, so one naming an asset is the img's to load
	const pictureImages = (picture: Node | null): void => {
		if (!(picture instanceof HTMLPictureElement)) return;
		for (const img of picture.querySelectorAll<HTMLImageElement>(":scope > img")) cors(img);
	};
	const offersAsset = (picture: Node | null): boolean =>
		picture instanceof HTMLPictureElement &&
		Array.from(picture.querySelectorAll(":scope > source")).some((source) =>
			names("srcset", source.getAttribute("srcset") ?? ""),
		);
	const corsFor = (element: Element, name: string, value: unknown): void => {
		if ((name !== "src" && name !== "srcset") || !names(name, value)) return;
		if (element instanceof HTMLImageElement) cors(element);
		else if (element instanceof HTMLSourceElement && name === "srcset") pictureImages(element.parentNode);
	};
	for (const prototype of [HTMLImageElement.prototype, HTMLSourceElement.prototype]) {
		for (const name of ["src", "srcset"]) {
			const property = Object.getOwnPropertyDescriptor(prototype, name);
			const set = property?.set;
			if (property === undefined || set === undefined) continue;
			Object.defineProperty(prototype, name, {
				...property,
				set(this: Element, value: unknown) {
					corsFor(this, name, value);
					set.call(this, value);
				},
			});
		}
	}
	const setAttribute = Element.prototype.setAttribute;
	Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
		corsFor(this, String(name).toLowerCase(), value);
		setAttribute.call(this, name, value);
	};
	// a source and its img meet in a picture in either order
	const placed = (parent: Node, child: Node): void => {
		if (child instanceof HTMLSourceElement && names("srcset", child.getAttribute("srcset") ?? ""))
			pictureImages(parent);
		else if (child instanceof HTMLImageElement && offersAsset(parent)) cors(child);
	};
	const appendChild = Node.prototype.appendChild;
	Node.prototype.appendChild = function <T extends Node>(this: Node, child: T): T {
		placed(this, child);
		return appendChild.call(this, child) as T;
	};
	const insertBefore = Node.prototype.insertBefore;
	Node.prototype.insertBefore = function <T extends Node>(this: Node, child: T, before: Node | null): T {
		placed(this, child);
		return insertBefore.call(this, child, before) as T;
	};
}
