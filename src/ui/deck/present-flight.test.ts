import { expect, it } from "vitest";
import { createFlight, type Pose, tune } from "./present-flight";

const card: Pose = { x: 400, y: 300, w: 160, r: 6 };
const screen: Pose = { x: 0, y: 0, w: 1440, r: 0 };

/** Frames of a sixtieth of a second until it rests, each pose as drawn. */
function run(flight: ReturnType<typeof createFlight>, frames = 600): Pose[] {
	const drawn: Pose[] = [];
	for (let frame = 0; frame < frames && flight.step(1 / 60); frame++) drawn.push(flight.pose());
	return drawn;
}

it("flies with no bounce in its duration, as the design's Motion spring of that duration, landing once without passing its mark", () => {
	const flight = createFlight(card, tune(0.5, 0));
	let landings = 0;
	flight.aim(screen, () => landings++);
	const drawn = run(flight);
	expect(landings).toBe(1);
	expect(drawn.at(-1)).toEqual(screen);
	// never past its mark, and never back the way it came
	for (const [index, pose] of drawn.entries()) {
		expect(pose.w).toBeLessThanOrEqual(screen.w);
		expect(pose.w).toBeGreaterThanOrEqual(drawn[index - 1]?.w ?? card.w);
	}
	// within a few pixels of its mark a frame before its half second, and on it, at rest, at its half second, as the
	// design's Motion spring of that duration is
	expect(screen.w - (drawn[28]?.w ?? 0)).toBeLessThan(3);
	expect(drawn.length).toBe(30);
});

it("turns round from where it is at the speed it has, lands only where it was last aimed, and stays put on screen as the window moves", () => {
	const flight = createFlight(card, tune(0.5, 0));
	const landed: string[] = [];
	flight.aim(screen, () => landed.push("screen"));
	for (let frame = 0; frame < 9; frame++) flight.step(1 / 60);
	const mid = flight.pose();
	flight.aim(card, () => landed.push("card"));
	// its speed kept, never a jump: a frame on it stands further out than a slide turned from rest there would
	const rested = createFlight(mid, tune(0.5, 0));
	rested.aim(card);
	flight.step(1 / 60);
	rested.step(1 / 60);
	expect(flight.pose().w).toBeGreaterThan(rested.pose().w);
	expect(Math.abs(flight.pose().w - mid.w)).toBeLessThan(40);
	// the window moved 100 px right under it: on screen it stands where it stood
	const before = flight.pose();
	flight.shift(-100, 0);
	expect(flight.pose().x).toBe(before.x - 100);
	flight.aim({ ...card, x: card.x - 100 }, () => landed.push("card"));
	run(flight);
	expect(landed).toEqual(["card"]);
	expect(flight.pose()).toEqual({ ...card, x: card.x - 100 });
});
