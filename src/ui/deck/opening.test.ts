import { afterEach, expect, it, vi } from "vitest";
import { decodedPicture, letGo, readyPicture } from "./opening";

/** Images whose decodes finish when the test says, by address. */
function controlledImages() {
	const finish = new Map<string, () => void>();
	class ControlledImage {
		alt = "";
		draggable = true;
		src = "";
		decode() {
			return new Promise<void>((done) => finish.set(this.src, done));
		}
	}
	vi.stubGlobal("Image", ControlledImage);
	return async (url: string) => {
		finish.get(url)?.();
		await Promise.resolve();
		await Promise.resolve();
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	for (const url of ["/a", "/b", "/c"]) letGo(url);
});

// a decoded 4K still is about 33 MB: a talk of 30 slides must never hold 30 of them (spool#319)
it("holds one decoded picture, the one asked for last whichever decode finishes first, until the flight lets it go", async () => {
	const finish = controlledImages();
	const a = readyPicture("/a");
	void readyPicture("/b");
	void readyPicture("/c");
	await finish("/c");
	await finish("/a");
	await finish("/b");
	expect(decodedPicture("/c")).toBeDefined();
	expect(decodedPicture("/a")).toBeUndefined();
	expect(decodedPicture("/b")).toBeUndefined();
	// a caller still gets the picture it asked for, to fly it
	expect(await a).not.toBeNull();
	letGo("/c");
	expect(decodedPicture("/c")).toBeUndefined();
});
