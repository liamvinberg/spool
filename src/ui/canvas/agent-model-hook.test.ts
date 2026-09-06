// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { AgentEngineId } from "../../daemon/agent-engine";
import type { AgentOffer } from "../../daemon/agent-offer";
import { agentModelOffer, chooseAgentModel } from "../api";
import { useAgentModel } from "./agent-model";

vi.mock("../api", () => ({ agentModelOffer: vi.fn(), chooseAgentModel: vi.fn() }));
const offer = (engine: AgentEngineId): AgentOffer => ({
	models: [
		{
			value: engine,
			resolvedModel: engine,
			displayName: engine === "claude" ? "Fable" : "Astra",
			description: "",
			...(engine === "spool" ? { connection: "ChatGPT" } : {}),
		},
	],
	current: { value: engine, name: null, resolved: null, effort: null, pin: null },
});

it("clears another agent's offer immediately and ignores a late choice from that agent", async () => {
	vi.mocked(agentModelOffer).mockResolvedValue(offer("claude"));
	const pending = deferred();
	vi.mocked(chooseAgentModel).mockReturnValue(pending.promise);
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.resetAllMocks();
	});
	function Harness({ engine }: { engine: AgentEngineId }) {
		const model = useAgentModel("project", "same-new-thread", engine);
		return createElement(
			"button",
			{ type: "button", "aria-busy": model.loading, onClick: () => model.choose({ value: "claude" }) },
			JSON.stringify(model.offer),
		);
	}
	await act(async () => root.render(createElement(Harness, { engine: "claude" })));
	expect(host.textContent).toContain("Fable");
	await act(async () => host.querySelector("button")?.click());
	const nextOffer = deferred();
	vi.mocked(agentModelOffer).mockReturnValue(nextOffer.promise);
	await act(async () => root.render(createElement(Harness, { engine: "spool" })));
	expect(host.textContent).not.toContain("Fable");
	expect(host.querySelector("button")?.getAttribute("aria-busy")).toBe("true");
	await act(async () => nextOffer.resolve(offer("spool")));
	expect(host.textContent).toContain("ChatGPT");
	expect(host.querySelector("button")?.getAttribute("aria-busy")).toBe("false");
	await act(async () => pending.resolve(offer("claude")));
	expect(host.textContent).toContain("ChatGPT");
	expect(host.textContent).not.toContain("Fable");
});

function deferred() {
	let resolve = (_value: unknown) => {};
	const promise = new Promise<unknown>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
