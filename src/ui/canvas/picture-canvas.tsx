import { useLayoutEffect, useRef } from "react";
import type { CameraStore } from "./camera-store";
import { type PictureFrame, PictureLayer, type PictureReport } from "./picture-layer";

/**
 * Which frames a DOM shell is drawing, so the picture layer leaves them out.
 *
 * A shell claims its frame once it can show the frame's picture itself, and
 * gives it back when it unmounts (`FrameSlot` in `frame-shell.tsx`). The
 * claims outlive any one layer: a shell can mount before the canvas under it
 * has made its context, or keep its claim while a lost context is restored.
 */
export class PictureClaims {
	private readonly names = new Set<string>();
	private layer: PictureLayer | null = null;

	claim(name: string, claimed: boolean): void {
		if (claimed) this.names.add(name);
		else this.names.delete(name);
		this.layer?.claim(name, claimed);
	}

	attach(layer: PictureLayer | null): void {
		this.layer = layer;
		if (layer !== null) for (const name of this.names) layer.claim(name, true);
	}
}

/** The read-back a test or a bench finds on the canvas element (`[data-picture-layer]`). */
export interface PictureCanvasElement extends HTMLCanvasElement {
	spoolPictures?: () => PictureReport;
}

/**
 * The picture layer's canvas: viewport-sized, under the field that holds
 * documents and labels and over the one that holds arrows and pages, never a
 * hit target. It draws in the camera store's own callback, with the camera
 * that callback is drawing, so the pictures move in the very frame the DOM
 * around them does (#81's lockstep, measured in research rather than assumed).
 */
export function PictureCanvas({
	camera,
	frames,
	claims,
}: {
	camera: CameraStore;
	/** The page's frames in drawing order, each with its cover's address. */
	frames: readonly PictureFrame[];
	claims: PictureClaims;
}) {
	const element = useRef<PictureCanvasElement | null>(null);
	const layer = useRef<PictureLayer | null>(null);

	useLayoutEffect(() => {
		const canvas = element.current;
		if (canvas === null) return;
		const made = new PictureLayer(canvas);
		layer.current = made;
		claims.attach(made);
		canvas.spoolPictures = () => made.report();

		// The backing store in device pixels, exactly: a canvas a fraction of a
		// pixel off its box is resampled, and every picture on it softens. The
		// device box Chrome reports is the exact one, but not under an emulated
		// scale (a test's or a bench's), where it stays at CSS pixels; the box
		// times the ratio is the fallback whenever the two disagree.
		const measure = (width: number, height: number, device?: ResizeObserverSize) => {
			const ratio = devicePixelRatio;
			const exact =
				device !== undefined &&
				Math.abs(device.inlineSize - width * ratio) <= 1 &&
				Math.abs(device.blockSize - height * ratio) <= 1;
			made.resize(
				width,
				exact ? device.inlineSize : Math.round(width * ratio),
				exact ? device.blockSize : Math.round(height * ratio),
			);
		};
		const sized = new ResizeObserver(([entry]) => {
			if (entry !== undefined) {
				measure(entry.contentRect.width, entry.contentRect.height, entry.devicePixelContentBoxSize?.[0]);
			}
		});
		try {
			sized.observe(canvas, { box: "device-pixel-content-box" });
		} catch {
			sized.observe(canvas);
		}
		// a window moved to a screen of another density keeps its CSS size
		let density: MediaQueryList | null = null;
		const watchDensity = () => {
			density?.removeEventListener("change", onDensity);
			density = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
			density.addEventListener("change", onDensity);
		};
		const onDensity = () => {
			measure(canvas.clientWidth, canvas.clientHeight);
			watchDensity();
		};
		watchDensity();

		// the shell's own surface, read from the theme rather than restated here:
		// a look changed in settings, a system switch to dark, a palette edit
		const readSurface = () => made.setSurface(surfaceOf(canvas));
		readSurface();
		const looks = new MutationObserver(readSurface);
		looks.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-appearance", "style", "class"],
		});
		const scheme = matchMedia("(prefers-color-scheme: dark)");
		scheme.addEventListener("change", readSurface);

		return () => {
			sized.disconnect();
			density?.removeEventListener("change", onDensity);
			looks.disconnect();
			scheme.removeEventListener("change", readSurface);
			claims.attach(null);
			made.dispose();
			layer.current = null;
			delete canvas.spoolPictures;
		};
	}, [claims]);

	useLayoutEffect(() => {
		layer.current?.setFrames(frames);
	}, [frames]);

	useLayoutEffect(() => {
		layer.current?.draw(camera.get());
		return camera.subscribe((at, moving) => layer.current?.draw(at, moving));
	}, [camera]);

	return (
		<canvas
			ref={element}
			data-picture-layer=""
			// `text-surface` is not drawn: it is where the surface colour is read from
			className="pointer-events-none absolute inset-0 block h-full w-full text-surface"
		/>
	);
}

/** The computed `color` of the canvas, which its class makes the theme's surface. */
function surfaceOf(canvas: HTMLElement): readonly [number, number, number, number] {
	const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(canvas).color);
	if (match === null) return [0, 0, 0, 1];
	const [, r, g, b, a] = match;
	return [Number(r) / 255, Number(g) / 255, Number(b) / 255, a === undefined ? 1 : Number(a)];
}
