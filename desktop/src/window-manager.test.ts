import assert from "node:assert/strict";
import test from "node:test";
import { aerospace, aerospaceCandidates, holds, monitorNumber, moved, windowNumber } from "./window-manager";

const LAPTOP = { x: 0, y: 0, width: 1512, height: 982 };
const RIGHT = { x: 1512, y: 0, width: 1920, height: 1080 };
const ABOVE = { x: -200, y: -1080, width: 1920, height: 1080 };

test("monitors are numbered as AeroSpace numbers them: by left edge, then top, from 1", () => {
	// the room covering the laptop, with the external display as main or not, to its right or above it
	assert.equal(monitorNumber([RIGHT, LAPTOP], LAPTOP), 1);
	assert.equal(monitorNumber([LAPTOP, RIGHT], RIGHT), 2);
	assert.equal(monitorNumber([LAPTOP, ABOVE], LAPTOP), 2);
	assert.equal(monitorNumber([LAPTOP, { ...ABOVE, x: 0 }], LAPTOP), 2);
	// a window, by its middle; one off every display goes to the nearest
	assert.equal(monitorNumber([LAPTOP, RIGHT], { x: 1400, y: 100, width: 960, height: 540 }), 2);
	assert.equal(monitorNumber([LAPTOP, RIGHT], { x: 4000, y: 2000, width: 100, height: 100 }), 2);
	assert.equal(monitorNumber([], LAPTOP), undefined);
});

test("a window's number is read from its media source id", () => {
	assert.equal(windowNumber("window:35583:0"), 35583);
	assert.equal(windowNumber("screen:1:0"), undefined);
});

test("the command line is looked for where installs put it before the PATH an app from the Finder lacks", () => {
	const found = aerospaceCandidates("/Users/ana", "ana", "/usr/bin:relative:/opt/homebrew/bin:/Users/ana/bin");
	assert.deepEqual(found.slice(0, 2), ["/opt/homebrew/bin/aerospace", "/usr/local/bin/aerospace"]);
	assert.ok(found.includes("/Users/ana/.nix-profile/bin/aerospace"));
	assert.equal(found.at(-1), "/Users/ana/bin/aerospace");
	assert.equal(found.filter((one) => one === "/opt/homebrew/bin/aerospace").length, 1);
	assert.ok(!found.some((one) => one.startsWith("relative")));
});

test("a window is put back only when it stands elsewhere by more than a rounding", () => {
	assert.equal(moved(RIGHT, { ...RIGHT, y: 1 }), false);
	assert.equal(moved(RIGHT, { ...RIGHT, y: 30 }), true);
});

/** AeroSpace as its command line answers: which windows it knows, and which of them float. */
function fakeAerospace(windows: Record<number, "tiling" | "floating">, seenAfter = 0) {
	const said: string[] = [];
	let asked = 0;
	const run = async (args: readonly string[]) => {
		said.push(args.join(" "));
		const window = Number(args[args.indexOf("--window-id") + 1]);
		if (asked++ < seenAfter || windows[window] === undefined) return false;
		if (args[0] === "layout") {
			const to = args[1] as "tiling" | "floating";
			if (windows[window] === to && args.includes("--fail-if-noop")) return false;
			windows[window] = to;
		}
		return true;
	};
	let clock = 0;
	const told = aerospace(
		run,
		async (ms) => {
			clock += ms;
		},
		() => clock,
	);
	return { said, told, windows };
}

test("a tiled window is floated and moved to its display for the talk, and tiled again after", async () => {
	const { said, told, windows } = fakeAerospace({ 7: "tiling" });
	assert.deepEqual(await told.lift(7, 2), { tiled: true });
	assert.deepEqual(said, ["layout floating --fail-if-noop --window-id 7", "move-node-to-monitor --window-id 7 2"]);
	await told.tile(7);
	assert.equal(windows[7], "tiling");
});

test("a window already floating, as a user may keep spool's, is not to be tiled after", async () => {
	const { told, windows } = fakeAerospace({ 7: "floating" });
	assert.deepEqual(await told.lift(7, undefined), { tiled: false });
	assert.equal(windows[7], "floating");
});

test("a window AeroSpace has not seen yet is asked about again, and given up on after a moment", async () => {
	const late = fakeAerospace({ 7: "floating" }, 4);
	assert.deepEqual(await late.told.lift(7, 1), { tiled: false });
	assert.equal(late.said.at(-1), "move-node-to-monitor --window-id 7 1");
	const never = fakeAerospace({});
	assert.equal(await never.told.lift(7, 1), undefined);
	assert.ok(!never.said.some((line) => line.startsWith("move-node")));
});

/** Every command still running, done. */
const settle = () => new Promise<void>((done) => setTimeout(done, 0));

test("a window held for a talk is given back tiled once, whichever of its lifts lets go, and not after a newer talk took it", async () => {
	const { said, told, windows } = fakeAerospace({ 7: "tiling" });
	const held = holds(told);
	// the presenter view carried by X and carried back: one hold, the second only a move
	const first = held.lift(7, 2);
	const second = held.lift(7, 1);
	assert.equal(await second.seen, true);
	first.release();
	second.release();
	await settle();
	assert.equal(windows[7], "tiling");
	assert.equal(said.filter((line) => line.startsWith("layout tiling")).length, 1);
	assert.equal(said.filter((line) => line.startsWith("layout floating")).length, 1);

	// a talk ended before AeroSpace answered its start, and the next begun: the first's release runs between the two
	said.length = 0;
	const ended = held.lift(7, 2);
	ended.release();
	const next = held.lift(7, 2);
	await next.seen;
	ended.release();
	await settle();
	assert.equal(windows[7], "floating");
	assert.deepEqual(said, [
		"layout floating --fail-if-noop --window-id 7",
		"move-node-to-monitor --window-id 7 2",
		"layout tiling --window-id 7",
		"layout floating --fail-if-noop --window-id 7",
		"move-node-to-monitor --window-id 7 2",
	]);
	next.release();
	await settle();
	assert.equal(windows[7], "tiling");
});
