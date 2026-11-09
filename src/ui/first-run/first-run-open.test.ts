// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { DesktopWindow } from "../desktop-window";
import { FirstRun } from "./first-run";
import { audioCanStart, closeAudio, playSound, SETUP_SHOWN, SOUNDS, unlockAudio } from "./sounds";

/**
 * The first run's open (spool#250): its light and sound start together, from a press
 * where a browser wants one and from the Mac app's own as it shows the window, and its
 * box is the window it is in, whatever size that window has come to.
 */
vi.mock("./sounds", async (actual) => ({
	...(await actual<typeof import("./sounds")>()),
	playSound: vi.fn(async () => {}),
	preloadSounds: vi.fn(async () => {}),
	audioCanStart: vi.fn(async () => false),
	unlockAudio: vi.fn(),
	closeAudio: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

async function mount(appWindow?: DesktopWindow) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => host.remove());
	await act(async () =>
		root.render(
			createElement(FirstRun, {
				agents: [],
				onRecheck: () => {},
				account: { state: "signed-out" },
				onSignIn: () => {},
				onCancelSignIn: () => {},
				onDone: () => {},
				appWindow,
			}),
		),
	);
	const openButton = () =>
		[...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Open spool"));
	const chordPlays = () => vi.mocked(playSound).mock.calls.filter(([url]) => url === SOUNDS.chords.url).length;
	return { root, host, openButton, chordPlays };
}

describe("the open", () => {
	it("waits for a press where the browser wants one, then starts light and sound together", async () => {
		vi.mocked(audioCanStart).mockResolvedValue(false);
		const { root, host, openButton, chordPlays } = await mount();
		await vi.waitFor(() => expect(openButton()).toBeDefined());
		expect(chordPlays()).toBe(0);

		act(() => openButton()?.click());
		expect(unlockAudio).toHaveBeenCalled();
		expect(chordPlays()).toBe(1);
		expect(openButton()).toBeUndefined();
		expect(host.querySelector("canvas")).not.toBeNull();

		// the setup ends: its audio goes with it
		act(() => root.unmount());
		expect(closeAudio).toHaveBeenCalled();
	});

	it("starts at once in the Mac app as the app shows the window, and fills the window at every size", async () => {
		vi.mocked(audioCanStart).mockResolvedValue(false);
		const setupWindow = vi.fn(async () => true);
		Object.assign(window, { innerWidth: 560, innerHeight: 480 });
		const { root, host, openButton, chordPlays } = await mount({ setupWindow } as unknown as DesktopWindow);
		await vi.waitFor(() => expect(setupWindow).toHaveBeenCalled());
		// nothing plays until the app has shown the window
		expect(chordPlays()).toBe(0);

		act(() => {
			window.dispatchEvent(new Event(SETUP_SHOWN));
		});
		expect(chordPlays()).toBe(1);
		expect(openButton()).toBeUndefined();

		// the window took the next step's size after the page asked: the setup is laid out in all of it
		const dialog = () => host.querySelector<HTMLElement>('[role="dialog"]');
		Object.assign(window, { innerWidth: 560, innerHeight: 532 });
		act(() => {
			window.dispatchEvent(new Event("resize"));
		});
		await vi.waitFor(() => expect([dialog()?.style.width, dialog()?.style.height]).toEqual(["560px", "532px"]));
		act(() => root.unmount());
	});
});
