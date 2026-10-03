import { agentsAt, type PageName, type Posture, type Scenario } from "shared/ui/explore/cloud/presence-places/scenarios";
import { clamp01, easeOut, type FrameName, TEAM, type Who } from "shared/ui/explore/cloud/presence-places/world";

/**
 * Who is where, read as places: every frame (and every other page) with the
 * people and agents in it, each carrying how present they are this instant, so a
 * move is a crossfade between two places rather than a jump.
 */

export interface Occupant {
	kind: "person" | "agent";
	who: Who;
	/** 0..1: arriving, here, leaving */
	alpha: number;
	posture?: Posture | undefined;
	/** when this stay began, on the clock */
	since: number;
}

export interface Place {
	page: PageName;
	/** a frame on `app`, or the frame a person is on on another page */
	frame: string;
	occupants: Occupant[];
}

const IN = 0.3;
const OUT = 0.45;

export function placesAt(scene: Scenario, t: number): Map<string, Place> {
	const places = new Map<string, Place>();
	const at = (page: PageName, frame: string) => {
		const key = `${page}/${frame}`;
		let place = places.get(key);
		if (place === undefined) {
			place = { page, frame, occupants: [] };
			places.set(key, place);
		}
		return place;
	};
	for (const who of TEAM) {
		for (const span of scene.people[who] ?? []) {
			if (t < span.from || t >= span.to + OUT) continue;
			const first = span.from <= 0.001;
			const alpha = Math.min(first ? 1 : easeOut((t - span.from) / IN), t > span.to && span.to < scene.total - 0.01 ? 1 - clamp01((t - span.to) / OUT) : 1);
			at(span.page, span.frame).occupants.push({ kind: "person", who, alpha, since: span.from });
		}
	}
	for (const hold of agentsAt(scene, t)) {
		const place = at("app", hold.frame);
		if (place.occupants.some((o) => o.kind === "agent" && o.who === hold.who)) continue;
		place.occupants.push({ kind: "agent", who: hold.who, alpha: hold.wound, posture: hold.posture, since: hold.since });
	}
	return places;
}

export function appPlace(places: Map<string, Place>, frame: FrameName): Place | undefined {
	return places.get(`app/${frame}`);
}

/** where one member is right now, and where their agent is */
export function whereIs(places: Map<string, Place>, who: Who, kind: "person" | "agent"): Place | null {
	let best: Place | null = null;
	let alpha = 0;
	for (const place of places.values()) {
		for (const occupant of place.occupants) {
			if (occupant.who === who && occupant.kind === kind && occupant.alpha > alpha) {
				best = place;
				alpha = occupant.alpha;
			}
		}
	}
	return best;
}

export function verb(posture: Posture | undefined): string {
	if (posture === "write") return "writing";
	if (posture === "shot") return "looking";
	return "reading";
}
