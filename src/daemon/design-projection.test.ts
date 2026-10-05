import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, writeDesignFile, writeFrame, writePageFrame } from "../test-helpers";
import { memoryDesignFiles } from "./design-files";
import { projectDesign } from "./design-projection";
import { listProjectFrames } from "./projection";

/**
 * The cloud draws a team project's canvas from its copy of design/, never from
 * a disk. Whatever the daemon makes of a folder, the cloud must make of the
 * same files, or a frame would stand somewhere else in the browser than on the
 * Mac.
 */

const TSX = "export default () => null;\n";

function files(root: string): [string, Uint8Array][] {
	const design = join(root, "design");
	const walk = (dir: string): string[] =>
		readdirSync(dir).flatMap((name) => {
			const path = join(dir, name);
			return statSync(path).isDirectory() ? walk(path) : [path];
		});
	return walk(design).map((file) => [join("/copy/design", relative(design, file)), readFileSync(file)]);
}

describe("the canvas read from a copy of design/", () => {
	it("places frames, pages and the rail's order as the daemon does, and writes nothing", () => {
		const root = makeTempDir();
		writeDesignFile(root, "canvas.json", '{ "format": 2, "order": { "pages": ["shop", "about"] } }\n');
		writeFrame(root, "home", TSX);
		writeDesignFile(root, "frames/home/frame.json", '{ "x": 40, "y": -20, "w": 390, "h": 844 }\n');
		writeFrame(root, "sized", TSX);
		writeDesignFile(root, "frames/sized/frame.json", '{ "w": 1024, "h": 640 }\n');
		writeFrame(root, "bare", TSX);
		writePageFrame(root, "shop", "cart", TSX);
		writePageFrame(root, "shop/checkout", "pay", TSX);
		writePageFrame(root, "about", "team", TSX);
		writeDesignFile(root, "frames/about/team/frame.json", "{ not json");
		const copy = files(root);

		const cloud = projectDesign("/copy/design", memoryDesignFiles(copy));
		const daemon = listProjectFrames(root);

		expect(cloud.pages).toEqual(daemon.pages);
		expect(cloud.places).toEqual(daemon.places);
		expect(cloud.frames).toEqual(daemon.frames.map(({ born: _born, ...frame }) => frame));
		expect(cloud.order).toEqual({ pages: { "": ["shop", "about"] } });
		expect(cloud.frames.find((frame) => frame.name === "home")).toEqual({
			name: "home",
			x: 40,
			y: -20,
			w: 390,
			h: 844,
		});
	});

	it("reads an empty folder as an empty canvas", () => {
		expect(projectDesign("/nothing/design", memoryDesignFiles([]))).toEqual({
			pages: [],
			places: {},
			frames: [],
			order: {},
		});
	});
});
