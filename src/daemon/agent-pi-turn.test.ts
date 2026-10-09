import { describe, expect, it } from "vitest";
import { fixtureAgentExecutor } from "../test-helpers";
import type { AgentEvent } from "./agent-events";
import { startPiTurn } from "./agent-pi-turn";

describe("a pi turn", () => {
	it("bounces off a provider that refuses the login with spool's own sentence, and declines an extension's dialog", async () => {
		const pi = fixtureAgentExecutor((proc, line) => {
			const command = JSON.parse(line) as { id?: string; type: string };
			if (command.type === "get_state")
				proc.emit(
					JSON.stringify({ id: command.id, type: "response", command: "get_state", success: true, data: {} }),
				);
			if (command.type !== "prompt") return;
			proc.emit(JSON.stringify({ id: command.id, type: "response", command: "prompt", success: true }));
			proc.emit(JSON.stringify({ type: "extension_ui_request", id: "ui-1", method: "confirm", title: "Allow?" }));
			proc.emit(
				JSON.stringify({
					type: "message_end",
					message: {
						role: "assistant",
						content: [],
						stopReason: "error",
						errorMessage: "401 Unauthorized: token expired",
					},
				}),
			);
			proc.emit(JSON.stringify({ type: "agent_settled" }));
		});
		const turn = startPiTurn({
			executor: pi.executor,
			spawn: { command: "pi", args: [], cwd: "/work", env: {} },
			prompt: { message: "go" },
			model: "openai-codex/gpt-5.5",
		});
		const events: AgentEvent[] = [];
		for await (const event of turn.events) {
			events.push(event);
			if (event.kind === "ended") break;
		}
		turn.abandon();
		expect(events.at(-1)).toMatchObject({
			kind: "ended",
			ending: "failed",
			reason: "Sign in to pi to continue.",
			recovery: { kind: "login", account: "pi", offer: "openai-codex/gpt-5.5" },
		});
		expect(JSON.stringify(events)).not.toContain("token expired");
		expect(pi.spawned[0]?.inputs.map((line) => JSON.parse(line))).toContainEqual({
			type: "extension_ui_response",
			id: "ui-1",
			cancelled: true,
		});
		expect(pi.spawned[0]?.ended).toBe(true);
	});
});
