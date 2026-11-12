import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { delimiter, join } from "node:path";
import { type BrowserWindow, type Rectangle, screen } from "electron";

// A window manager that needs telling (spool#310).
//
// A tiling window manager moves the windows of a talk. AeroSpace binds every new window to the focused
// workspace, so the room, made for the other display, is moved onto the display spool's window is on, over the
// slides; and it tiles spool's own window back into its place on every refresh, so the slides it covers its display
// with sit under the menu bar's height and run off the bottom. Nothing in a window tells AeroSpace to leave it be:
// Electron's are standard windows to it, never the popups it ignores. Its own command line can, so while it runs
// the windows of a talk are taken out of its tiling and put on their display through it, and given back as they
// were when the talk ends.
//
// Whatever the manager, a window placed for a talk is looked at again after a moment and put back if something
// moved it, twice at most, so this app and a manager that disagrees never chase each other.
//
// None of it may slow a press or stop a slide: with no manager running it is one look for a file; every command
// has a short time limit; and a command that fails leaves presenting as it is without one.

export interface WindowManager {
	/**
	 * `window` put at `want` for a talk: over a display, or as the room's window. At once when no manager needs
	 * telling; else the manager is told to leave it be and move it to that display first, so the two never pull it
	 * two ways, and it is put there once the manager has let go: `settled`, within a second or so. A caller may
	 * place it at once itself as well. `release` gives it back to the manager as it was: tiled only if it was tiled.
	 */
	lift(window: BrowserWindow, want: Rectangle): { settled: Promise<void>; release(): void };
	/** Whether a manager runs that is told: a window moved for a talk may then stand elsewhere for a moment. */
	telling(): boolean;
}

/** What a command line asks of AeroSpace, true when it did it. */
export type Run = (args: readonly string[]) => Promise<boolean>;

/** The longest one AeroSpace command may take. */
const COMMAND_MS = 500;
/** How long a new window may take to be seen by AeroSpace, and how often it is asked again meanwhile. */
const SEEN_MS = 600;
const SEEN_EVERY_MS = 50;
/**
 * When a placed window is looked at again, after it was placed: soon, and once more after the manager has caught up
 * with a display that came or went.
 */
const LOOKS_MS = [250, 700, 2_000] as const;

/** AeroSpace's socket, there while it runs. */
export function aerospaceSocket(user: string): string {
	return `/tmp/bobko.aerospace-${user}.sock`;
}

/**
 * Where AeroSpace's command line may be. An app opened from the Finder has none of a shell's PATH, so the places
 * its installs put it come first: Homebrew on Apple silicon and on Intel, then Nix. The app's bundle holds only the
 * server. Then the PATH the app was given, for a run from a terminal.
 */
export function aerospaceCandidates(home: string, user: string, path: string | undefined): string[] {
	const fixed = [
		"/opt/homebrew/bin",
		"/usr/local/bin",
		join(home, ".nix-profile/bin"),
		`/etc/profiles/per-user/${user}/bin`,
		"/run/current-system/sw/bin",
	];
	const all = [...fixed, ...(path ?? "").split(delimiter).filter((dir) => dir.startsWith("/"))];
	return [...new Set(all)].map((dir) => join(dir, "aerospace"));
}

/** The number macOS knows a window by, from Electron's media source id ("window:<number>:0"). */
export function windowNumber(mediaSourceId: string): number | undefined {
	const match = /^window:(\d+):/.exec(mediaSourceId);
	return match === null ? undefined : Number(match[1]);
}

/**
 * The display under `rect`, as AeroSpace numbers its monitors: from 1, ordered by their left edge and then their top,
 * in the coordinates Electron gives too. The one holding the middle of `rect`, else the nearest.
 */
export function monitorNumber(displays: readonly Rectangle[], rect: Rectangle): number | undefined {
	const sorted = [...displays].sort((a, b) => a.x - b.x || a.y - b.y);
	const cx = rect.x + rect.width / 2;
	const cy = rect.y + rect.height / 2;
	const away = (d: Rectangle) =>
		Math.hypot(Math.max(d.x - cx, 0, cx - (d.x + d.width)), Math.max(d.y - cy, 0, cy - (d.y + d.height)));
	let best: number | undefined;
	for (const [index, display] of sorted.entries())
		if (best === undefined || away(display) < away(sorted[best]!)) best = index;
	return best === undefined ? undefined : best + 1;
}

/** Whether a window stands somewhere other than `want`, by more than a rounding. */
export function moved(want: Rectangle, got: Rectangle): boolean {
	return (
		Math.abs(want.x - got.x) > 1 ||
		Math.abs(want.y - got.y) > 1 ||
		Math.abs(want.width - got.width) > 1 ||
		Math.abs(want.height - got.height) > 1
	);
}

