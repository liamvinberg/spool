import { appendFileSync } from "node:fs";

/**
 * Preloaded into a daemon a bench starts (`--import`), this writes how late
 * the daemon's event loop runs a 5 ms timer, so a bench can say for how long
 * after a gesture the daemon could not have answered anyone. Each line is the
 * wall-clock ms the tick ran at and how many ms late it was. Only late ticks are
 * written, and the file is appended a few times a second, outside the ticks.
 *
 *   SPOOL_BENCH_LOOP=<file> node --import ./bench/loop-lag.ts dist/cli.js serve
 */

const out = process.env.SPOOL_BENCH_LOOP;
if (out !== undefined && out !== "") {
	const TICK_MS = 5;
	let last = performance.now();
	let held: string[] = [];
	setInterval(() => {
		const now = performance.now();
		const late = now - last - TICK_MS;
		last = now;
		if (late >= 2) held.push(`${(performance.timeOrigin + now).toFixed(1)} ${late.toFixed(1)}`);
	}, TICK_MS).unref();
	setInterval(() => {
		if (held.length === 0) return;
		appendFileSync(out, `${held.join("\n")}\n`);
		held = [];
	}, 200).unref();
}
