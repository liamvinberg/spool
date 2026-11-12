import { useEffect, useSyncExternalStore } from "react";
import { coverUrl } from "../api";
import type { CanvasStore } from "../canvas/canvas-store";
import { usePresentAsk } from "./present";

/**
 * A slide's opening still (spool#319): the photo booth's picture of it, big enough to fill a 4K screen, on the beat the
 * talk opens on, which Present flies in place of the cover, sharp the whole way and the same slide the stage puts on
 * when it lands. It is decoded ahead of the flight, while the slide is the one Present would play from and at Present
 * at the latest, and only a decoded one ever flies: decoding it mid-flight would hold up the frames it flies in. A slide
 * whose still is not taken yet, or is of an older version, flies as its cover, as before.
 *
 * A decoded 4K still is about 33 MB, so one is held at a time: the one asked for last. The flight takes it as it sets
 * off and lets it go once the live slide has taken over; the slide Present would play from is decoded again once the
 * talk is over.
 */

/** the one decoded picture held, and the address asked for last, which is the only one a finished decode is held for */
let held: { url: string; image: HTMLImageElement } | undefined;
let wanted: string | undefined;
const decoding = new Map<string, Promise<HTMLImageElement | null>>();

/** The address of a frame's opening still, when the booth has taken one of its current version. */
export function openingOf(store: CanvasStore, project: string, frame: string): string | undefined {
	const cover = store.get().frames.find((one) => one.name === frame)?.cover;
	return cover?.opening === undefined ? undefined : coverUrl(project, frame, cover.opening);
}

/**
 * The picture at `url`, decoded once however often it is asked for; null when it would not load. It is held decoded
 * until another is asked for, or it is let go.
 */
export function readyPicture(url: string): Promise<HTMLImageElement | null> {
	wanted = url;
	if (held?.url === url) return Promise.resolve(held.image);
	const going = decoding.get(url);
	if (going !== undefined) return going;
	const image = new Image();
	image.alt = "";
	image.draggable = false;
	image.src = url;
	const ready = image.decode().then(
		() => {
			if (wanted === url) held = { url, image };
			return image;
		},
		() => null,
	);
	decoding.set(url, ready);
	void ready.finally(() => decoding.delete(url));
	return ready;
}

/** The picture at `url`, when it is decoded and held already. */
export function decodedPicture(url: string | undefined): HTMLImageElement | undefined {
	return url !== undefined && held?.url === url ? held.image : undefined;
}

/** Nothing is to stay decoded for `url`: a flight that took its picture keeps it, until it drops it. */
export function letGo(url: string): void {
	if (wanted === url) wanted = undefined;
	if (held?.url === url) held = undefined;
}

/**
 * Keeps the opening still of `frame`, the slide Present would play from, decoded as soon as the booth has one, and
 * again once a talk that let it go is over; let go when the slide changes or the canvas goes. A talk on takes it as it
 * is, and lets it go itself.
 */
export function useOpeningReady(store: CanvasStore, project: string, frame: string | undefined): void {
	const url = useSyncExternalStore(store.subscribe, () =>
		frame === undefined ? undefined : openingOf(store, project, frame),
	);
	const talking = usePresentAsk() !== null;
	useEffect(() => {
		if (url !== undefined && !talking) void readyPicture(url);
	}, [url, talking]);
	useEffect(() => {
		if (url !== undefined) return () => letGo(url);
	}, [url]);
}
