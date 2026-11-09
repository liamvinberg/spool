/**
 * The first run's sound (spool#250): two real recordings, never synthesized, each decoded
 * once into a Web Audio buffer so the accent keeps its place on the chord.
 *
 * Both under the Pixabay Content License (free in a product, no credit needed), trimmed,
 * faded and levelled so the chord peaks as the light lands in the mark, at 4.5 s:
 * - chords.mp3: "soft_chords_F#" by freesound_community
 *   (pixabay.com/sound-effects/musical-soft-chords-f-75127), its first chord, one slow
 *   breath on B flat, played at 0.62 speed: rises from the start, peak 4.5 s, gone by 7.3 s.
 * - bloom.mp3: "Electronic Impact (Soft)" by EdR
 *   (pixabay.com/sound-effects/film-special-effects-electronic-impact-soft-10019), the
 *   accent struck as the ring leaves the mark, levelled louder than the chord's peak.
 */
import bloomUrl from "./bloom.mp3";
import chordsUrl from "./chords.mp3";

export const SOUNDS = {
	chords: { url: chordsUrl, volume: 0.62, ends: 7.4 },
	bloom: { url: bloomUrl, volume: 0.85, strike: 0.02 },
} as const;

let muted = false;
export const setMuted = (next: boolean) => {
	muted = next;
};

/**
 * The event the Mac app fires in the page as it shows the setup window, with a press of
 * its own (`executeJavaScript` with a user gesture): the one press that lets the open's
 * sound start without the app letting every page in it play sound unasked.
 */
export const SETUP_SHOWN = "spool:setup-shown";

/** the open's one audio context, made when it first plays and closed when the setup ends */
let context: AudioContext | null = null;
const audio = () => {
	context ??= new AudioContext();
	return context;
};

/** Inside a press: the audio context made or woken now, while the press still lets it start. */
export function unlockAudio(): void {
	try {
		void audio()
			.resume()
			.catch(() => {});
	} catch {
		// no Web Audio: the open is silent
	}
}

/** Whether sound can start now, without a press: the browser's own policy where it says, else a context that runs. */
export async function audioCanStart(): Promise<boolean> {
	const policy = (
		navigator as Navigator & { getAutoplayPolicy?: (type: "audiocontext") => string }
	).getAutoplayPolicy?.("audiocontext");
	if (policy !== undefined) return policy === "allowed";
	try {
		const ctx = audio();
		if (ctx.state !== "running")
			await Promise.race([ctx.resume().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 150))]);
		return (ctx.state as AudioContextState) === "running";
	} catch {
		return false;
	}
}

/** The setup ended: its audio context closed, and a new one made if it runs again (Help's Run setup again). */
export function closeAudio(): void {
	const closing = context;
	context = null;
	void closing?.close().catch(() => {});
}

const buffers = new Map<string, Promise<AudioBuffer>>();
function load(url: string): Promise<AudioBuffer> {
	let buffer = buffers.get(url);
	if (buffer === undefined) {
		buffer = fetch(url)
			.then((response) => response.arrayBuffer())
			// decoded offline, so loading early needs no gesture and wakes no audio output
			.then((bytes) => new OfflineAudioContext(2, 1, 44100).decodeAudioData(bytes));
		buffers.set(url, buffer);
	}
	return buffer;
}

/** Fetch and decode ahead of the open, so the first moment is on time. */
export const preloadSounds = (...urls: string[]) =>
	Promise.all(urls.map((url) => load(url).catch(() => undefined))).then(() => undefined);

export interface PlayOptions {
	/** seconds into the file to start from */
	from?: number;
	/** seconds from now to start, on the audio clock */
	delay?: number;
	/** when to start on the audio clock (another sound's `onScheduled` gives one), so a layer keeps its place */
	when?: number;
	/** aborting it fades the sound out in 120 ms: a mute, a skip */
	signal?: AbortSignal;
	/** told the audio clock time at which the file's `from` point plays */
	onScheduled?: (at: number) => void;
}

/** Play one sound; resolves when it ends. Silent while muted, and silence where audio can't play. */
export async function playSound(url: string, volume: number, options: PlayOptions = {}): Promise<void> {
	if (muted || options.signal?.aborted) return;
	try {
		const buffer = await load(url);
		if (options.signal?.aborted) return;
		const ctx = audio();
		// a browser holds audio until the page has had a gesture: then the picture runs on its own clock, silent,
		// rather than a sound starting late and pulling the light back to its start
		if (ctx.state !== "running") {
			await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 150))]);
			if ((ctx.state as AudioContextState) !== "running" || options.signal?.aborted) return;
		}
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		const gain = ctx.createGain();
		gain.gain.value = volume;
		source.connect(gain).connect(ctx.destination);
		const stop = () => {
			const now = ctx.currentTime;
			gain.gain.setValueAtTime(gain.gain.value, now);
			gain.gain.linearRampToValueAtTime(0, now + 0.12);
			try {
				source.stop(now + 0.13);
			} catch {
				// already ended
			}
		};
		options.signal?.addEventListener("abort", stop, { once: true });
		await new Promise<void>((resolve) => {
			source.onended = () => {
				options.signal?.removeEventListener("abort", stop);
				resolve();
			};
			const at = Math.max(ctx.currentTime, options.when ?? ctx.currentTime + (options.delay ?? 0));
			source.start(at, options.from ?? 0);
			options.onScheduled?.(at);
		});
	} catch {
		// a sound that cannot play is silence, never an error on screen
	}
}

/**
 * Where the sound you hear is, on the audio clock, in seconds: the clock less what the
 * output adds (about 0.04 s on a Mac's speakers, 0.2 s and more on Bluetooth headphones).
 * A picture timed by this lands on what is heard, on any output. Null before any sound.
 */
export function heardNow(): number | null {
	if (context === null || context.state !== "running") return null;
	const stamp = context.getOutputTimestamp?.();
	return stamp?.contextTime !== undefined && stamp.performanceTime !== undefined && stamp.performanceTime > 0
		? stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000
		: context.currentTime - context.baseLatency - (context.outputLatency || 0);
}
