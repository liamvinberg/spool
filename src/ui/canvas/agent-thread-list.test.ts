// @vitest-environment happy-dom

import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
	answerTurn,
	camera,
	cell,
	cells,
	closeThread,
	elsewhere,
	field,
	freshBrowser,
	header,
	lifeOfCell,
	log,
	marks,
	mount,
	newThread,
	ONE,
	openCell,
	press,
	queuedRows,
	rail,
	type Stream,
	send,
	settle,
	stack,
	storedThread,
	threadList,
	threadTitle,
	titleButton,
	verbs,
	waiting,
	written,
} from "./agent-rail-harness";

beforeEach(freshBrowser);

describe("the thread title", () => {
	it("opens on one thread, its title on the plate under the tab and no list until asked", async () => {
		const canvas = mount();
		await canvas.render();

		expect(threadTitle(canvas.host)).toBe("New chat");
		expect(threadList(canvas.host)).toBeNull();
		expect(titleButton(canvas.host)?.getAttribute("aria-expanded")).toBe("false");
		expect(titleButton(canvas.host)?.getAttribute("aria-haspopup")).toBe("dialog");
		// the plate says which chat; the tab above it says Agent
		expect(header(canvas.host)?.textContent).not.toContain("Agent");
		expect(canvas.host.querySelector('[data-pane-tab="agent"]')?.textContent).toBe("Agent");
		// the plus is the pane's own verb, in its tab row (#359)
		expect(verbs(canvas.host)?.querySelector('button[aria-label="New chat"]')).not.toBeNull();
		// and no marks of other threads on the plate: those are the Agent tab's one dot (#364)
		expect(elsewhere(canvas.host)).toBe(false);
	});

	/** every thread has a row of its own: nothing is elided into an overflow */
	it.each([1, 4, 12])("lists %i threads whole, and each title stays one line", async (count) => {
		const canvas = mount();
		canvas.stored.served = written(count);
		await canvas.render();
		await settle();

		expect(await cells(canvas.host)).toHaveLength(count);
		expect(await cells(canvas.host)).toContain(`ask ${count - 1}`);
		expect(await cells(canvas.host)).toContain("ask 0");
		for (const row of threadList(canvas.host)?.querySelectorAll(".agent-thread-ask") ?? []) {
			expect(row.className).toContain("truncate");
		}
		expect(titleButton(canvas.host)?.querySelector(":scope > span")?.className).toContain("truncate");
		expect(stack(canvas.host)?.style.width).toBe("380px");
	});

	/**
	 * The ask is the name, in sentence type, and a row is one line: the title, and its age.
	 * The line under it that said which frames it wrote is gone (#364); the log says that.
	 */
	it("names the open thread by its ask, and a row is its title and its age", async () => {
		const canvas = mount();
		canvas.stored.served = [
			storedThread({ id: ONE, ask: "tighten the header", frame: "home", at: Date.now() - 5 * 60_000 }),
		];
		await canvas.render();
		await settle();

		expect(threadTitle(canvas.host)).toBe("tighten the header");
		// sentence type rather than the machine register: the ask is something somebody said
		expect(titleButton(canvas.host)?.querySelector(":scope > span")?.className).not.toContain("font-mono");

		const row = await cell(canvas.host, "tighten the header");
		expect(row?.textContent).toBe("tighten the header5m");
		// a read chat draws no mark, and it runs on the usual agent, so no agent is named
		expect(row?.querySelector("[data-agent-mark]")).toBeNull();
		expect(row?.querySelector("[data-agent-thread-engine]")).toBeNull();
	});

	it("calls a chat nothing has been said in a new chat", async () => {
		const canvas = mount();
		await canvas.render();

		expect((await cell(canvas.host, "new thread"))?.querySelector(".agent-thread-ask")?.textContent).toBe("New chat");
	});

	/**
	 * The column's one glanceable answer, kept: something is moving in a chat you are not
	 * looking at. It is one dot on the agent's toggle now (#364), lit or not, and nothing
	 * for the chat you are in or for one that is read, because the log beside it is already
	 * the first.
	 */
	it("dots the Agent tab for another thread's news, and never for the one you are in", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "three takes on the empty cart");
		canvas.turn.push(waiting);
		await settle();
		expect(elsewhere(canvas.host)).toBe(false);

		// running elsewhere, with the pane lit
		await newThread(canvas.host);
		expect(canvas.host.querySelector('[data-pane-tab="agent"]')?.getAttribute("aria-selected")).toBe("true");
		expect(elsewhere(canvas.host)).toBe(true);
		expect(canvas.host.querySelector('[data-pane-tab="agent"]')?.getAttribute("aria-label")).toBe(
			"Agent, another chat has news",
		);

		// landed where nobody was looking
		await answerTurn(canvas.turn.streams[0] as Stream, "Three takes are up.");
		expect(elsewhere(canvas.host)).toBe(true);

		await openCell(canvas.host, "three takes on the empty cart");
		// opened, so read; and the new chat beside it has nothing happening in it
		expect(elsewhere(canvas.host)).toBe(false);
	});

	/** the open chat's own marks on a hidden pane say more than news elsewhere, so they win */
	it("gives way on the Agent tab to the open thread's own working mark while another tab shows", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "three takes on the empty cart");
		canvas.turn.push(waiting);
		await settle();
		await newThread(canvas.host);
		await send(canvas.host, "write the copy deck");
		canvas.turn.push(waiting);
		await settle();
		expect(elsewhere(canvas.host)).toBe(true);

		await press(canvas.host.querySelector('[data-pane-tab="properties"]'));
		const tab = canvas.host.querySelector('[data-pane-tab="agent"]');
		expect(tab?.getAttribute("aria-selected")).toBe("false");
		expect(tab?.querySelector('[data-pane-mark="working"]')).not.toBeNull();
		expect(elsewhere(canvas.host)).toBe(false);
	});

	it("drops the list on a press and takes it away on the next", async () => {
		const canvas = mount();
		await canvas.render();

		await press(titleButton(canvas.host));
		expect(threadList(canvas.host)).not.toBeNull();
		expect(threadList(canvas.host)?.getAttribute("role")).toBe("dialog");
		expect(threadList(canvas.host)?.getAttribute("aria-label")).toBe("Chats");
		expect(titleButton(canvas.host)?.getAttribute("aria-expanded")).toBe("true");

		await press(titleButton(canvas.host));
		expect(threadList(canvas.host)).toBeNull();
		// it leaves the way it came: still drawn for its exit, inert so nothing in it can be
		// pressed, and then gone (#364)
		const leaving = canvas.host.querySelector("[data-agent-threads]")?.closest("[data-float]");
		expect(leaving?.hasAttribute("inert")).toBe(true);
		expect(leaving?.hasAttribute("data-leaving")).toBe(true);
		await settle(200);
		expect(canvas.host.querySelector("[data-agent-threads]")).toBeNull();
	});

	/** where stillness was asked for an exit is a cut */
	it("goes at once when stillness is asked for", async () => {
		const canvas = mount({ still: true });
		await canvas.render();

		await press(titleButton(canvas.host));
		expect(threadList(canvas.host)).not.toBeNull();
		await press(titleButton(canvas.host));
		expect(canvas.host.querySelector("[data-agent-threads]")).toBeNull();
	});

	it("goes on escape and on a press anywhere outside it", async () => {
		const canvas = mount();
		await canvas.render();

		await press(titleButton(canvas.host));
		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		});
		expect(threadList(canvas.host)).toBeNull();

		await press(titleButton(canvas.host));
		await press(canvas.host.querySelector('[aria-label="close the threads"]'));
		expect(threadList(canvas.host)).toBeNull();
	});

	it("holds many conversations, and picking a row opens that thread and shuts the list", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "The header is tighter now.");

		await newThread(canvas.host);
		await send(canvas.host, "write the swedish copy deck");
		await answerTurn(canvas.turn.streams[1] as Stream, "The copy deck landed.");

		// newest at the top, and each turn ran under its own thread
		expect(await cells(canvas.host)).toEqual(["write the swedish copy deck", "tighten the header"]);
		expect(canvas.turn.streams[0]?.thread).not.toBe(canvas.turn.streams[1]?.thread);
		expect(log(canvas.host)).toContain("The copy deck landed.");
		// the open row holds the lightest wash, and no accent: the accent is the selection's
		const open = threadList(canvas.host)?.querySelector('[data-agent-thread][aria-current="true"]');
		expect(open?.getAttribute("data-agent-thread")).toBe("write the swedish copy deck");
		expect(open?.classList.contains("bg-raised")).toBe(true);
		expect(open?.querySelector(".bg-thread")).toBeNull();

		await openCell(canvas.host, "tighten the header");

		expect(threadList(canvas.host)).toBeNull();
		expect(log(canvas.host)).toContain("The header is tighter now.");
		expect(log(canvas.host)).not.toContain("The copy deck landed.");
		expect(threadTitle(canvas.host)).toBe("tighten the header");
	});

	/**
	 * The side's own close is the thing that shuts the pane away (#256, #359), so the title
	 * carries no caret of its own: a second control for the same act was the doubling in
	 * miniature.
	 */
	it("has no collapse caret, and the side's close still shuts it to the rail", async () => {
		const canvas = mount();
		await canvas.render();

		expect(header(canvas.host)?.querySelector('[aria-label="Collapse agent"]')).toBeNull();
		expect(rail(canvas.host)?.querySelector('[aria-label="Collapse agent"]')).toBeNull();

		await press(canvas.host.querySelector('[data-side-close="right"]'));

		expect(canvas.host.querySelector('aside[data-side="right"]')?.hasAttribute("data-side-open")).toBe(false);
		expect(canvas.host.querySelector('[data-side-rail="right"] [data-rail-icon="agent"]')).not.toBeNull();
	});

	/** the plus is a button in the header, so the keyboard reaches it the way it reaches any */
	it("starts a new thread from the plus, list or no list", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "done.");

		await press(titleButton(canvas.host));
		await newThread(canvas.host);

		// the list goes with the press, because the thread it was about has changed
		expect(threadList(canvas.host)).toBeNull();
		expect(threadTitle(canvas.host)).toBe("New chat");
		expect(await cells(canvas.host)).toEqual(["new thread", "tighten the header"]);
	});

	/**
	 * A thread is a conversation in a project rather than a conversation about a place, so
	 * there is nowhere for a switch to move to. It is why the deck carries no page at all.
	 */
	it("leaves the canvas exactly where it is", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "done.");
		await newThread(canvas.host);
		await send(canvas.host, "write the copy deck");
		await answerTurn(canvas.turn.streams[1] as Stream, "done.");

		const before = camera(canvas.host);
		const frames = [...canvas.host.querySelectorAll("[data-frame-label]")].map((frame) =>
			frame.getAttribute("data-frame-label"),
		);

		await openCell(canvas.host, "tighten the header");

		expect(camera(canvas.host)).toBe(before);
		expect(
			[...canvas.host.querySelectorAll("[data-frame-label]")].map((frame) => frame.getAttribute("data-frame-label")),
		).toEqual(frames);
	});
});