/** What AeroSpace is told for a talk's windows, through `run`, while it runs. */
export interface Aerospace {
	/** The window floated, if it was tiled, and moved to `monitor`; whether it was tiled, or undefined when not told. */
	lift(window: number, monitor: number | undefined): Promise<{ tiled: boolean } | undefined>;
	/** The window tiled again. */
	tile(window: number): Promise<void>;
	/** The window moved to `monitor`, tiled or floating as it is. */
	move(window: number, monitor: number): Promise<boolean>;
}

export function aerospace(
	run: Run,
	wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms)),
	now = Date.now,
): Aerospace {
	const id = (window: number) => ["--window-id", String(window)];
	const move = (window: number, monitor: number) => run(["move-node-to-monitor", ...id(window), String(monitor)]);
	return {
		async lift(window, monitor) {
			// a window just made is not AeroSpace's yet: asked again till it is. --fail-if-noop fails a window
			// already floating, so it is not tiled at the end; a window AeroSpace does not know fails the same
			// way, and only that one fails without it
			const started = now();
			for (;;) {
				const floated = await run(["layout", "floating", "--fail-if-noop", ...id(window)]);
				const known = floated || (await run(["layout", "floating", ...id(window)]));
				if (known) {
					if (monitor !== undefined) await move(window, monitor);
					return { tiled: floated };
				}
				if (now() - started >= SEEN_MS) return undefined;
				await wait(SEEN_EVERY_MS);
			}
		},
		async tile(window) {
			await run(["layout", "tiling", ...id(window)]);
		},
		move,
	};
}

/** AeroSpace's command line, run with a time limit; false for anything but a clean exit. */
function runner(cli: string): Run {
	return (args) =>
		new Promise((done) => {
			execFile(cli, [...args], { timeout: COMMAND_MS }, (error) => done(error === null));
		});
}

export function installWindowManager(log: (...words: string[]) => void): WindowManager {
	const user = userInfo().username;
	const socket = aerospaceSocket(user);
	/** the command line once found; null when looked for and not found */
	let cli: string | null | undefined;
	const told = (): Aerospace | undefined => {
		if (!existsSync(socket)) return undefined;
		if (cli === undefined) {
			cli = aerospaceCandidates(homedir(), user, process.env.PATH).find((one) => existsSync(one)) ?? null;
			log("window manager", "aerospace", cli === null ? "running, its command line not found" : "running");
		}
		return cli === null ? undefined : aerospace(runner(cli));
	};
	/** each window's latest placing, so the looks of an older one stop */
	const turns = new WeakMap<BrowserWindow, number>();
	/** the windows floating in AeroSpace, lifted here and not yet released: lifted again, they are only moved */
	const floating = new Set<number>();
	const monitorOf = (want: Rectangle) =>
		monitorNumber(
			screen.getAllDisplays().map((display) => display.bounds),
			want,
		);

	return {
		telling: () => told() !== undefined,
		lift(window, want) {
			const turn = (turns.get(window) ?? 0) + 1;
			turns.set(window, turn);
			const current = () => !window.isDestroyed() && turns.get(window) === turn;
			// whichever placing it was given by, the window is the caller's again: every look stops
			const stop = () => turns.set(window, (turns.get(window) ?? 0) + 1);
			const number = windowNumber(window.getMediaSourceId());
			const manager = number === undefined ? undefined : told();
			/** put back at `want` if something moved it, at most twice, the manager told again first */
			let left = 2;
			const look = async () => {
				if (!current() || left === 0 || !moved(want, window.getBounds())) return;
				left -= 1;
				const monitor = monitorOf(want);
				if (manager !== undefined && number !== undefined && monitor !== undefined)
					await manager.move(number, monitor);
				if (!current()) return;
				log("window manager", "put back", String(left));
				window.setBounds(want, false);
			};
			const looks = () => {
				for (const ms of LOOKS_MS) setTimeout(() => void look(), ms);
			};
			const put = () => {
				if (current() && moved(want, window.getBounds())) window.setBounds(want, false);
			};
			if (manager === undefined || number === undefined) {
				put();
				looks();
				return { settled: Promise.resolve(), release: stop };
			}
			const monitor = monitorOf(want);
			const again = async () => {
				if (monitor !== undefined) await manager.move(number, monitor);
				return { tiled: false };
			};
			const lifting = (floating.has(number) ? again() : manager.lift(number, monitor)).then((result) => {
				if (result === undefined) log("window manager", "aerospace", "never saw the window");
				else floating.add(number);
				// moved there by the manager, as near as it puts a floating window: the rest is this app's
				put();
				looks();
				return result;
			});
			return {
				settled: lifting.then(() => {}),
				release() {
					stop();
					void lifting.then((result) => {
						floating.delete(number);
						if (result?.tiled === true) return manager.tile(number);
					});
				},
			};
		},
	};
}
