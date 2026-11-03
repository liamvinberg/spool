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
	await act(async () => root.render(createElement(Harness, { engine: "pi" })));
	expect(host.textContent).not.toContain("Fable");
	expect(host.querySelector("button")?.getAttribute("aria-busy")).toBe("true");
	await act(async () => nextOffer.resolve(offer("pi")));
	expect(host.textContent).toContain("Astra");
	expect(host.querySelector("button")?.getAttribute("aria-busy")).toBe("false");
	await act(async () => pending.resolve(offer("claude")));
	expect(host.textContent).toContain("Astra");
	expect(host.textContent).not.toContain("Fable");
});

it("gives up the ask for a thread the rail moved on from", async () => {
	vi.mocked(agentModelOffer).mockReturnValue(new Promise(() => {}));
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.resetAllMocks();
	});
	function Harness({ thread, engine }: { thread: string; engine?: AgentEngineId }) {
		useAgentModel("project", thread, engine);
		return null;
	}
	await act(async () => root.render(createElement(Harness, { thread: "first" })));
	await act(async () => root.render(createElement(Harness, { thread: "first", engine: "claude" })));
	await act(async () => root.render(createElement(Harness, { thread: "second", engine: "claude" })));
	const signals = vi.mocked(agentModelOffer).mock.calls.map((call) => call[3]?.aborted);
	expect(signals).toEqual([true, true, false]);
});

it("opens a new chat on the engine's last report and joins its ask when the menu opens", async () => {
	vi.mocked(agentModelOffer).mockResolvedValue(offer("codex"));
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.resetAllMocks();
	});
	let deck: ReturnType<typeof useAgentModel> | undefined;
	function Harness({ thread }: { thread: string }) {
		deck = useAgentModel("project", thread, "codex");
		return null;
	}
	await act(async () => root.render(createElement(Harness, { thread: "heard" })));
	expect(deck?.readout).toBe("Astra");
	vi.mocked(agentModelOffer).mockReturnValue(new Promise(() => {}));
	await act(async () => root.render(createElement(Harness, { thread: "fresh" })));
	expect(deck?.loading).toBe(true);
	expect(deck?.readout).toBe("Astra");
	await act(async () => deck?.refresh());
	const calls = vi.mocked(agentModelOffer).mock.calls;
	expect(calls).toHaveLength(2);
	expect(calls[1]?.[3]?.aborted).toBe(false);
});

function deferred() {
	let resolve = (_value: unknown) => {};
	const promise = new Promise<unknown>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
