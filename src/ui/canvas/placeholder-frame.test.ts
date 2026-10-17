// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished } from "vitest";
import type { ProjectedPlaceholder } from "../../daemon/projection";
import { createCameraStore } from "./camera-store";
import type { FrameAgent } from "./frame-agents";
import { PlaceholderFrame } from "./placeholder-frame";

/**
 * A designer's placeholder frame on the canvas (#369): dashed where its frame will land, its
 * name row saying an agent is at work there, and nothing inside it (task 164).
 */

describe("a placeholder frame on the canvas", () => {
	const placeholder: ProjectedPlaceholder = {
		name: "ideas/home--split",
		page: "ideas",
		x: 100,
		y: 50,
		w: 390,
		h: 844,
		title: "Split home",
		brief: "Two panes, one for the list and one for the detail.",
	};

	function draw(agents: readonly FrameAgent[] | undefined, k = 1): HTMLElement {
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		onTestFinished(() => {
			act(() => root.unmount());
			host.remove();
		});
		const camera = createCameraStore();
		camera.set({ x: 0, y: 0, k });
		act(() => root.render(createElement(PlaceholderFrame, { placeholder, camera, agents, pointed: false })));
		return host;
	}

	it("stands where its frame will, with its own name and nothing inside", () => {
		const host = draw(undefined);
		const frame = host.querySelector<HTMLElement>('[data-placeholder-frame="ideas/home--split"]');
		expect(frame?.style.transform).toBe("translate(100px, 50px)");
		expect(frame?.textContent).toBe("home--split");
		expect(host.querySelector("[data-frame-agents]")).toBeNull();
	});

	it("says on its name row that its designer is working, its row one size on screen at any zoom", () => {
		const host = draw([{ color: null, own: true, waiting: false, says: "Split home" }], 0.5);
		const mark = host.querySelector<HTMLElement>('[data-frame-agents="ideas/home--split"]');
		expect(mark?.getAttribute("data-frame-agents-state")).toBe("working");
		expect(mark?.textContent).toBe("working");
		const row = host.querySelector<HTMLElement>(".origin-top-left");
		expect(row?.style.width).toBe("195px");
		expect(row?.style.transform).toBe("scale(2)");
	});
});
