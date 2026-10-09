// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IDBDatabase } from "fake-indexeddb";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../api";
import { windStrength } from "./agent-composer";
import {
	answerTurn,
	called,
	cells,
	chipDrop,
	chipRows,
	chips,
	clickHome,
	closed,
	dragOver,
	drawnStrokes,
	drop,
	elementEntry,
	ended,
	enterHome,
	field,
	footerRow,
	frameEntry,
	freshBrowser,
	live,
	modelTrigger,
	mount,
	newThread,
	ONE,
	paste,
	press,
	pressEscape,
	queuedRows,
	rail,
	resizeRail,
	rows,
	running,
	type Stream,
	say,
	send,
	sendPress,
	settle,
	settled,
	shot,
	speaking,
	stack,
	stopPress,
	storedThread,
	threadTitle,
	titleButton,
	type,
	until,
	waiting,
} from "./agent-rail-harness";

beforeEach(freshBrowser);

/**
 * What rides with the words (#116, #119, #139).
 *
 * The strip is the promise of what the prompt will carry, so what it draws is the
 * daemon's own enriched list rather than a second reading of the canvas out here —
 * which is why the stub answers a put the way the daemon does and the tests read the
 * chips off that answer.
 */
describe("the chip strip", () => {
	it("draws every entry the daemon serves, not just the first", async () => {
		const canvas = mount();
		canvas.pointed.served = ["menu", "cart", "receipt"].map(frameEntry);
		await canvas.render();

		await until(() => chips(canvas.host).length === 3);
		expect(chips(canvas.host)).toEqual(["menu", "cart", "receipt"]);
	});

	it("collapses to a count that opens into the list when the chips would take a second line", async () => {
		const canvas = mount();
		canvas.pointed.served = [
			elementEntry("cart-title", "h1", [36, 40]),
			elementEntry("line-item", "div > div:nth-child(1)", [44, 56]),
			elementEntry("line-item", "div > div:nth-child(2)", [44, 56]),
			elementEntry("total-row", "div > div:nth-child(3)", [61, 70]),
			elementEntry("pay-button", "button", [73, 81]),
		];
		await canvas.render();

		await until(() => chips(canvas.host).length === 1);
		// one line, so five element labels are a count instead — and nothing is a
		// list of two and a number
		expect(chips(canvas.host)).toEqual(["5 elements in home"]);
		expect(chipRows(canvas.host)).toEqual([]);

		const count = canvas.host.querySelector<HTMLButtonElement>('[data-agent-chip="5 elements in home"] button');
		await act(async () => count?.click());

		// two of these five are the same string, which is the whole reason removal
		// reaches out to the canvas rather than staying in the rail
		expect(chipRows(canvas.host)).toEqual([
			"cart-title · 36-40",
			"line-item · 44-56",
			"line-item · 44-56",
			"total-row · 61-70",
			"pay-button · 73-81",
		]);
	});

	it("deselects on the canvas when a chip is dismissed", async () => {
		const canvas = mount();
		await canvas.render();

		await clickHome(canvas.host);
		await until(() => chips(canvas.host).includes("home"));
		expect(canvas.host.querySelector('[data-frame-label="home"] .text-thread-strong')).not.toBeNull();

		const drop = chipDrop(canvas.host, "home");
		expect(drop).not.toBeNull();
		await act(async () => drop?.click());

		// the strip and the canvas never disagree: the ring goes with the chip, and
		// what the daemon is told goes with both
		expect(canvas.host.querySelector('[data-frame-label="home"] .text-thread-strong')).toBeNull();
		await until(() => chips(canvas.host).length === 0);
		await until(() => canvas.pointed.puts.at(-1)?.frames?.length === 0);
	});

	it("draws the frame the hands stepped into as an ordinary chip with no dismiss control", async () => {
		const canvas = mount();
		await canvas.render();

		await enterHome(canvas.host);
		await until(() => chips(canvas.host).includes("home"));

		// same accent, same word, same weight as one you picked — entering is the most
		// specific act the canvas has, and the only way out of it is a mode change
		const chip = canvas.host.querySelector('[data-agent-chip="home"]');
		expect(chip?.className).toContain("bg-raised");
		expect(chip?.className).not.toContain("bg-surface");
		expect(chipDrop(canvas.host, "home")).toBeNull();
	});

	it("keeps a line under the human's words saying what was sent with them", async () => {
		const canvas = mount();
		canvas.pointed.served = ["menu", "cart"].map(frameEntry);
		await canvas.render();
		await until(() => chips(canvas.host).length === 2);

		await send(canvas.host, "make these consistent");

		const context = canvas.host.querySelector("[data-agent-context]");
		expect(context?.textContent).toBe("menu, cart");
		// and it is a record rather than a live reading: the strip moving on does not
		// rewrite what a sent turn says it carried
		canvas.pointed.served = [frameEntry("receipt")];
		await clickHome(canvas.host);
		await until(() => chips(canvas.host).includes("receipt"));
		expect(canvas.host.querySelector("[data-agent-context]")?.textContent).toBe("menu, cart");
	});

	it("says nothing under words that carried nothing", async () => {
		const canvas = mount();
		await canvas.render();

		await send(canvas.host, "start a habit tracker");

		expect(canvas.host.querySelector("[data-agent-context]")).toBeNull();
	});
});

