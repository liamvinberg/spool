import { describe, expect, it } from "vitest";
import { createPlayerRecorder, type RecorderHost } from "./player-recorder";
import { type ClipAspect, RECORD_LIMIT_MS } from "./record-protocol";

function setup(render: RecorderHost["render"] = async () => new Blob(["clip"])) {
	const noted: boolean[] = [];
	const shapes: (ClipAspect | null)[] = [];
	const reopened: ClipAspect[] = [];
	const timers: { run: () => void; ms: number }[] = [];
	const renders: object[] = [];
	const downloads: string[] = [];
	const recorder = createPlayerRecorder("default", {
		note: (on) => noted.push(on),
		shape: (aspect) => shapes.push(aspect),
		reopen: (aspect) => reopened.push(aspect),
		frame: () => "flows/checkout",
		render: (body, progress) => {
			renders.push(body);
			return render(body, progress);
		},
		download: (_clip, name) => downloads.push(name),
		now: () => 0,
		later: (run, ms) => {
			const timer = { run, ms };
			timers.push(timer);
			return () => timers.splice(timers.indexOf(timer), 1);
		},
	});
	return { recorder, noted, shapes, reopened, timers, renders, downloads };
}
const hands = { inputs: [], duration: 4000, w: 806, h: 806 };
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe("the player's Record", () => {
	it("plays the frame at each shape picked, and starts again recording at the one kept", () => {
		const { recorder, shapes, reopened } = setup();
		recorder.record();
		recorder.pick("1:1");
		recorder.begin();
		expect(shapes).toEqual(["16:9", "1:1"]);
		expect(reopened).toEqual(["1:1"]);
		recorder.dismiss();
		expect(shapes.at(-1)).toBeNull();
		expect(recorder.view().kind).toBe("idle");
	});

	it("stops itself at the limit and renders at its shape from the screen it started at, saying how far it has got", async () => {
		let report: (done: number) => void = () => {};
		let finish: (clip: Blob) => void = () => {};
		const { recorder, noted, timers, renders, downloads } = setup((_body, progress) => {
			report = progress;
			return new Promise((done) => {
				finish = done;
			});
		});
		recorder.start("1:1");
		timers.find((timer) => timer.ms === RECORD_LIMIT_MS)?.run();
		expect(noted).toEqual([true, false]);
		recorder.heard(hands);
		report(0.4);
		expect(recorder.view()).toEqual({ kind: "rendering", progress: 0.4 });
		finish(new Blob(["clip"]));
		await settle();
		expect(renders).toEqual([
			{
				frame: "flows/checkout",
				scenario: "default",
				viewport: { w: 806, h: 806 },
				duration: 4000,
				aspect: "1:1",
				inputs: [],
			},
		]);
		expect(downloads).toEqual(["checkout.mp4"]);
		expect(recorder.view()).toEqual({ kind: "saved", name: "checkout.mp4" });
	});

	it("takes Escape in the frame as the stop, and the limit no longer fires", () => {
		const { recorder, timers } = setup();
		recorder.start("16:9");
		recorder.heard(hands);
		expect(recorder.view().kind).toBe("rendering");
		expect(timers).toEqual([]);
	});

	it("keeps the recording when a render fails, so the clip can be asked for again", async () => {
		let fail = true;
		const { recorder, renders } = setup(async () => {
			if (fail) throw new Error("the shell is missing");
			return new Blob(["clip"]);
		});
		recorder.start("16:9");
		recorder.stop();
		recorder.heard(hands);
		await settle();
		expect(recorder.view()).toEqual({ kind: "failed", message: "the shell is missing" });
		fail = false;
		recorder.retry();
		await settle();
		expect(renders).toHaveLength(2);
		expect(recorder.view().kind).toBe("saved");
	});
});
