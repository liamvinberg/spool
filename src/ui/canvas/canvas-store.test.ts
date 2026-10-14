// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { type CanvasStore, createCanvasStore, setterOf, useCanvasField, useCanvasState } from "./canvas-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(element: ReturnType<typeof createElement>): void {
	const host = document.createElement("div");
	const root = createRoot(host);
	act(() => root.render(element));
	onTestFinished(() => act(() => root.unmount()));
}

describe("the canvas store", () => {
	it("holds what the last set wrote, at once", () => {
		const store = createCanvasStore();
		store.set({ selected: ["a"] });
		expect(store.get().selected).toEqual(["a"]);
		store.set((state) => ({ selected: [...state.selected, "b"] }));
		expect(store.get().selected).toEqual(["a", "b"]);
	});

	it("tells nobody about a set that changes nothing", () => {
		const store = createCanvasStore();
		const heard = vi.fn();
		store.subscribe(heard);
		const selected = store.get().selected;
		store.set({ selected });
		expect(heard).not.toHaveBeenCalled();
		store.set({ selectedPage: "p" });
		expect(heard).toHaveBeenCalledTimes(1);
	});

	it("gives each field a setter shaped like useState's", () => {
		const store = createCanvasStore();
		const setSelected = setterOf(store, "selected");
		setSelected(["a"]);
		setSelected((current) => [...current, "b"]);
		expect(store.get().selected).toEqual(["a", "b"]);
	});

	it("renders a reader only when what it reads changes", () => {
		const store = createCanvasStore();
		const renders = { page: 0, selected: 0 };
		function Page({ of }: { of: CanvasStore }) {
			renders.page += 1;
			return useCanvasState(of, (state) => state.selectedPage);
		}
		function Selected({ of }: { of: CanvasStore }) {
			renders.selected += 1;
			const [selected] = useCanvasField(of, "selected");
			return selected.join(",");
		}
		mount(createElement("div", null, createElement(Page, { of: store }), createElement(Selected, { of: store })));
		expect(renders).toEqual({ page: 1, selected: 1 });
		act(() => store.set({ selected: ["a"] }));
		expect(renders).toEqual({ page: 1, selected: 2 });
		act(() => {
			store.set({ selectedPage: "p" });
			store.set({ selected: ["b"] });
		});
		expect(renders).toEqual({ page: 2, selected: 3 });
	});
});
