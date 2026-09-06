// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, onTestFinished } from "vitest";
import { useModelFavorites } from "./model-favorites";

const OPENAI = "spool/openai/api_key/opus";
const GOOGLE = "spool/google/api_key/opus";

beforeEach(() => {
	const held = new Map<string, string>();
	const storage: Storage = {
		get length() {
			return held.size;
		},
		clear: () => held.clear(),
		getItem: (key) => held.get(key) ?? null,
		key: (index) => [...held.keys()][index] ?? null,
		removeItem: (key) => void held.delete(key),
		setItem: (key, value) => void held.set(key, value),
	};
	Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
});

function mount(project: string, engine = "spool") {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	function Picker({ engine }: { engine: string }) {
		const favorites = useModelFavorites(engine);
		return createElement(
			"section",
			{ "aria-label": project },
			createElement("output", null, JSON.stringify(favorites.values)),
			...[OPENAI, GOOGLE].map((value) =>
				createElement("button", { type: "button", key: value, onClick: () => favorites.toggle(value) }, value),
			),
		);
	}
	const render = (engine: string) => act(() => root.render(createElement(Picker, { engine })));
	render(engine);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	return {
		render,
		values: () => host.querySelector("output")?.textContent,
		toggle: (value: string) => {
			const button = [...host.querySelectorAll("button")].find((button) => button.textContent === value);
			if (!button) throw new Error(`Missing ${value}`);
			act(() => button.click());
		},
	};
}

it("shares favorites across open projects and newly mounted pickers, keeping connections distinct", () => {
	const first = mount("first");
	const second = mount("second");
	first.toggle(OPENAI);
	expect(second.values()).toBe(JSON.stringify([OPENAI]));
	second.toggle(GOOGLE);
	expect(first.values()).toBe(JSON.stringify([OPENAI, GOOGLE]));
	const reopened = mount("reopened");
	expect(reopened.values()).toBe(first.values());
	reopened.toggle(OPENAI);
	expect(first.values()).toBe(JSON.stringify([GOOGLE]));
	expect(second.values()).toBe(first.values());
});

it("keeps engines separate and reads changes made while another engine was selected", () => {
	const first = mount("first");
	const second = mount("second");
	first.toggle(OPENAI);
	first.render("claude");
	expect(first.values()).toBe("[]");
	second.toggle(GOOGLE);
	expect(first.values()).toBe("[]");
	first.render("spool");
	expect(first.values()).toBe(JSON.stringify([OPENAI, GOOGLE]));
});

it("updates an open picker when another tab saves favorites or clears storage", () => {
	const picker = mount("first");
	act(() => {
		window.localStorage.setItem("spool.models.favorites.spool", JSON.stringify([GOOGLE]));
		window.dispatchEvent(new StorageEvent("storage", { key: "spool.models.favorites.spool" }));
	});
	expect(picker.values()).toBe(JSON.stringify([GOOGLE]));
	picker.toggle(OPENAI);
	expect(picker.values()).toBe(JSON.stringify([GOOGLE, OPENAI]));
	act(() => {
		window.localStorage.clear();
		window.dispatchEvent(new StorageEvent("storage", { key: null }));
	});
	expect(picker.values()).toBe("[]");
});
