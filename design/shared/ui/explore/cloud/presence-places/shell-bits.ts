import type { PageRow } from "shared/ui/spool/canvas-chrome";
import type { Mark } from "shared/ui/spool/unseen-mark";
import type { Scenario } from "shared/ui/explore/cloud/presence-places/scenarios";
import {
	agentName,
	clamp01,
	easeOut,
	FRAME_NAMES,
	type FrameName,
	MEMBERS,
	OTHER_PAGES,
	type Who,
} from "shared/ui/explore/cloud/presence-places/world";

/** what changed on a frame while you were away, and how present that news is now */
export interface AwayNews {
	mark: Mark;
	alpha: number;
	by: { who: Who; writes: number }[];
	left: { who: Who; ago: string }[];
}

/**
 * The news per frame after coming back: it arrives a beat after you do, one frame
 * after another in the order it happened, and is spent once you look at the frame.
 */
export function awayMarks(scene: Scenario, t: number): Map<FrameName, AwayNews> {
	const out = new Map<FrameName, AwayNews>();
	const away = scene.away;
	if (away === undefined || t < away.back) return out;
	const alphaFor = (frame: FrameName, order: number) => {
		const arrive = away.back + 0.35 + order * 0.16;
		const seen = away.seen.find((s) => s.frame === frame);
		const fade = seen === undefined ? 1 : 1 - clamp01((t - seen.at) / 0.5);
		return easeOut(clamp01((t - arrive) / 0.3)) * fade;
	};
	away.changed.forEach((change, order) => {
		out.set(change.frame, {
			mark: change.mark,
			alpha: alphaFor(change.frame, order),
			by: [{ who: change.by, writes: change.writes }],
			left: [],
		});
	});
	away.left.forEach((gone, i) => {
		const found = out.get(gone.frame);
		const alpha = alphaFor(gone.frame, away.changed.length + i);
		if (found === undefined) out.set(gone.frame, { mark: "changed", alpha, by: [], left: [{ who: gone.who, ago: gone.ago }] });
		else found.left.push({ who: gone.who, ago: gone.ago });
	});
	for (const [frame, news] of out) if (news.alpha <= 0.001) out.delete(frame);
	return out;
}

/** the pages rail as the kaffe project has it, wearing the shipped unseen marks */
export function kaffePages(scene: Scenario, t: number): PageRow[] {
	const unseen: Record<string, Mark> = {};
	for (const [frame, news] of awayMarks(scene, t)) if (news.alpha > 0.5 && news.by.length > 0) unseen[frame] = news.mark;
	return [
		{ name: "app", frames: FRAME_NAMES, active: true, open: true, unseen },
		...OTHER_PAGES.map((page) => ({ name: page.name, frames: page.frames })),
	];
}

export function followChipText(who: Who, kind: "person" | "agent"): string {
	return kind === "person"
		? `following ${MEMBERS[who].name.toLowerCase()} · esc stops`
		: `following ${agentName(who)} · esc stops`;
}
