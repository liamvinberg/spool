import { describe, expect, it } from "vitest";
import {
	openSession,
	roomPicture,
	type StageCommand,
	type StageSession,
	stepSession,
	type TalkSlide,
} from "./stage-session";

const talk: TalkSlide[] = [
	{ frame: "talk/title", beats: 1, live: false },
	{ frame: "talk/sense", beats: 3, live: false },
	{ frame: "talk/app", beats: 2, live: true },
];

const walk = (session: StageSession, ...commands: StageCommand[]) =>
	commands.reduce((at, command) => stepSession(at, command, talk), session);
const where = (session: StageSession) => [session.at.slide, session.at.beat];

describe("a talk's session", () => {
	it("plays beats before slides, forward and back across slide boundaries, and stays put at either end", () => {
		const open = openSession(talk, { slide: 0, beat: 0 }, {});
		const seen: number[][] = [];
		let session = open;
		for (let i = 0; i < 7; i++) {
			session = stepSession(session, { kind: "next" }, talk);
			seen.push(where(session));
		}
		expect(seen).toEqual([
			[1, 0],
			[1, 1],
			[1, 2],
			[2, 0],
			[2, 1],
			[2, 1],
			[2, 1],
		]);
		// back lands on the slide before at its last beat
		expect(where(walk(session, { kind: "back" }, { kind: "back" }))).toEqual([1, 2]);
		expect(where(walk(open, { kind: "back" }))).toEqual([0, 0]);
		// a step that moves nothing is the same session, unnumbered
		expect(stepSession(open, { kind: "back" }, talk)).toBe(open);
		expect(session.revision).toBe(5);
	});

	it("skips beats by slide, and jumps to either end or to a slide by number at its first beat", () => {
		const open = openSession(talk, { slide: 1, beat: 1 }, {});
		expect(where(walk(open, { kind: "next-slide" }))).toEqual([2, 0]);
		expect(where(walk(open, { kind: "previous-slide" }))).toEqual([0, 0]);
		expect(where(walk(open, { kind: "next-slide" }, { kind: "next-slide" }))).toEqual([2, 0]);
		expect(where(walk(open, { kind: "last" }))).toEqual([2, 0]);
		expect(where(walk(open, { kind: "first" }))).toEqual([0, 0]);
		expect(where(walk(open, { kind: "go", slide: 2 }))).toEqual([2, 0]);
		expect(where(walk(open, { kind: "go", slide: 1, beat: 9 }))).toEqual([1, 2]);
		// a number past the talk goes nowhere
		expect(walk(open, { kind: "go", slide: 3 })).toBe(open);
		expect(walk(open, { kind: "go", slide: -1 })).toBe(open);
		// a session opened past the talk opens on its last slide's last beat
		expect(where(openSession(talk, { slide: 7, beat: 7 }, {}))).toEqual([2, 1]);
	});

	it("restarts a slide from its first beat, its state as the talk found it, playing it in again", () => {
		let session = openSession(talk, { slide: 1, beat: 2 }, { count: 0 });
		session = walk(session, { kind: "next" }, { kind: "state", state: { count: 1 } }, { kind: "next" });
		session = walk(session, { kind: "state", state: { count: 2 } });
		expect(where(session)).toEqual([2, 1]);
		session = walk(session, { kind: "restart" });
		expect(where(session)).toEqual([2, 0]);
		expect(session.state).toEqual({ count: 0 });
		expect(session.takes).toEqual({ "talk/app": 1 });
		// the state the slide wrote since the talk arrived is what the next arrival takes along
		session = walk(session, { kind: "state", state: { count: 3 } }, { kind: "back" }, { kind: "restart" });
		expect(session.state).toEqual({ count: 3 });
		expect(session.takes).toEqual({ "talk/app": 1, "talk/sense": 1 });
		// writing the state it already holds changes nothing
		expect(walk(session, { kind: "state", state: { count: 3 } })).toBe(session);
	});

	it("hands the keyboard only to a live slide, and takes it back when the talk moves to another slide", () => {
		const onApp = openSession(talk, { slide: 2, beat: 0 }, {});
		const held = walk(onApp, { kind: "keys", on: true });
		expect(held.keys).toBe(true);
		expect(walk(held, { kind: "next" }).keys).toBe(true);
		expect(walk(held, { kind: "back" }).keys).toBe(false);
		expect(walk(held, { kind: "keys", on: false }).keys).toBe(false);
		const onTitle = openSession(talk, { slide: 0, beat: 0 }, {});
		expect(walk(onTitle, { kind: "keys", on: true })).toBe(onTitle);
	});

	it("blacks the room, and holds the room's picture while the talk moves on until it catches up", () => {
		let session = openSession(talk, { slide: 0, beat: 0 }, { n: 0 });
		session = walk(session, { kind: "black", on: true });
		expect(session.black).toBe(true);
		session = walk(session, { kind: "black", on: false }, { kind: "next" }, { kind: "freeze", on: true });
		expect(roomPicture(session).at).toEqual({ slide: 1, beat: 0 });
		session = walk(session, { kind: "next" }, { kind: "next-slide" }, { kind: "state", state: { n: 1 } });
		// the presenter is on, the room holds what it froze on
		expect(where(session)).toEqual([2, 0]);
		expect(roomPicture(session)).toEqual({ at: { slide: 1, beat: 0 }, state: { n: 0 }, takes: {} });
		session = walk(session, { kind: "freeze", on: false });
		expect(roomPicture(session)).toEqual({ at: { slide: 2, beat: 0 }, state: { n: 1 }, takes: {} });
	});
});
