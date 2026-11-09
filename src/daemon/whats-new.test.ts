import { describe, expect, it } from "vitest";
import { type ChangelogFeed, decideWhatsNew, readChangelogFeed, shownMemory } from "./whats-new";

const clip = (id: string) => ({
	src: `https://media.spool.page/changelog/${id}.mp4`,
	poster: `https://media.spool.page/changelog/${id}.jpg`,
});
const minor = (headline: string, title: string, picked?: { clip?: string }) => ({
	kind: "minor",
	headline,
	title,
	...(picked === undefined ? {} : { highlight: true }),
	...(picked?.clip === undefined ? {} : { clip: clip(picked.clip) }),
});
const fix = (title: string) => ({ kind: "patch", title });

/** changelog.json as spool.page serves it, three releases deep. */
const json = {
	through: "0.52.0",
	published: { "0.52.1": "2026-11-20T10:00:00Z", "0.52.0": "2026-11-18T10:00:00Z", "0.51.0": "2026-11-10T10:00:00Z" },
	releases: [
		{ version: "0.52.1", date: "2026-11-20", entries: [fix("A deleted team shows its name.")] },
		{
			version: "0.52.0",
			date: "2026-11-18",
			entries: [
				minor("The agent's trail", "The canvas names the frame your agent writes.", { clip: "trail" }),
				minor("Chrome extension", "Send a piece of any website to the canvas.", { clip: "chrome" }),
				{ kind: "minor", title: "Export a frame as one HTML file." },
				minor("Bring in Figma files", "Drop a .fig on Home.", {}),
				fix("Covers are drawn on the GPU."),
				fix("`spool skill` is half the size."),
			],
		},
		{
			version: "0.51.0",
			date: "2026-11-10",
			entries: [
				minor("Record", "Record a clip of a frame.", { clip: "record" }),
				minor("Pages as lists", "A page of pages shows them as a list.", { clip: "pages" }),
				fix("A busy daemon keeps its credential."),
			],
		},
	],
};
const feed = readChangelogFeed(json) as ChangelogFeed;
const NOW = Date.parse("2026-11-18T12:00:00Z");

