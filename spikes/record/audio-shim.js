// Spike: every AudioContext a frame makes during a render is an OfflineAudioContext
// on the virtual clock; their renders are mixed into the clip afterwards.
(() => {
	const RATE = 48000, SECONDS = 62;
	const Offline = window.OfflineAudioContext;
	const made = [];
	function RecordedAudioContext() {
		const context = new Offline({ numberOfChannels: 2, length: RATE * SECONDS, sampleRate: RATE });
		const born = performance.now();
		made.push({ context, born });
		const define = (name, get) => Object.defineProperty(context, name, { get, configurable: true });
		define("currentTime", () => (performance.now() - born) / 1000);
		define("state", () => "running");
		define("baseLatency", () => 0);
		define("outputLatency", () => 0);
		context.resume = () => Promise.resolve();
		context.suspend = () => Promise.resolve();
		context.close = () => Promise.resolve();
		context.getOutputTimestamp = () => ({ contextTime: context.currentTime, performanceTime: performance.now() });
		return context;
	}
	RecordedAudioContext.prototype = Offline.prototype;
	window.AudioContext = RecordedAudioContext;
	window.webkitAudioContext = RecordedAudioContext;
	Object.defineProperty(window, "__spoolRecordedAudio", {
		value: async (origin) => {
			const left = new Float32Array(RATE * SECONDS), right = new Float32Array(RATE * SECONDS);
			for (const { context, born } of made) {
				const buffer = await context.startRendering();
				const offset = Math.round(((born - origin) / 1000) * RATE);
				const l = buffer.getChannelData(0), r = buffer.getChannelData(1);
				for (let i = 0; i < l.length; i++) {
					const at = i + offset;
					if (at < 0 || at >= left.length) continue;
					left[at] += l[i]; right[at] += r[i];
				}
			}
			return { left, right, contexts: made.length };
		},
	});
})();
