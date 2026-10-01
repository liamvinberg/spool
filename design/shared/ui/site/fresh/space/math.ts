export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

/** 0 before `start`, 1 after `end`, linear between. */
export const range = (value: number, start: number, end: number) => clamp((value - start) / (end - start));

/** Smoothstep between two points, the default ease for anything scrubbed. */
export const ease = (value: number, start: number, end: number) => {
	const t = range(value, start, end);
	return t * t * (3 - 2 * t);
};

/** Ease in and out harder, for camera moves that should feel weighted. */
export const glide = (value: number, start: number, end: number) => {
	const t = range(value, start, end);
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};

/** Rises over [a, b], holds, falls over [c, d]. Open ends with -Infinity / Infinity. */
export const window4 = (value: number, a: number, b: number, c: number, d: number) =>
	(a === -Infinity ? 1 : ease(value, a, b)) * (d === Infinity ? 1 : 1 - ease(value, c, d));

export type Key<T extends readonly number[]> = { at: number; value: T };

/** Interpolate a tuple through keyframes, eased between neighbours. */
export function track<T extends readonly number[]>(keys: readonly Key<T>[], at: number): number[] {
	const first = keys[0];
	const last = keys[keys.length - 1];
	if (!first || !last) return [];
	if (at <= first.at) return [...first.value];
	if (at >= last.at) return [...last.value];
	for (let i = 0; i < keys.length - 1; i++) {
		const a = keys[i];
		const b = keys[i + 1];
		if (!a || !b || at > b.at) continue;
		const t = glide(at, a.at, b.at);
		return a.value.map((v, j) => lerp(v, b.value[j] ?? v, t));
	}
	return [...last.value];
}
