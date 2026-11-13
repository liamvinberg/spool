import { expect, it, vi } from "vitest";
import { asSlide, followTimers, timerSlide, writersOf } from "./stage-writer";

it("names the slides whose code a write ran through: those reaching every slide module on its stack", () => {
	const base = "http://render-spool.localhost:7767/play/p/chunks";
	const reach = new Map<string, readonly string[]>([
		[`${base}/frames/talk/waits/frame-a1.js`, ["talk/waits"]],
		[`${base}/frames/talk/proto/frame-b2.js`, ["talk/proto"]],
		[`${base}/shared/ui/card-c3.js`, ["talk/proto", "talk/waits"]],
	]);
	const runtime = "http://render-spool.localhost:7767/runtime/spool.js";
	// Chromium's stacks, and WebKit's
	const timer = `Error\n    at notify (${runtime}:10:4)\n    at Object.set (${runtime}:20:8)\n    at ${base}/frames/talk/waits/frame-a1.js:3:30`;
	expect(writersOf(timer, reach)).toEqual(new Set(["talk/waits"]));
	const through = `notify@${runtime}:10:4\nset@${runtime}:20:8\nsave@${base}/shared/ui/card-c3.js:9:2\nonClick@${base}/frames/talk/proto/frame-b2.js:7:11`;
	expect(writersOf(through, reach)).toEqual(new Set(["talk/proto"]));
	// code the two share, alone, could be either's
	expect(writersOf(`at save (${base}/shared/ui/card-c3.js:9:2)`, reach)).toEqual(
		new Set(["talk/proto", "talk/waits"]),
	);
	// the runtime's own write is no slide's
	expect(writersOf(`at notify (${runtime}:10:4)`, reach)).toBeUndefined();
});

it("runs a timer as the slide it was set as, and the timers it sets in turn, whatever code it runs through", () => {
	vi.useFakeTimers();
	try {
		// Node's timers, typed as the stage's document has them
		const scope = { setTimeout, setInterval } as unknown as Pick<Window, "setTimeout" | "setInterval">;
		followTimers(scope);
		const heard: (string | undefined)[] = [];
		asSlide("talk/waits", () =>
			scope.setTimeout(() => {
				heard.push(timerSlide());
				scope.setTimeout(() => heard.push(timerSlide()), 10);
			}, 10),
		);
		scope.setTimeout(() => heard.push(timerSlide()), 5);
		vi.advanceTimersByTime(30);
		expect(heard).toEqual([undefined, "talk/waits", "talk/waits"]);
		expect(timerSlide()).toBeUndefined();
	} finally {
		vi.useRealTimers();
	}
});
