// @vitest-environment happy-dom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Presence } from "../../team-sync-protocol";
import { joinPresence } from "./source";

/** A browser's presence on a crowded page (#107): a tick at a time, a hidden pointer, and what it doesn't know yet. */

class FakeSocket extends EventTarget {
	static made: FakeSocket[] = [];
	static readonly OPEN = 1;
	readyState = 0;
	closed = false;
	constructor(readonly url: string) {
		super();
		FakeSocket.made.push(this);
	}
	open() {
		this.readyState = 1;
		this.dispatchEvent(new Event("open"));
	}
	tell(message: object) {
		this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
	}
	send() {}
	close() {
		this.closed = true;
		this.readyState = 3;
		this.dispatchEvent(new Event("close"));
	}
}

beforeEach(() => {
	FakeSocket.made = [];
	vi.stubGlobal("WebSocket", FakeSocket);
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const state = { page: "", pointer: { x: 1, y: 2 }, pressed: false, dragging: [], inside: null, view: null };
const person = (accountId: string) => ({ accountId, name: accountId, color: "#f00" });

it("asks for ticks and hears everyone one holds, its hidden pointer, and goes on past what it doesn't know", () => {
	const heard: Presence[] = [];
	const hidden: boolean[] = [];
	const link = joinPresence("/api/teams/t/projects/p/presence", {
		heard: (presence) => heard.push(presence),
		hidden: (now) => hidden.push(now),
		dropped: () => {},
	});
	const socket = FakeSocket.made[0] as FakeSocket;
	expect(new URL(socket.url).searchParams.get("ticks")).toBe("1");
	socket.open();

	socket.tell({
		type: "presences",
		people: [
			{ type: "presence", person: person("ana"), state, still: 0 },
			{ type: "presence", person: person("ben"), state: null, still: 0 },
		],
	});
	expect(heard.map((one) => [one.person.accountId, one.state])).toEqual([
		["ana", state],
		["ben", null],
	]);
	// one alone, as an older spool.page tells it
	socket.tell({ type: "presence", person: person("cy"), state, still: 0 });
	expect(heard.at(-1)?.person.accountId).toBe("cy");

	socket.tell({ type: "presence-hidden", hidden: true });
	socket.tell({ type: "presence-hidden", hidden: false });
	expect(hidden).toEqual([true, false]);

	socket.tell({ type: "something-new", people: 3 });
	expect(socket.closed).toBe(false);
	expect(FakeSocket.made).toHaveLength(1);
	link.stop();
});