describe("an attached image", () => {
	it("keeps every image from repeated pastes", async () => {
		const canvas = mount();
		await canvas.render();
		await paste(canvas.host, shot());
		await paste(canvas.host, shot());
		expect(canvas.host.querySelectorAll("[data-agent-attached]")).toHaveLength(2);
		await send(canvas.host, "use both references");
		expect(canvas.turn.attachments.at(-1)).toHaveLength(2);
	});

	it("rides with the words as bytes and shows what was sent", async () => {
		const canvas = mount();
		await canvas.render();

		await paste(canvas.host, shot());
		expect(canvas.host.querySelector("[data-agent-attached] img")).not.toBeNull();

		await send(canvas.host, "match this");

		const sent = canvas.turn.attachments.at(-1)?.[0];
		expect(sent?.media).toBe("image/png");
		// the bytes themselves, base64: a browser never reveals a path, so there is
		// nothing else this could be
		expect(sent?.data).toBe("iVBORw0KGgoBAgM=");
		// the receipt is the picture, because a line of mono cannot audit one
		expect(canvas.host.querySelector('[data-agent-log] img[src^="data:image/png;base64,"]')).not.toBeNull();
		// and the composer is empty again: the reference went out with the message
		expect(canvas.host.querySelector("[data-agent-attached]")).toBeNull();
	});

	it("arrives from a drag the browser is still holding, and only from one carrying a picture", async () => {
		const canvas = mount();
		await canvas.render();

		// accepting the drag is the whole of it: without this the browser refuses the
		// drop and navigates to the file instead
		expect(await dragOver(canvas.host, [{ kind: "file", type: "image/png" }])).toBe(true);
		expect(await dragOver(canvas.host, [{ kind: "string", type: "text/plain" }])).toBe(false);
		expect(await dragOver(canvas.host, [{ kind: "file", type: "application/pdf" }])).toBe(false);

		await drop(canvas.host, shot());
		await until(() => canvas.host.querySelector("[data-agent-attached]") !== null);
	});

	it("is not taken at all when it is one the agent could not be sent", async () => {
		const canvas = mount();
		await canvas.render();

		// the composer refuses exactly what the daemon refuses, so a tile never draws
		// for something a turn would be turned away for
		await drop(canvas.host, new File([new Uint8Array([1, 2])], "logo.svg", { type: "image/svg+xml" }));
		await settle(60);
		expect(canvas.host.querySelector("[data-agent-attached]")).toBeNull();

		await send(canvas.host, "match this");
		expect(canvas.turn.attachments.at(-1)).toEqual([]);
	});

	it("can be taken back with the ✕ before it goes", async () => {
		const canvas = mount();
		await canvas.render();

		await paste(canvas.host, shot());
		const drop = canvas.host.querySelector<HTMLButtonElement>('[aria-label="drop the attached image"]');
		await act(async () => drop?.click());

		expect(canvas.host.querySelector("[data-agent-attached]")).toBeNull();
		await send(canvas.host, "never mind");
		expect(canvas.turn.attachments.at(-1)).toEqual([]);
	});

	/** 44px is enough to recognise a picture and not enough to check one */
	it("goes up at size on a press, and the press is not the way back", async () => {
		const canvas = mount();
		await canvas.render();

		await paste(canvas.host, shot());
		await act(async () => {
			canvas.host
				.querySelector<HTMLImageElement>("[data-agent-attached] img")
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// the same overlay a tool call's screenshot is held up in, with the same way out
		const held = canvas.host.querySelector<HTMLElement>("[data-agent-lightbox]");
		expect(held?.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,iVBORw0KGgoBAgM=");
		expect(held?.textContent).toContain("esc");
		// and looking at it is not dropping it: the ✕ is the only thing that does that
		expect(canvas.host.querySelector("[data-agent-attached]")).not.toBeNull();

		await act(async () => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		});
		expect(canvas.host.querySelector("[data-agent-lightbox]")).toBeNull();
		expect(canvas.host.querySelector("[data-agent-attached]")).not.toBeNull();

		await send(canvas.host, "match this");
		expect(canvas.turn.attachments.at(-1)?.[0]?.data).toBe("iVBORw0KGgoBAgM=");
	});

	/** a tile that can be pressed Enter on is one the turn will take */
	it("does not show before the browser has stored it", async () => {
		// the browser's store answers when it answers: here, when the test lets it
		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const transaction = IDBDatabase.prototype.transaction;
		vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(function (
			this: IDBDatabase,
			...args: Parameters<IDBDatabase["transaction"]>
		) {
			const opened = transaction.apply(this, args);
			if (args[1] !== "readwrite") return opened;
			Object.defineProperty(opened, "oncomplete", {
				set(done: (event: Event) => void) {
					opened.addEventListener("complete", (event) => void held.then(() => done.call(opened, event)));
				},
			});
			return opened;
		});
		const canvas = mount();
		await canvas.render();

		await act(async () => {
			const event = new Event("paste", { bubbles: true });
			Object.defineProperty(event, "clipboardData", { value: { files: [shot()] } });
			field(canvas.host)?.dispatchEvent(event);
		});
		// the rail goes on drawing while the bytes are on their way to disk
		await settle(1000);
		expect(canvas.host.querySelector("[data-agent-attached]")).toBeNull();

		release();
		await until(() => canvas.host.querySelector("[data-agent-attached]") !== null);
		await send(canvas.host, "match this");
		expect(canvas.turn.attachments.at(-1)?.[0]?.data).toBe("iVBORw0KGgoBAgM=");
	});
});

describe("stopping a turn", () => {
	it("stops it on a press in the composer footer", async () => {
		const canvas = mount();
		await running(canvas);

		const press = stopPress(canvas.host);
		expect(press).not.toBeNull();
		await act(async () => press?.click());

		expect(canvas.turn.stops).toHaveLength(1);
	});

	it("keeps the turn running on escape from the composer", async () => {
		const canvas = mount();
		await running(canvas);

		await pressEscape(canvas.host, "composer");

		expect(canvas.turn.stops).toHaveLength(0);
	});

	it("draws what it caught as stopped, and never echoes the notice back at you", async () => {
		const canvas = mount();
		await running(canvas);
		// two reads open, which is the shape the capture holds: one whose block closed and
		// gets only the synthetic rejection, one cut mid-argument with no result at all
		canvas.turn.push(called("t1", "Read", { file_path: "/project/CLAUDE.md" }));
		canvas.turn.push({ kind: "call", id: "t2", block: 1, tool: "Read", parent: null });
		await act(async () => stopPress(canvas.host)?.click());

		// the aftermath the interrupt leaves: the caught call is stamped with the same
		// denial kind a permission decline gets, so the error alone cannot tell them apart
		canvas.turn.push(settled("t1", { failed: true, nonExecution: "user-rejected" }));
		canvas.turn.push({
			kind: "ended",
			ending: "stopped",
			reason: "aborted_streaming",
			stopReason: null,
			parent: null,
		});
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle();

		// the half-typed one is a bare verb with no subject, which is beat one of three
		expect(rows(canvas.host)).toEqual(["read CLAUDE.md", "read"]);
		// one flat stroke each and nothing else drawn anywhere: a check is two strokes
		// meeting, a cross two crossing, and spool never says something errored when it
		// simply never ran
		expect(drawnStrokes(canvas.host)).toEqual(["M4.4 7h5.2", "M4.4 7h5.2"]);
		// spool says its own word for the boundary, and never the binary's note: that one
		// is addressed to the model, and echoing it reports your own press back at you
		const log = canvas.host.querySelector("[data-agent-log]")?.textContent ?? "";
		expect(log).toContain("stopped");
		expect(log).not.toContain("[Request interrupted by user]");
	});

	it("keeps the turn running on repeated escape from the canvas", async () => {
		const canvas = mount();
		await running(canvas);
		// clicking out to watch a frame repaint is the state this whole rail is built
		// for, and it gives the key back to the canvas
		await clickHome(canvas.host);
		await settle(50);

		// the frame the click selected is the first rung, and it goes first
		await pressEscape(canvas.host, "canvas");
		expect(canvas.turn.stops).toHaveLength(0);

		await pressEscape(canvas.host, "canvas");
		await pressEscape(canvas.host, "canvas");
		expect(canvas.turn.stops).toHaveLength(0);
	});

	it("is offered against a turn that is still a process, and against nothing else", async () => {
		const canvas = mount();
		await canvas.render();

		// nothing has been said, so there is nothing to stop: the place holds Send, and it is
		// dead while the box is empty
		expect(stopPress(canvas.host)).toBeNull();
		expect(sendPress(canvas.host)?.disabled).toBe(true);

		await send(canvas.host, "shoot the receipt");
		canvas.turn.push(waiting);
		await settle();
		expect(stopPress(canvas.host)).not.toBeNull();
		expect(sendPress(canvas.host)).toBeNull();

		// a parked turn is spending nothing and moving nowhere, and it is still a process
		// standing in the repo: the question's own dismiss answers the question, and this is
		// the only way out of the turn behind it (#234)
		canvas.turn.push({ kind: "called", id: "c1", tool: "Bash", input: { command: "spool upgrade" }, parent: null });
		canvas.turn.push({
			kind: "asking",
			request: "req-1",
			call: "c1",
			tool: "Bash",
			display: "Bash",
			input: { command: "spool upgrade" },
			description: "Upgrade the spool CLI",
			interaction: false,
			suggestions: [],
			parent: null,
		});
		await until(() => canvas.host.querySelector("[data-agent-ask]") !== null);
		expect(stopPress(canvas.host)).not.toBeNull();

		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle();
		expect(stopPress(canvas.host)).toBeNull();
		expect(sendPress(canvas.host)).not.toBeNull();
	});

	/** Send is the Enter a pointer can reach: it takes the same words the same way (#364) */
	it("sends from the Send press, which is Stop while a turn runs", async () => {
		const canvas = mount();
		await canvas.render();
		await act(async () => type(field(canvas.host) as HTMLTextAreaElement, "tidy the receipt"));
		expect(sendPress(canvas.host)?.disabled).toBe(false);

		await act(async () => sendPress(canvas.host)?.click());
		await settle(50);
		expect(canvas.turn.prompts).toEqual(["tidy the receipt"]);
		expect(field(canvas.host)?.value).toBe("");

		// while the turn runs the press is Stop, so the words wait on Enter instead, and the
		// field says that what it takes now is what comes next
		canvas.turn.push(waiting);
		await settle();
		expect(stopPress(canvas.host)).not.toBeNull();
		expect(field(canvas.host)?.placeholder).toBe("Say what comes next");
		expect(field(canvas.host)?.getAttribute("aria-label")).toBe("Say what comes next");

		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle();
		expect(field(canvas.host)?.placeholder).toBe("Say what to change");
	});

	it("stops a turn parked on a question, and hands its queue back", async () => {
		const canvas = mount();
		await running(canvas);
		await send(canvas.host, "hold off on add-habit");
		canvas.turn.push({ kind: "called", id: "c1", tool: "Bash", input: { command: "rm -rf build" }, parent: null });
		canvas.turn.push({
			kind: "asking",
			request: "req-1",
			call: "c1",
			tool: "Bash",
			display: "Bash",
			input: { command: "rm -rf build" },
			description: "Remove the build folder",
			interaction: false,
			suggestions: [],
			parent: null,
		});
		await until(() => canvas.host.querySelector("[data-agent-ask]") !== null);

		await pressEscape(canvas.host, "composer");
		expect(canvas.turn.stops).toHaveLength(0);
		expect(queuedRows(canvas.host)).toEqual(["hold off on add-habit"]);
		await act(async () => stopPress(canvas.host)?.click());

		expect(canvas.turn.stops).toHaveLength(1);
		expect(field(canvas.host)?.value).toBe("hold off on add-habit");
		expect(queuedRows(canvas.host)).toEqual([]);
	});
});

/**
 * The box outlives the tab, because a browser is where a thing is lost by a keystroke
 * (#234).
 *
 * A stop hands a whole queue back into the composer, which makes the composer the place a
 * turn's worth of typing can be sitting — and it was memory only, so a refresh took it.
 */
describe("what the composer keeps", () => {
	it("returns to the conversation when an unsent new chat was emptied", async () => {
		const canvas = mount();
		canvas.stored.served = [storedThread({ id: ONE, ask: "existing conversation" })];
		await canvas.render();
		await newThread(canvas.host);
		await act(async () => type(field(canvas.host) as HTMLTextAreaElement, "discard this draft"));
		await act(async () => type(field(canvas.host) as HTMLTextAreaElement, ""));
		await canvas.leave();
		await canvas.render();
		await until(() => titleButton(canvas.host)?.textContent?.includes("existing conversation") === true);
		expect(field(canvas.host)?.value).toBe("");
	});

	it("restores an unsent new chat with every image after leaving the project", async () => {
		const canvas = mount();
		await canvas.render();
		await paste(canvas.host, shot(), shot());
		await act(async () => type(field(canvas.host) as HTMLTextAreaElement, "still writing"));
		await canvas.leave();
		await canvas.render();
		await until(() => field(canvas.host)?.value === "still writing");
		expect(canvas.host.querySelectorAll("[data-agent-attached]")).toHaveLength(2);
		expect(canvas.turn.prompts).toEqual([]);
	});

	it("keeps words typed while the conversation list is still loading", async () => {
		const canvas = mount();
		let resolve = () => {};
		canvas.stored.hold = new Promise<void>((done) => {
			resolve = done;
		});
		await canvas.render();
		await act(async () => type(field(canvas.host) as HTMLTextAreaElement, "typed while loading"));
		await act(async () => resolve());
		await settle(100);
		expect(field(canvas.host)?.value).toBe("typed while loading");
	});

	it("writes the words in the box down with the thread they belong to", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		await answerTurn(canvas.turn.streams[0] as Stream, "done.");

		await act(async () => {
			const box = field(canvas.host);
			if (box !== null) type(box, "and now the receipt, but only the");
		});
		// on the throttle rather than per keystroke: a PUT a character is what the throttle
		// is there to stop
		await settle(2400);

		expect(canvas.stored.puts.at(-1)?.body.draft).toBe("and now the receipt, but only the");
	});

	it("comes back to the sentence the tab went away in the middle of", async () => {
		const canvas = mount();
		canvas.stored.served = [
			storedThread({ id: ONE, ask: "tighten the header", draft: "and now the receipt, but only the" }),
		];
		await canvas.render();
		await settle();

		expect(field(canvas.host)?.value).toBe("and now the receipt, but only the");
	});
});

describe("the footer the model hangs off", () => {
	/**
	 * The foot is two ends (#364): who answers and what it may do on the left, after the
	 * attach, and the press that sends or stops on the right, which is where a hand that
	 * just typed is.
	 */
	it("holds attach, model and mode on the left, and the stop on the right", async () => {
		const canvas = mount();
		await running(canvas);
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("Opus") === true);
		const footer = footerRow(canvas.host);
		if (footer === null) throw new Error("no footer");

		const controls = [...footer.querySelectorAll<HTMLButtonElement>(":scope > button, :scope > span > button")];
		expect(controls.map((button) => button.getAttribute("aria-label"))).toEqual([
			"Attach an image",
			"Choose model",
			"Agent permissions: Ask first",
		]);
		// the mode in the words a person reads, never the setting's own value
		expect(footer.textContent).toBe("Opus (1M context)Ask first");
		expect(footer.textContent).not.toContain("weekly limit");
		expect(footer.textContent).not.toContain("enter to");
		// and the stop is the other end, outside the left group
		expect(footer.contains(stopPress(canvas.host))).toBe(false);
		expect(footer.parentElement?.lastElementChild?.contains(stopPress(canvas.host))).toBe(true);
	});

	/** a picture is pasted or dropped, and a pointer can also go and get one */
	it("attaches an image from the file the Attach press opens", async () => {
		const canvas = mount();
		await canvas.render();
		const input = footerRow(canvas.host)?.querySelector<HTMLInputElement>('input[type="file"]');
		expect(input?.hidden).toBe(true);
		let opened = 0;
		if (input)
			input.click = () => {
				opened += 1;
			};
		await press(footerRow(canvas.host)?.querySelector('[aria-label="Attach an image"]'));
		expect(opened).toBe(1);

		await act(async () => {
			Object.defineProperty(input, "files", { configurable: true, value: [shot()] });
			input?.dispatchEvent(new Event("change", { bubbles: true }));
		});
		await until(() => canvas.host.querySelectorAll("[data-agent-attached]").length === 1);
	});

	it("truncates the name and never shortens it, across the whole drag range", async () => {
		const canvas = mount();
		await canvas.render();
		await until(() => modelTrigger(canvas.host)?.textContent?.includes("Opus") === true);

		for (const width of [380, 420, 480, 560]) {
			await resizeRail(canvas.host, width);
			expect(stack(canvas.host)?.style.width).toBe(`${width}px`);
			const name = modelTrigger(canvas.host)?.querySelector("span");
			// `Opus (1M context)` cut to `Opus` would be the correct name of a *different*
			// machine — `/model opus` resolves without the 1M window — so the string stays
			// whole in the DOM and the layout is what gives way
			expect(name?.textContent).toBe("Opus (1M context)");
			expect(name?.className).toContain("truncate");
			// and the model is the only thing that gives way: a cut name is still readable
			// and half a stop button is not
			expect(modelTrigger(canvas.host)?.className).toContain("min-w-0");
		}

		// and the stop, which only exists against a turn in flight, never gives way at all
		await send(canvas.host, "go");
		canvas.turn.push(waiting);
		await settle(150);
		expect(stopPress(canvas.host)?.className).toContain("shrink-0");
	});
});

