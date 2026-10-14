import { expect, it } from "vitest";
import type { ShownSetAside } from "../api";
import { setAsideAsk, setAsideSays } from "./set-aside";

const mark = (path: string, change: Partial<ShownSetAside> = {}): ShownSetAside => ({
	id: path,
	path,
	kind: "set-aside",
	deleted: false,
	frames: [],
	by: "asim01.syed@gmail.com",
	file: `design/.spool/set-aside/${path}`,
	at: 0,
	together: 1,
	...change,
});

it("says who and what both changed, by frame where the files are frames", () => {
	expect(
		setAsideSays([mark("frames/settings/sign-in--mobile/frame.tsx", { frames: ["settings/sign-in--mobile"] })]),
	).toBe("You and asim01.syed both changed settings/sign-in--mobile");
	expect(
		setAsideSays([
			mark("frames/a/frame.tsx", { frames: ["a"] }),
			mark("frames/b/frame.tsx", { frames: ["b"] }),
			mark("shared/ui/go.tsx", { frames: ["a", "b"] }),
		]),
	).toBe("You and asim01.syed both changed 2 frames");
	expect(setAsideSays([mark("shared/data.ts"), mark("frames/a/frame.tsx", { frames: ["a"], by: null })])).toBe(
		"You and a teammate both changed 2 files",
	);
});

it("asks the agent about every file at once, with where both sides are", () => {
	const ask = setAsideAsk([
		mark("frames/a/frame.tsx", { by: "asim01.syed@gmail.com", file: "design/.spool/set-aside/1/frame.tsx" }),
		mark("frames/b/frame.tsx", { kind: "restored", deleted: true, file: null }),
	]);
	expect(ask).toContain(
		"- design/frames/a/frame.tsx: asim01.syed@gmail.com's version is in the file now. Mine is in design/.spool/set-aside/1/frame.tsx.",
	);
	expect(ask).toContain("- design/frames/b/frame.tsx: I deleted it and asim01.syed@gmail.com edited it");
	expect(ask).toContain("Redo each of my changes on top of the team's version in the file, keeping their work.");
});
