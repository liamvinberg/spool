// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapturedFrame } from "../canvas/frame-export";
import { exportTalk } from "./talk-export";

/** The PDF is built off the thread in the window; here its pages are the captures it was handed, in order. */
const built = vi.hoisted(() => ({ pages: [] as string[] }));
vi.mock("../canvas/frame-export", async (actual) => ({
	...(await actual<typeof import("../canvas/frame-export")>()),
	buildFramePdf: async (frames: readonly CapturedFrame[]) => {
		built.pages = frames.map((frame) => frame.name);
		return new Uint8Array([37, 80, 68, 70]);
	},
	downloadBytes: () => {},
}));

afterEach(() => {
	built.pages = [];
});

const talk = { project: "kaffe", page: "pitch", slides: ["pitch/title", "pitch/gl", "pitch/end"] };
const picture = (name: string): CapturedFrame => ({ name, width: 1280, height: 720, png: new Uint8Array() });

describe("a talk's PDF", () => {
	it("leaves out a slide that won't capture and names it, keeping the rest in the talk's order", async () => {
		const capture = (frame: string) =>
			frame === "pitch/gl" ? Promise.reject(new Error("lost its context")) : Promise.resolve(picture(frame));

		const saved = await exportTalk(talk, "pdf", capture, () => {});

		expect(built.pages).toEqual(["pitch/title", "pitch/end"]);
		expect(saved.file).toBe("pitch.pdf");
		expect(saved.left).toEqual(["gl"]);
	});

	it("fails whole when no slide captures", async () => {
		await expect(
			exportTalk(
				talk,
				"pdf",
				() => Promise.reject(new Error("gone")),
				() => {},
			),
		).rejects.toThrow("No slide of the talk could be captured");
	});
});