describe("decideWhatsNew", () => {
	it("on a fresh install, remembers the first version it sees and shows nothing", () => {
		// a project first opened after this release went out came with this install
		const fresh = decideWhatsNew({ usedSince: Date.parse("2026-11-18T11:00:00Z") }, "0.52.0", feed, NOW);
		expect(fresh).toMatchObject({ pop: false, remember: { seen: "0.52.0" } });
		// it finds this release's features in help, without the card unfolding
		expect(fresh.content?.highlights.map((h) => h.title)).toEqual([
			"The agent's trail",
			"Chrome extension",
			"Bring in Figma files",
		]);
		expect(decideWhatsNew({}, "0.52.0", feed, NOW)).toMatchObject({ pop: false, remember: { seen: "0.52.0" } });
		expect(decideWhatsNew({}, "0.52.1", feed, NOW).content).toBeNull();
		// out of reach, it decides nothing yet, so a Mac that ran spool before is not taken for a fresh one
		expect(decideWhatsNew({}, "0.52.1", undefined, NOW)).toEqual({ content: null, pop: false });
	});

	it("takes a Mac that ran spool before this release, with nothing remembered, as updated from the release before", () => {
		const before = Date.parse("2026-11-12T09:00:00Z");
		const upgraded = decideWhatsNew({ usedSince: before }, "0.52.0", feed, NOW);
		expect(upgraded).toMatchObject({ pop: true, remember: { seen: "0.51.0" } });
		// this release's card, not every release before it
		expect(upgraded.content?.highlights.map((h) => h.title)).toEqual([
			"The agent's trail",
			"Chrome extension",
			"Bring in Figma files",
		]);
		// still waiting for clips, the release before is remembered so a later start without the trace pops it
		const early = { ...feed, through: "0.51.0" };
		expect(decideWhatsNew({ usedSince: before }, "0.52.0", early, NOW)).toMatchObject({
			pop: false,
			remember: { seen: "0.51.0" },
		});
		// an update of fixes alone stays quiet, as ever
		expect(decideWhatsNew({ usedSince: before }, "0.52.1", feed, NOW)).toEqual({
			content: null,
			pop: false,
			remember: { seen: "0.52.1", from: "0.52.0" },
		});
	});

	it("gathers every release since the one remembered: four highlights newest first, the rest of the minors, the fixes summed", () => {
		const decision = decideWhatsNew({ seen: "0.50.0" }, "0.52.1", feed, Date.parse("2026-11-23T12:00:00Z"));
		expect(decision.pop).toBe(true);
		expect(decision.remember).toBeUndefined();
		expect(decision.content).toEqual({
			version: "0.52.1",
			highlights: [
				{ title: "The agent's trail", says: "The canvas names the frame your agent writes.", clip: clip("trail") },
				{ title: "Chrome extension", says: "Send a piece of any website to the canvas.", clip: clip("chrome") },
				{ title: "Bring in Figma files", says: "Drop a .fig on Home." },
				{ title: "Record", says: "Record a clip of a frame.", clip: clip("record") },
			],
			features: [
				{ name: "Export a frame as one HTML file." },
				{ name: "Pages as lists", says: "A page of pages shows them as a list." },
			],
			fixes: 4,
			changelog: "https://spool.page/changelog",
		});
	});

	it("remembers an update of fixes alone without a word", () => {
		expect(decideWhatsNew({ seen: "0.52.0" }, "0.52.1", feed, NOW)).toEqual({
			content: null,
			pop: false,
			remember: { seen: "0.52.1", from: "0.52.0" },
		});
	});

	it("waits for a release's clips, remembering nothing, until it is two days old", () => {
		const early = { ...feed, through: "0.51.0" };
		const waiting = decideWhatsNew({ seen: "0.51.0" }, "0.52.0", early, Date.parse("2026-11-18T12:00:00Z"));
		expect(waiting.pop).toBe(false);
		expect(waiting.remember).toBeUndefined();
		// help already has it, for whoever goes looking
		expect(waiting.content?.highlights[0]?.title).toBe("The agent's trail");
		expect(decideWhatsNew({ seen: "0.51.0" }, "0.52.0", early, Date.parse("2026-11-20T11:00:00Z")).pop).toBe(true);
		// with no publish time, the day it is dated by stands in for it
		const undated = { ...early, published: {} };
		expect(decideWhatsNew({ seen: "0.51.0" }, "0.52.0", undated, Date.parse("2026-11-20T23:00:00Z")).pop).toBe(false);
		expect(decideWhatsNew({ seen: "0.51.0" }, "0.52.0", undated, Date.parse("2026-11-21T01:00:00Z")).pop).toBe(true);
	});

	it("shows and remembers nothing while spool.page is out of reach or does not list this version yet", () => {
		expect(decideWhatsNew({ seen: "0.51.0" }, "0.52.0", undefined, NOW)).toEqual({ content: null, pop: false });
		expect(decideWhatsNew({ seen: "0.51.0" }, "0.53.0", feed, NOW)).toEqual({ content: null, pop: false });
	});

	it("keeps what the card showed in help once it is remembered, and nothing pops again", () => {
		const shown = shownMemory({ seen: "0.50.0" }, "0.52.1");
		expect(shown).toEqual({ seen: "0.52.1", from: "0.50.0" });
		const after = decideWhatsNew(shown, "0.52.1", feed, NOW);
		expect(after.pop).toBe(false);
		expect(after.remember).toBeUndefined();
		expect(after.content?.highlights).toHaveLength(4);
		expect(shownMemory(shown, "0.52.1")).toEqual(shown);
	});
});

describe("readChangelogFeed", () => {
	it("keeps what has the changelog's shape and plays clips only from https", () => {
		expect(readChangelogFeed({ releases: "no" })).toBeUndefined();
		const read = readChangelogFeed({
			releases: [
				{
					version: "1.0.0",
					date: "2026-12-01",
					entries: [
						{ kind: "minor", title: "A.", highlight: true, clip: { src: "javascript:alert(1)" } },
						{ kind: "odd", title: "B." },
					],
				},
				{ entries: [] },
			],
		});
		expect(read).toEqual({
			published: {},
			releases: [
				{ version: "1.0.0", date: "2026-12-01", entries: [{ kind: "minor", title: "A.", highlight: true }] },
			],
		});
	});
});
