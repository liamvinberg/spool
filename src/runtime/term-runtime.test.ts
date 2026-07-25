// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

class FakeTerminal {
	static instance: FakeTerminal | undefined;
	cols = 80;
	rows = 24;
	readonly options: unknown;
	loaded: unknown[] = [];

	constructor(options: unknown) {
		this.options = options;
		FakeTerminal.instance = this;
	}

	open(): void {}
	focus(): void {}
	resize(cols: number, rows: number): void {
		this.cols = cols;
		this.rows = rows;
	}
	reset(): void {}
	write(): void {}
	loadAddon(addon: unknown): void {
		this.loaded.push(addon);
	}
	onData(): void {}
	onBinary(): void {}
	attachCustomKeyEventHandler(): void {}
}

vi.mock("@xterm/xterm", () => ({ Terminal: FakeTerminal }));

class FakeWebglAddon {
	static instance: FakeWebglAddon | undefined;
	static throws = false;
	disposed = false;
	private contextLoss: (() => void) | undefined;

	constructor() {
		if (FakeWebglAddon.throws) throw new Error("WebGL unavailable");
		FakeWebglAddon.instance = this;
	}

	onContextLoss(listener: () => void): { dispose(): void } {
		this.contextLoss = listener;
		return { dispose() {} };
	}

	dispose(): void {
		this.disposed = true;
	}

	loseContext(): void {
		this.contextLoss?.();
	}
}

vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: FakeWebglAddon }));

class FakeWebSocket extends EventTarget {
	static readonly OPEN = 1;
	readyState = FakeWebSocket.OPEN;
	binaryType = "blob";

	send(): void {}
}

describe("the terminal runtime", () => {
	it("relays Meta hold changes while preserving terminal exit and zoom behavior", async () => {
		document.body.innerHTML = '<div id="term"></div>';
		Object.defineProperty(document, "fonts", {
			configurable: true,
			value: { load: () => Promise.resolve([]) },
		});
		Object.defineProperty(window, "__SPOOL__", {
			configurable: true,
			value: { project: "project", frame: "term" },
		});
		const posted: unknown[] = [];
		const parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent");
		const webSocket = window.WebSocket;
		Object.defineProperty(window, "parent", {
			configurable: true,
			value: { postMessage: (message: unknown) => posted.push(message) },
		});
		vi.stubGlobal("WebSocket", FakeWebSocket);

		try {
			const { activateWebgl } = await import("./term-webgl");
			await import("./term-runtime");
			expect(FakeTerminal.instance?.options).toMatchObject({ customGlyphs: true });
			expect(FakeTerminal.instance?.loaded).toEqual([FakeWebglAddon.instance]);
			const terminal = FakeTerminal.instance;
			FakeWebglAddon.instance?.loseContext();
			expect(FakeWebglAddon.instance?.disposed).toBe(true);
			expect(FakeTerminal.instance).toBe(terminal);
			FakeWebglAddon.throws = true;
			await expect(activateWebgl(terminal as FakeTerminal)).resolves.toBeUndefined();
			FakeWebglAddon.throws = false;
			window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Meta" }));
			const select = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, metaKey: true, key: "v" });
			const hand = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, metaKey: true, key: "h" });
			const exit = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, metaKey: true, key: "Escape" });
			const zoom = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, metaKey: true, key: "+" });
			window.dispatchEvent(select);
			window.dispatchEvent(hand);
			window.dispatchEvent(exit);
			window.dispatchEvent(zoom);
			window.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Meta" }));
			window.dispatchEvent(new Event("blur"));

			expect(select.defaultPrevented).toBe(false);
			expect(hand.defaultPrevented).toBe(false);
			expect(exit.defaultPrevented).toBe(true);
			expect(zoom.defaultPrevented).toBe(false);
			expect(posted).toEqual([
				{ spool: "modifier", frame: "term", modifier: "Meta", held: true },
				{ spool: "key", frame: "term", key: "Escape" },
				{ spool: "modifier", frame: "term", modifier: "Meta", held: false },
				{ spool: "modifier", frame: "term", modifier: "Meta", held: false },
			]);
		} finally {
			vi.unstubAllGlobals();
			Object.defineProperty(window, "WebSocket", { configurable: true, value: webSocket });
			delete window.__SPOOL__;
			if (parentDescriptor !== undefined) Object.defineProperty(window, "parent", parentDescriptor);
		}
	});
});
