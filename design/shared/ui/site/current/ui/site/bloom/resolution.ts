/** Lower quality after sustained missed frames, never after a single hitch.
 * Keep the chosen level for this visit so quality cannot oscillate. */
export function createResolutionBudget() {
	let scale = 1;
	let duration = 0;
	let frames = 0;
	let slow = 0;
	const reset = () => {
		duration = 0;
		frames = 0;
		slow = 0;
	};
	return {
		get scale() {
			return scale;
		},
		reset,
		sample(interval: number): boolean {
			// A suspended tab or debugger stop says nothing about shader cost.
			if (interval <= 0 || interval >= 250) {
				reset();
				return false;
			}
			duration += interval;
			frames++;
			if (interval > 20) slow++;
			if (duration < 2000) return false;
			const previous = scale;
			if (slow / frames > 0.1) scale = Math.max(0.4, scale * 0.8);
			reset();
			return previous !== scale;
		},
	};
}

export function drawingSize(width: number, height: number, dpr: number, scale: number) {
	const ratio = Math.min(dpr, 1.25, 2200 / Math.max(width, height)) * scale;
	return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}
