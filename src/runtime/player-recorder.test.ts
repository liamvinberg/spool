import { describe, expect, it } from "vitest";
import { createPlayerRecorder, type RecorderHost } from "./player-recorder";
import { RECORD_LIMIT_MS } from "./record-protocol";

function setup(render: RecorderHost["render"] = async () => new Blob(["clip"])) {
	const noted: boolean[] = [];
	const timers: { run: () => void; ms: number }[] = [];
	const renders: object[] = [];
	const downloads: string[] = [];
	const recorder = createPlayerRecorder("default", {
		note: (on) => noted.push(on),
		reopen: () => {},
		frame: () => "flows/checkout",
		render: (body) => {
			renders.push(body);
			return render(body);
		},
		download: (_clip, name) => downloads.push(name),
		now: () => 0,
		later: (run, ms) => {
			const timer = { run, ms };
			timers.push(timer);
			return () => timers.splice(timers.indexOf(timer), 1);
		},
	});
	return { recorder, noted, timers, renders, downloads };
}
const hands = { inputs: [], duration: 4000, w: 390, h: 844 };
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe("the player's Record", () => {
	it("stops itself at the limit, then renders the shape picked from the screen it started at", async () => {
		const { recorder, noted, timers, renders, downloads } = setup();
		recorder.start();
		const limit = timers.find((timer) => timer.ms === RECORD_LIMIT_MS);
		limit?.run();
		expect(noted).toEqual([true, false]);
		recorder.heard(hands);
		recorder.save("1:1");
		await settle();
		expect(renders).toEqual([
			{
				frame: "flows/checkout",
				scenario: "default",
				viewport: { w: 390, h: 844 },
				duration: 4000,
				aspect: "1:1",
				inputs: [],
			},
		]);
		expect(downloads).toEqual(["checkout.mp4"]);
		expect(recorder.view().kind).toBe("saved");
	});

	it("takes Escape in the frame as the stop, and the limit no longer fires", () => {
		const { recorder, timers } = setup();
		recorder.start();
		recorder.heard(hands);
		expect(recorder.view().kind).toBe("choosing");
		expect(timers).toEqual([]);
	});

	it("keeps the recording when a render fails, so the clip can be asked for again", async () => {
		let fail = true;
		const { recorder, renders } = setup(async () => {
			if (fail) throw new Error("the shell is missing");
			return new Blob(["clip"]);
		});
		recorder.start();
		recorder.stop();
		recorder.heard(hands);
		recorder.save("16:9");
		await settle();
		expect(recorder.view()).toEqual({ kind: "failed", message: "the shell is missing" });
		fail = false;
		recorder.save("16:9");
		await settle();
		expect(renders).toHaveLength(2);
		expect(recorder.view().kind).toBe("saved");
	});
});
