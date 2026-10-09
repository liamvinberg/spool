// @vitest-environment happy-dom

import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	checkAgain,
	closed,
	ended,
	field,
	freshBrowser,
	lifeOfCell,
	modelTrigger,
	mount,
	outStrip,
	press,
	rail,
	refused,
	said,
	say,
	send,
	settle,
	speaking,
	waiting,
	wall,
} from "./agent-rail-harness";

beforeEach(freshBrowser);

describe("no agent on this machine", () => {
	it("names the missing engine while keeping history and engine choice", async () => {
		const canvas = mount();
		canvas.preflight.installed = false;
		await canvas.render();
		await settle(50);

		expect(wall(canvas.host)?.textContent).toContain("Claude Code isn’t installed.");
		expect(canvas.host.querySelector("[data-agent-log]")).not.toBeNull();
		// the vendor's own install line, to paste into a terminal
		expect(wall(canvas.host)?.querySelector("code")?.textContent).toBe("npm i -g @anthropic-ai/claude-code");
		// nothing was sent, and nothing was asked about a login either: this state is
		// answered by looking, and looking is free
		expect(canvas.turn.prompts).toEqual([]);
		expect(canvas.preflight.asked).toBe(0);
	});

	/**
	 * The composer stays and it is dead: take it away and the rail is a sentence with no
	 * evidence of what the rail is for, leave it live and it collects a prompt for nobody.
	 */
	it("keeps the draft and engine control while refusing sends", async () => {
		const canvas = mount();
		canvas.preflight.installed = false;
		await canvas.render();
		await settle(50);

		expect(modelTrigger(canvas.host)).not.toBeNull();
		await send(canvas.host, "held while missing");
		expect(canvas.turn.prompts).toEqual([]);
		expect(field(canvas.host)).not.toBeNull();
	});

	/**
	 * Installing an agent takes minutes rather than the second a login takes, so pressing
	 * this twice is the normal case and a press that leaves no mark reads as broken.
	 */
	it("lets its check fail as often as it likes, and says so each time", async () => {
		const canvas = mount();
		canvas.preflight.installed = false;
		await canvas.render();
		await settle(50);
		expect(canvas.host.querySelector("[data-agent-looked]")).toBeNull();

		await checkAgain(wall(canvas.host));
		expect(canvas.host.querySelector("[data-agent-looked]")?.textContent).toBe("Claude Code is still not installed.");

		await checkAgain(wall(canvas.host));
		expect(canvas.host.querySelector("[data-agent-looked]")?.textContent).toBe("Claude Code is still not installed.");
		expect(canvas.preflight.looks).toBeGreaterThanOrEqual(3);
		// and the wall is still the whole of the rail's body
		expect(field(canvas.host)).not.toBeNull();
	});

	it("goes the moment a check finds one, and the composer comes back", async () => {
		const canvas = mount();
		canvas.preflight.installed = false;
		await canvas.render();
		await settle(50);

		canvas.preflight.installed = true;
		await checkAgain(wall(canvas.host));

		expect(wall(canvas.host)).toBeNull();
		expect(field(canvas.host)?.placeholder).toBe("Say what to change");
		await send(canvas.host, "shoot home");
		expect(canvas.turn.prompts).toEqual(["shoot home"]);
	});

	/** a wall is spool saying it looked, so a door that said nothing draws no wall */
	it("draws no wall when the door said nothing", async () => {
		const canvas = mount();
		await canvas.render();
		await settle(50);

		expect(wall(canvas.host)).toBeNull();
		expect(field(canvas.host)).not.toBeNull();
	});

	/**
	 * And it never guesses the other way either. A door that cannot answer is not a machine
	 * that grew an agent: taking the wall down on it would put a live composer over nothing
	 * to spawn, on the one press meant to find out.
	 */
	it("keeps the wall when a look comes back with no answer", async () => {
		const canvas = mount();
		canvas.preflight.installed = false;
		await canvas.render();
		await settle(50);

		canvas.preflight.installed = null;
		await checkAgain(wall(canvas.host));

		expect(wall(canvas.host)).not.toBeNull();
		expect(canvas.host.querySelector("[data-agent-looked]")).not.toBeNull();
		expect(field(canvas.host)).not.toBeNull();
	});
});