/**
 * How full the window is (#364): a ring by the send, only once there is something to do
 * about it, and pressed it says how full and the one thing to do.
 */
describe("the context ring", () => {
	const ring = (host: HTMLElement) => live<HTMLButtonElement>(host, "[data-agent-context-ring]")[0] ?? null;
	const note = (host: HTMLElement) => live(host, "[data-agent-context-note]")[0] ?? null;
	const used = (share: number): AgentEvent => ({
		kind: "context",
		used: share * 200_000,
		window: 200_000,
		parent: null,
	});

	it("stays hidden under 60% of the window, because there is nothing to act on yet", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "go");
		canvas.turn.push(waiting);
		canvas.turn.push(used(0.59));
		await settle();

		expect(ring(canvas.host)).toBeNull();
	});

	it("shows past it, and pressed says how full and offers a new chat", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "tighten the header");
		canvas.turn.push(waiting);
		canvas.turn.push(used(0.72));
		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle();

		expect(ring(canvas.host)?.getAttribute("data-agent-context-ring")).toBe("72");
		expect(ring(canvas.host)?.getAttribute("aria-label")).toBe("72% of context used.");
		expect(ring(canvas.host)?.getAttribute("aria-expanded")).toBe("false");
		// it stands with the send, on the right of the foot
		expect(ring(canvas.host)?.parentElement?.parentElement?.contains(sendPress(canvas.host))).toBe(true);
		expect(note(canvas.host)).toBeNull();

		await press(ring(canvas.host));
		expect(ring(canvas.host)?.getAttribute("aria-expanded")).toBe("true");
		expect(note(canvas.host)?.textContent).toContain("72% of context used.");
		expect(note(canvas.host)?.textContent).toContain("A new chat starts fresh.");

		await press(
			[...(note(canvas.host)?.querySelectorAll("button") ?? [])].find((one) => one.textContent === "New chat"),
		);
		// a new chat, and the note goes with the press
		expect(note(canvas.host)).toBeNull();
		expect(threadTitle(canvas.host)).toBe("New chat");
		expect(await cells(canvas.host)).toEqual(["new thread", "tighten the header"]);
		// and a new chat has a window with nothing in it
		expect(ring(canvas.host)).toBeNull();
	});
});

