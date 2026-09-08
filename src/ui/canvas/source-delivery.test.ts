// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished, vi } from "vitest";
import { describeSource } from "../api";
import { useSourceDelivery } from "./source-delivery";

vi.mock("../api", () => ({
	describeSource: vi.fn(),
	respondSourceObservation: vi.fn(),
	sourceIsCurrent: vi.fn(),
	sourceReach: vi.fn(),
	subscribeSse: () => () => {},
}));

it.each(["live", "aborted", "replaced", "unmounted"])(
	"treats a late inspection only as readiness for its %s disclosure",
	async (state) => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		vi.clearAllMocks();
		const host = document.createElement("div");
		const iframe = document.createElement("iframe");
		document.body.append(host, iframe);
		const originalWindow = iframe.contentWindow;
		if (!originalWindow) throw new Error("missing frame window");
		const posted = vi.spyOn(originalWindow, "postMessage").mockImplementation(() => {});
		const frames = { current: new Map([["home", iframe]]) };
		let delivery: ReturnType<typeof useSourceDelivery> | undefined;
		function Subject() {
			delivery = useSourceDelivery("project", frames);
			return null;
		}
		const root = createRoot(host);
		let mounted = true;
		let replacement: HTMLIFrameElement | undefined;
		onTestFinished(async () => {
			if (mounted) await act(async () => root.unmount());
			host.remove();
			iframe.remove();
			replacement?.remove();
			vi.restoreAllMocks();
			vi.useRealTimers();
		});
		await act(async () => root.render(createElement(Subject)));
		if (!delivery) throw new Error("missing source delivery");
		const controller = new AbortController();
		const onLateReply = vi.fn();
		let description: ReturnType<typeof delivery.describe> | undefined;
		await act(async () => {
			description = delivery?.describe(
				"home",
				"#label",
				undefined,
				{ kind: "literal" },
				{ signal: controller.signal, onLateReply },
			);
		});
		const request = posted.mock.calls.find(([message]) => message.action === "inspect")?.[0];
		if (!request) throw new Error("missing actual inspection request");
		await act(async () => {
			await vi.advanceTimersByTimeAsync(4000);
		});
		expect(await description).toBeUndefined();
		expect(onLateReply).not.toHaveBeenCalled();
		if (state === "aborted") controller.abort();
		if (state === "replaced") {
			replacement = document.createElement("iframe");
			document.body.append(replacement);
			frames.current.set("home", replacement);
		}
		if (state === "unmounted") {
			await act(async () => root.unmount());
			mounted = false;
		}
		await act(async () => {
			window.dispatchEvent(
				new MessageEvent("message", {
					source: originalWindow,
					data: { spool: "source-reply", id: request.id, result: { value: "expired payload" } },
				}),
			);
		});
		expect(onLateReply).toHaveBeenCalledTimes(state === "live" ? 1 : 0);
		expect(describeSource).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	},
);