describe("no supported agent at all (#363)", () => {
	const theWall = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-agent-wall]");
	const none = [
		{ id: "claude", installed: false },
		{ id: "pi", installed: false },
	];

	it("is the wall: one install line per agent, each with its own copy, and a dead composer", async () => {
		const canvas = mount();
		canvas.preflight.engines = none;
		canvas.preflight.installed = false;
		const copied = vi.fn(async (_text: string) => {});
		vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: copied } });
		await canvas.render();
		await settle(50);
		const lines = [...(theWall(canvas.host)?.querySelectorAll("[data-agent-install] code") ?? [])].map(
			(line) => line.textContent,
		);
		expect(lines).toEqual([
			"npm i -g @anthropic-ai/claude-code",
			"npm i -g @openai/codex",
			"npm i -g @earendil-works/pi-coding-agent",
		]);
		expect(canvas.host.querySelector("[data-agent-dead]")).not.toBeNull();
		await press(canvas.host.querySelector('[aria-label="Copy the pi install line"]'));
		expect(copied).toHaveBeenCalledWith("npm i -g @earendil-works/pi-coding-agent");
		expect(canvas.host.querySelector('[data-agent-install="pi"] [aria-label="Copied"]')).not.toBeNull();
	});

	it("comes down on Check again once one is installed", async () => {
		const canvas = mount();
		canvas.preflight.engines = none;
		canvas.preflight.installed = false;
		await canvas.render();
		await settle(50);
		await checkAgain(theWall(canvas.host));
		expect(canvas.host.querySelector("[data-agent-looked]")?.textContent).toBe("still nothing on your PATH");
		canvas.preflight.engines = [
			{ id: "claude", installed: false },
			{ id: "pi", installed: true },
		];
		await checkAgain(theWall(canvas.host));
		expect(theWall(canvas.host)).toBeNull();
	});

	it("looks again on its own when the window comes back into focus", async () => {
		const canvas = mount();
		canvas.preflight.engines = none;
		canvas.preflight.installed = false;
		await canvas.render();
		await settle(50);
		expect(theWall(canvas.host)).not.toBeNull();
		canvas.preflight.engines = [{ id: "claude", installed: true }];
		canvas.preflight.installed = true;
		const looks = canvas.preflight.looks;
		await act(async () => window.dispatchEvent(new Event("focus")));
		await settle(50);
		expect(canvas.preflight.looks).toBeGreaterThan(looks);
		expect(theWall(canvas.host)).toBeNull();
		expect(field(canvas.host)?.placeholder).toBe("Say what to change");
	});
});