/**
 * The stroke on the composer's top border, which is what says the agent is alive (#N).
 *
 * It spends no transcript pixels: it rides the hairline the composer already draws. So
 * what there is to assert is which of three pictures is up, and then the arithmetic of the
 * stroke itself, which lives in the stylesheet rather than in any element — a keyframe's
 * values are not reachable from a mounted node, so the last block reads the file the way
 * `agent-said.test.ts` reads it.
 */
describe("the stroke on the composer's border", () => {
	const stroke = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-wind]");
	const state = (host: HTMLElement) => stroke(host)?.getAttribute("data-agent-wind");
	const laying = (host: HTMLElement) => stroke(host)?.className.includes("animate-agent-wind") ?? false;
	const stopped = (host: HTMLElement) => stroke(host)?.className.includes("animation-play-state:paused") ?? false;
	const broken = (host: HTMLElement) =>
		host.querySelector<HTMLElement>("[data-agent-wind-break]")?.className.includes("opacity-100") ?? false;

	/** a still of the rail at rest is the rail as it shipped: the border and nothing over it */
	it("draws the border unchanged while nothing is running", async () => {
		const canvas = mount();
		await canvas.render();

		expect(state(canvas.host)).toBe("idle");
		expect(laying(canvas.host)).toBe(false);
		expect(broken(canvas.host)).toBe(false);
	});

	/**
	 * One picture for every state of a turn in flight. A reader watching the edge of their
	 * own eye learns nothing from the difference between a request being out and a `read`
	 * being open, because the answer to *do I need to do anything* is no in both.
	 */
	it("lays and takes up for a request out, a thought, words and work alike", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");

		canvas.turn.push(waiting);
		await settle();
		expect(state(canvas.host)).toBe("laying");

		canvas.turn.push(speaking);
		canvas.turn.push({ kind: "thinking", block: 0, tokens: 40, parent: null });
		await settle();
		expect(state(canvas.host)).toBe("laying");

		canvas.turn.push(say("the frame is live."));
		canvas.turn.push({ kind: "called", id: "c9", tool: "Read", input: { file_path: "/project/x" }, parent: null });
		await settle();
		expect(state(canvas.host)).toBe("laying");
		expect(laying(canvas.host)).toBe(true);
		expect(stopped(canvas.host)).toBe(false);
		expect(broken(canvas.host)).toBe(false);
	});

	/**
	 * And the one thing it does say about how long is strength, never pace (#231).
	 *
	 * The travel is the constraint rather than a detail. This came from a rail that read as
	 * stopped, so the indicator may not answer *how long has this been* by moving less: a
	 * take that slowed the only moving thing in the rail would answer *is this alive* with
	 * less evidence that it is, exactly when a reader is asking. It carries upward instead —
	 * a longer silence draws a more present line, never a fainter one — and it tops out at
	 * thirty seconds, because 22 of the 27 thinking blocks in the captures are 1,050
	 * estimated tokens or fewer, which is under 18 seconds at the measured rate.
	 */
	it("carries the length of a silence upward, and tops out at thirty seconds", () => {
		expect(windStrength(0, true)).toBeCloseTo(0.75, 4);
		expect(windStrength(15_000, true)).toBeCloseTo(0.875, 4);
		expect(windStrength(30_000, true)).toBeCloseTo(1, 4);
		// the worst thought measured is 9,500 tokens, about 159s: it pins rather than wraps
		expect(windStrength(159_000, true)).toBeCloseTo(1, 4);
		expect(windStrength(0, true)).toBeLessThan(windStrength(4000, true));
	});

	/** nothing out is the stroke as it shipped, whatever the turn did before */
	it("rests at the strength the stroke has always had when nothing is out", () => {
		expect(windStrength(0, false)).toBeCloseTo(0.75, 4);
		expect(windStrength(159_000, false)).toBeCloseTo(0.75, 4);
	});

	/**
	 * And the rail is wired to it, with the travel left alone.
	 *
	 * The arithmetic above is the behaviour; this is the wiring, and the second assertion is
	 * the one that matters. No `animation-duration` of the stroke's own means the cycle is
	 * still the stylesheet's 1600ms at every length of wait, which is the constraint this
	 * take was chosen under.
	 */
	it("hands the stroke its strength and leaves the cycle to the stylesheet", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");

		canvas.turn.push(waiting);
		await settle();

		expect(Number(stroke(canvas.host)?.style.opacity ?? "")).toBeCloseTo(0.75, 2);
		expect(stroke(canvas.host)?.style.animationDuration).toBe("");
		expect(laying(canvas.host)).toBe(true);
	});

	/**
	 * The one state that is a call to act gets a shape of its own rather than the same
	 * picture slower: the stroke stops where the request caught it and an 18px break opens
	 * in the line. Stopping is the animation paused, so nothing of spool's holds the clock.
	 */
	it("stops where it was and breaks the line while the turn waits on a person", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push({ kind: "called", id: "c1", tool: "Bash", input: { command: "spool upgrade" }, parent: null });
		canvas.turn.push({
			kind: "asking",
			request: "req-a",
			call: "c1",
			tool: "Bash",
			display: "Bash",
			input: { command: "spool upgrade" },
			description: "Run `spool upgrade`",
			interaction: false,
			suggestions: [],
			parent: null,
		});
		await until(() => state(canvas.host) === "parked");

		expect(laying(canvas.host)).toBe(true);
		expect(stopped(canvas.host)).toBe(true);
		expect(broken(canvas.host)).toBe(true);
	});

	/** the turn is over, so the border is the border again */
	it("is gone once the turn has ended", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(waiting);
		canvas.turn.push(speaking);
		canvas.turn.push(say("done."));
		canvas.turn.push(ended);
		// the daemon is what says the turn is over, so it lays until the process goes (#234)
		canvas.turn.push(closed);
		canvas.turn.close();
		await until(() => state(canvas.host) === "idle");

		expect(laying(canvas.host)).toBe(false);
		expect(broken(canvas.host)).toBe(false);
	});

	/**
	 * The stroke is the entire indicator. Earlier candidates carried a `working` or an
	 * `idle` beside it and both were rejected: a word on the boundary is a word to read,
	 * and the whole argument for a stroke is that it is answered without reading anything.
	 */
	it("carries no word, and nothing that could hold one", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(waiting);
		await settle();

		const parts = [...canvas.host.querySelectorAll("[data-agent-wind], [data-agent-wind-break]")];
		expect(parts).toHaveLength(2);
		for (const part of parts) {
			expect(part.textContent).toBe("");
			expect(part.children).toHaveLength(0);
			expect(part.getAttribute("aria-hidden")).toBe("true");
		}
		expect(rail(canvas.host)?.textContent).not.toContain("working");
	});
});