describe("a thread's mark", () => {
	/**
	 * Every life but read draws, and the two working ones draw the same thing.
	 *
	 * The thread you are looking at is the one you are most likely to be waiting on, so its
	 * row turns as a chat elsewhere does. A read chat draws nothing (#364): the row is its
	 * title now, and needs no mark to be something to press.
	 */
	it("turns for the thread in the rail while its turn runs", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		canvas.turn.push(waiting);
		await settle();

		expect(await lifeOfCell(canvas.host, "tighten the header")).toBe("streaming");
		expect((await marks(canvas.host, "tighten the header")).turning).toBe(1);
	});

	it("turns for a thread working somewhere you are not looking", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "three takes on the empty cart");
		canvas.turn.push(waiting);
		await settle();
		await newThread(canvas.host);

		expect(await lifeOfCell(canvas.host, "three takes on the empty cart")).toBe("running");
		expect((await marks(canvas.host, "three takes on the empty cart")).turning).toBe(1);
		// and the stream it left behind is still open, which is the whole point
		expect(canvas.turn.streams[0]?.aborted()).toBe(false);
	});

	it("is a solid dot once a thread lands where nobody was looking, and clears on a look", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(waiting);
		await settle();
		await newThread(canvas.host);

		await answerTurn(canvas.turn.streams[0] as Stream, "Home is shot.");
		expect(await lifeOfCell(canvas.host, "shoot home")).toBe("unread");
		expect((await marks(canvas.host, "shoot home")).drawn).toBe(1);

		await openCell(canvas.host, "shoot home");
		// opening a thread is what reads it, wherever the opening happened
		expect(await lifeOfCell(canvas.host, "shoot home")).toBe("read");
		expect((await marks(canvas.host, "shoot home")).marked).toBe(false);
	});

	/**
	 * A row is its title, so a read chat needs no mark to be pressable: the mark is kept for
	 * a chat with something to say, and quiet is the rest of them (#364).
	 */
	it("draws nothing for a read thread but its age", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		await answerTurn(canvas.turn.streams[0] as Stream, "Home is shot.");
		await newThread(canvas.host);

		expect(await lifeOfCell(canvas.host, "shoot home")).toBe("read");
		expect((await marks(canvas.host, "shoot home")).marked).toBe(false);
		expect((await cell(canvas.host, "shoot home"))?.textContent).toBe("shoot homenow");
	});
});

