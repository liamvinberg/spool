import { useEffect, useSyncExternalStore } from "react";
import { coverUrl } from "../api";
import type { CanvasStore } from "../canvas/canvas-store";

/**
 * A slide's opening still (spool#319): the photo booth's picture of it at the size a talk draws it, on the beat the
 * talk opens on, which Present flies in place of the cover, sharp the whole way and the same slide the stage puts on
 * when it lands. It is decoded ahead of the flight, while the slide is the one Present would play from and at Present
 * at the latest, and only a decoded one ever flies: decoding it mid-flight would hold up the frames it flies in. A slide
 * whose still is not decoded by then, or not taken yet, flies as its cover, as before.
 */

/** How many decoded pictures are kept: the slide Present would play from, and the few held before it. */
const KEPT = 4;
/** the decoded pictures by address, the latest last; each holds its decoded image for as long as it is kept */
const decoded = new Map<string, HTMLImageElement>();
const decoding = new Map<string, Promise<HTMLImageElement | null>>();

/** The address of a frame's opening still, when the booth has taken one. */
export function openingOf(store: CanvasStore, project: string, frame: string): string | undefined {
	const cover = store.get().frames.find((one) => one.name === frame)?.cover;
	return cover?.opening === undefined ? undefined : coverUrl(project, frame, cover.opening);
}

/** The picture at `url`, decoded once however often it is asked for; null when it would not load. */
export function readyPicture(url: string): Promise<HTMLImageElement | null> {
	const done = decoded.get(url);
	if (done !== undefined) {
		decoded.delete(url);
		decoded.set(url, done);
		return Promise.resolve(done);
	}
	const going = decoding.get(url);
	if (going !== undefined) return going;
	const image = new Image();
	image.alt = "";
	image.draggable = false;
	image.src = url;
	const ready = image.decode().then(
		() => {
			decoded.set(url, image);
			for (const old of decoded.keys()) {
				if (decoded.size <= KEPT) break;
				decoded.delete(old);
			}
			return image;
		},
		() => null,
	);
	decoding.set(url, ready);
	void ready.finally(() => decoding.delete(url));
	return ready;
}

/** The picture at `url`, when it is decoded already. */
export function decodedPicture(url: string | undefined): HTMLImageElement | undefined {
	return url === undefined ? undefined : decoded.get(url);
}

/** Keeps the opening still of `frame`, the slide Present would play from, decoded, as soon as the booth has one. */
export function useOpeningReady(store: CanvasStore, project: string, frame: string | undefined): void {
	const url = useSyncExternalStore(store.subscribe, () =>
		frame === undefined ? undefined : openingOf(store, project, frame),
	);
	useEffect(() => {
		if (url !== undefined) void readyPicture(url);
	}, [url]);
}