/**
 * The arithmetic of the stroke, which is a stylesheet fact.
 *
 * Two independently moving ends on one composited matrix: `translateX` is the tail and
 * `scaleX` about a left origin is the length. Neither the cycle nor a keyframe's values are
 * reachable from a mounted element, so this reads the file.
 */
describe("the stylesheet the stroke lives in", () => {
	const CSS = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8");
	const block = (open: string): string => {
		const at = CSS.indexOf(open);
		if (at === -1) throw new Error(`no ${open}`);
		const end = CSS.indexOf("\n\t}", at);
		return CSS.slice(at, end === -1 ? undefined : end);
	};
	/** every stop as [tail, length], both fractions of the track */
	const stops = [...block("@keyframes agent-wind").matchAll(/translateX\((-?[\d.]+)%\) scaleX\(([\d.]+)\)/g)].map(
		(stop) => [Number(stop[1]) / 100, Number(stop[2])] as const,
	);

	it("lays and takes up once every 1600ms", () => {
		expect(CSS).toContain("--animate-agent-wind: agent-wind 1600ms linear infinite");
	});

	/**
	 * Linear, because the easing is in the values: each end has its own smoothstep over its
	 * own part of the cycle, and one shared timing function cannot express two.
	 */
	it("moves two ends on one matrix and nothing else", () => {
		const frames = block("@keyframes agent-wind");

		expect(stops).toHaveLength(21);
		expect(frames).not.toMatch(/opacity|filter|background|width|left|margin/);
	});

	/** so the loop restarts on screen with nothing drawn, rather than off the right edge */
	it("is nothing at all at both ends of the cycle", () => {
		expect(stops.at(0)).toEqual([0, 0]);
		expect(stops.at(-1)).toEqual([1, 0]);
	});

	/**
	 * The progress question, answered by the arithmetic rather than by taste: no state of
	 * it is full, and its length falls for the whole second half of the cycle. A bar that
	 * empties on the way to completion is not the idiom.
	 */
	it("is never full and never accumulates", () => {
		const lengths = stops.map(([, length]) => length);
		const longest = Math.max(...lengths);

		expect(longest).toBeCloseTo(0.41, 2);
		expect(lengths.indexOf(longest)).toBe(10);
		const falling = lengths.slice(10);
		expect(falling).toEqual([...falling].sort((one, two) => two - one));
		// and the tail only ever goes forward, so nothing is ever laid backwards
		const tails = stops.map(([tail]) => tail);
		expect(tails).toEqual([...tails].sort((one, two) => one - two));
	});

	/**
	 * Stillness cannot mean absence here, because the stroke is the whole indicator. It is
	 * held a third of the way along its own cycle instead, which is the same picture
	 * everybody else sees with nothing moving in it.
	 */
	it("holds one static stroke when stillness is asked for", () => {
		const at = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
		const still = CSS.slice(at, CSS.indexOf("\n}", at));

		expect(still).toContain(".animate-agent-wind");
		expect(still).toContain("animation: none");
		expect(still).toContain("transform: translateX(6.372%) scaleX(0.3406)");
	});
});
