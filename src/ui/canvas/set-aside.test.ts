import { expect, it } from "vitest";
import type { ShownSetAside } from "../api";
import { collisions, setAsideAsk, setAsideSays, setAsideSides } from "./set-aside";

const mark = (path: string, change: Partial<ShownSetAside> = {}): ShownSetAside => ({
	id: path,
	path,
	kind: "set-aside",
	deleted: false,
	frames: [],
	by: "Asim Syed",
	self: false,
	device: null,
	file: `design/.spool/set-aside/${path}`,
	at: 0,
	together: 1,
	batch: "one",
	...change,
});

it("says who and what both changed, by frame where the files are frames", () => {
	expect(
		setAsideSays([mark("frames/settings/sign-in--mobile/frame.tsx", { frames: ["settings/sign-in--mobile"] })]),
	).toBe("You and Asim Syed both changed settings/sign-in--mobile");
	expect(
		setAsideSays([
			mark("frames/a/frame.tsx", { frames: ["a"] }),
			mark("frames/b/frame.tsx", { frames: ["b"] }),
			mark("shared/ui/go.tsx", { frames: ["a", "b"] }),
		]),
	).toBe("You and Asim Syed both changed 2 frames");
	expect(setAsideSays([mark("shared/data.ts"), mark("frames/a/frame.tsx", { frames: ["a"], by: null })])).toBe(
		"You and a teammate both changed 2 files",
	);
});

it("asks the agent about every file at once, with where both sides are", () => {
	const ask = setAsideAsk([
		mark("frames/a/frame.tsx", { file: "design/.spool/set-aside/1/frame.tsx" }),
		mark("frames/b/frame.tsx", { kind: "restored", deleted: true, file: null }),
	]);
	expect(ask).toContain(
		"- design/frames/a/frame.tsx: Asim Syed's version is in the file now. Mine is in design/.spool/set-aside/1/frame.tsx.",
	);
	expect(ask).toContain("- design/frames/b/frame.tsx: I deleted it and Asim Syed edited it");
	expect(ask).toContain("Redo each of my changes on top of the team's version in the file, keeping their work.");
});

it("says a collision with another copy of the same account as one, naming its machine when known", () => {
	const self = { by: null, self: true } as const;
	const frame = mark("frames/a/frame.tsx", { frames: ["a"], ...self, device: "Liam's MacBook Pro" });
	expect(setAsideSays([frame])).toBe("This copy and your copy on Liam's MacBook Pro both changed a");
	expect(setAsideSays([mark("shared/data.ts", self)])).toBe("Two of your copies both changed shared/data.ts");
	expect(setAsideSides([frame])).toEqual({ theirs: "Use the other copy's", mine: "Use this copy's" });
	expect(setAsideSides([mark("shared/data.ts")])).toEqual({ theirs: "Use theirs", mine: "Use mine" });
	const ask = setAsideAsk([frame]);
	expect(ask).toContain("clashed with another copy of mine");
	expect(ask).toContain(
		"- design/frames/a/frame.tsx: the version from my other copy on Liam's MacBook Pro is in the file now.",
	);
	expect(ask).not.toContain("teammate");
});

it("lists one collision per clash and whose save stood, oldest first", () => {
	const ana = (path: string, at: number) => mark(path, { at, batch: "train" });
	const lists = collisions([
		mark("frames/z/frame.tsx", { at: 9, batch: "later" }),
		ana("frames/a/frame.tsx", 1),
		ana("frames/b/frame.tsx", 2),
		mark("frames/c/frame.tsx", { at: 3, batch: "train", by: null, self: true }),
	]);
	expect(lists.map((group) => group.map((one) => one.path))).toEqual([
		["frames/a/frame.tsx", "frames/b/frame.tsx"],
		["frames/c/frame.tsx"],
		["frames/z/frame.tsx"],
	]);
});