describe("closing a thread", () => {
	it("takes the tab out of the strip and deletes neither the session nor the picture", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "done.");
		await newThread(canvas.host);
		await send(canvas.host, "write the copy deck");
		await answerTurn(canvas.turn.streams[1] as Stream, "done.");

		await closeThread(canvas.host, "tighten the header");

		expect(await cells(canvas.host)).toEqual(["write the copy deck"]);
		// its own door, which writes one flag: nothing here is a delete
		expect(canvas.stored.closed).toEqual([canvas.turn.streams[0]?.thread]);
	});

	it("opens the newest of what is left when the open one is closed", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "The header is tighter now.");
		await newThread(canvas.host);
		await send(canvas.host, "write the copy deck");
		await answerTurn(canvas.turn.streams[1] as Stream, "The copy deck landed.");

		await closeThread(canvas.host, "write the copy deck");

		expect(await cells(canvas.host)).toEqual(["tighten the header"]);
		expect(log(canvas.host)).toContain("The header is tighter now.");
	});

	/** a tab nobody can reach must not go on holding a process the hands cannot see */
	it("stops the turn the tab was holding, and not only the read of it", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "three takes on the cart");
		canvas.turn.push(waiting);
		await settle();
		await newThread(canvas.host);
		expect(canvas.turn.streams[0]?.aborted()).toBe(false);

		await closeThread(canvas.host, "three takes on the cart");
		await settle();

		expect(canvas.turn.streams[0]?.aborted()).toBe(true);
		// and the process with it: a turn outlives the read of it now (#211), so dropping the
		// read is no longer what stops one — the stop has to be asked for
		expect(canvas.turn.stops).toHaveLength(1);
	});

	it("leaves a fresh thread behind when the last one is closed", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "done.");

		await closeThread(canvas.host, "tighten the header");

		expect(await cells(canvas.host)).toEqual(["new thread"]);
		expect(field(canvas.host)?.placeholder).toBe("Say what to change");
	});

	/**
	 * Words spool is holding are never thrown away, and a ✕ is not an exception (#170, #234).
	 *
	 * A stop hands its queue back into the box and a take-back hands one message back, so a
	 * close was the one exit that dropped them: the thread went, the queue went with it, and
	 * nothing said so. It lands in the composer the rail shows next, which is where the hands
	 * are about to be.
	 */
	it("hands the queue back into the composer it opens next", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "done.");
		await newThread(canvas.host);
		await send(canvas.host, "three takes on the cart");
		canvas.turn.push(waiting);
		await settle();
		await send(canvas.host, "hold off on the empty state");
		await send(canvas.host, "swedish weekday chips");
		expect(queuedRows(canvas.host)).toHaveLength(2);

		await closeThread(canvas.host, "three takes on the cart");
		await settle();

		// the thread is gone, its turn was stopped, and the words it was holding are in the
		// box in front of the person who wrote them, in the order they were going to be said
		expect(await cells(canvas.host)).toEqual(["tighten the header"]);
		expect(field(canvas.host)?.value).toBe("hold off on the empty state\n\nswedish weekday chips");
		expect(queuedRows(canvas.host)).toEqual([]);
	});
});
