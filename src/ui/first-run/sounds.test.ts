import { expect, it, vi } from "vitest";
import { closeAudio, heardNow, unlockAudio } from "./sounds";

it("closes the setup's audio when it ends, and makes it anew when setup runs again", () => {
	const made: { closed: boolean }[] = [];
	class FakeAudioContext {
		state = "running";
		closed = false;
		currentTime = 0;
		baseLatency = 0;
		constructor() {
			made.push(this);
		}
		resume = async () => {};
		close = async () => {
			this.closed = true;
		};
	}
	vi.stubGlobal("AudioContext", FakeAudioContext);

	unlockAudio();
	expect(made).toHaveLength(1);
	closeAudio();
	expect(made[0]?.closed).toBe(true);
	expect(heardNow()).toBeNull();

	// Help's Run setup again
	unlockAudio();
	expect(made).toHaveLength(2);
	expect(made[1]?.closed).toBe(false);
	vi.unstubAllGlobals();
});