describe("signed out", () => {
	/**
	 * Nothing local knows the login is bad. The spawn is the question, so the words go out
	 * and land in the log the instant Enter is pressed, and the refusal arrives when the
	 * first token would have — a composer that refused instantly would be spool guessing,
	 * and it would guess wrong the moment somebody signs in without telling it.
	 */
	it("is found out by spawning, and the words are in the log before the refusal is", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");

		expect(canvas.turn.prompts).toEqual(["shoot home"]);
		expect(rail(canvas.host)?.textContent).toContain("shoot home");
		expect(outStrip(canvas.host)).toBeNull();

		canvas.turn.push(refused);
		canvas.turn.close();
		await settle();

		// the binary's own words, verbatim, and one sentence of spool's under them saying
		// what to do about it from here
		expect(rail(canvas.host)?.textContent).toContain("Not logged in · Please run /login");
		expect(rail(canvas.host)?.textContent).toContain("Run claude auth login in a terminal.");
		expect(rail(canvas.host)?.textContent).not.toContain("never asks for a key");
		expect(outStrip(canvas.host)?.textContent).toContain("Sign in to Claude Code to continue.");
		// nothing local knows any better than the last spawn did, so the composer stays live
		// and the next send is a send: it would answer wrong the moment somebody signs in
		// without telling it
		expect(field(canvas.host)?.placeholder).toBe("Say what to change");
		await send(canvas.host, "again then");
		expect(canvas.turn.prompts).toEqual(["shoot home"]);
		expect(field(canvas.host)?.value).toBe("again then");
	});

	it("holds the prompt, and checking again runs it with no second copy of it", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(refused);
		canvas.turn.close();
		await settle();

		canvas.preflight.login = { signedIn: true, account: "ada@kaffe.se" };
		await checkAgain(outStrip(canvas.host));

		// the same words, sent again, without anybody retyping a sentence to prove they
		// meant it — and said once, so the log holds one copy of them
		expect(canvas.turn.prompts).toEqual(["shoot home", "shoot home"]);
		expect(said(canvas.host, "shoot home")).toBe(1);
		// the account is named once, from the reply, at the moment spool starts using it
		expect(rail(canvas.host)?.textContent).toContain("signed in as ada@kaffe.se");
		expect(outStrip(canvas.host)).toBeNull();
	});

	it("says so and runs nothing when the check comes back with the same answer", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(refused);
		canvas.turn.close();
		await settle();

		await checkAgain(outStrip(canvas.host));

		expect(canvas.turn.prompts).toEqual(["shoot home"]);
		expect(rail(canvas.host)?.textContent).toContain("still signed out");
		expect(outStrip(canvas.host)).not.toBeNull();

		// a press that keeps saying the same thing leaves the one line saying it, rather
		// than stacking a third identical boundary across the log
		await checkAgain(outStrip(canvas.host));
		expect(canvas.preflight.asked).toBe(2);
		expect(said(canvas.host, "still signed out")).toBe(1);
	});

	/** the mark and the strip say the same thing, and they stop saying it together */
	it("marks the thread waiting, and stops once a turn does not bounce", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(refused);
		canvas.turn.close();
		await settle();
		expect(await lifeOfCell(canvas.host, "shoot home")).toBe("waiting");

		canvas.preflight.login = { signedIn: true, account: "ada@kaffe.se" };
		await checkAgain(outStrip(canvas.host));
		canvas.turn.push(waiting);
		await settle(150);

		// the turn that ran is what says the bounce stopped, and it says it while it runs
		expect(await lifeOfCell(canvas.host, "shoot home")).toBe("streaming");
		expect(outStrip(canvas.host)).toBeNull();

		canvas.turn.push(speaking);
		canvas.turn.push(say("on it."));
		canvas.turn.push(ended);
		canvas.turn.push(closed);
		canvas.turn.close();
		await settle(600);

		// and it stays stopped: the refusal is in the log above, where it happened, and the
		// thread it happened in is one somebody has read
		expect(await lifeOfCell(canvas.host, "shoot home")).toBe("read");
		expect(outStrip(canvas.host)).toBeNull();
	});

	/**
	 * The API-key state is cut, and cutting it is a decision: spool asks for nothing and
	 * stores nothing, so a warning would be spool holding an opinion about somebody's
	 * billing arrangement. What survives is the promise, said once under the remedy.
	 */
	it("offers nowhere to paste a key", async () => {
		const canvas = mount();
		await canvas.render();
		await send(canvas.host, "shoot home");
		canvas.turn.push(refused);
		canvas.turn.close();
		await settle();

		// the one input the rail has is the picture picker behind Attach, and it takes images
		const inputs = [...(rail(canvas.host)?.querySelectorAll("input") ?? [])];
		expect(inputs.map((input) => input.type)).toEqual(["file"]);
		expect(inputs[0]?.accept).toMatch(/^image\//);
		expect(rail(canvas.host)?.textContent).not.toContain("API key");
		expect(rail(canvas.host)?.textContent).not.toContain("ANTHROPIC");
	});
});
