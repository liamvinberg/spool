// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import type { PiKeyResult } from "../../daemon/agent-setup";
import { postPiKey } from "../api";
import { usePiKey } from "./pi-key";

vi.mock("../api", () => ({ postPiKey: vi.fn() }));

it("lets a check go when the key changes under it, and checks the new key", async () => {
	const answers: ((result: PiKeyResult) => void)[] = [];
	vi.mocked(postPiKey).mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.resetAllMocks();
	});
	let field: ReturnType<typeof usePiKey> | undefined;
	function Harness() {
		field = usePiKey();
		return null;
	}
	act(() => root.render(createElement(Harness)));

	act(() => field?.setKey("sk-old"));
	act(() => field?.check());
	expect(field?.state.check).toBe("checking");
	// the person goes on typing while the old key is asked about
	act(() => field?.setKey("sk-new"));
	expect(field?.state).toMatchObject({ key: "sk-new", check: "idle" });
	await act(async () => answers[0]?.({ ok: false, reason: "Anthropic didn’t take that key." }));
	expect(field?.state).toMatchObject({ key: "sk-new", check: "idle", said: "" });

	act(() => field?.check());
	expect(vi.mocked(postPiKey).mock.calls.at(-1)?.slice(0, 2)).toEqual(["anthropic", "sk-new"]);
	await act(async () => answers[1]?.({ ok: true, models: 2, checked: true, replaced: false }));
	expect(field?.state).toMatchObject({ check: "ok", said: "Anthropic took it: 2 models in pi." });
});
