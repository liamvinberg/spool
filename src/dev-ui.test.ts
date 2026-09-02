import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { watchesCheckoutUi, watchUiBuild } from "./dev-ui";
import type { UiBuildWatcher } from "./dev-ui-hook";
import { makeTempDir } from "./test-helpers";

describe("checkout UI watch", () => {
	const watchers: UiBuildWatcher[] = [];

	afterEach(async () => {
		for (const watcher of watchers.splice(0)) await watcher.close();
	});

	it("waits for the first bundle and rebuilds when UI source changes", async () => {
		const root = realpathSync(makeTempDir());
		const outDir = join(root, "dist", "ui");
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "index.html"), '<script type="module" src="/src/main.ts"></script>');
		const source = join(root, "src", "main.ts");
		writeFileSync(source, 'document.body.textContent = "first bundle";');

		const watcher = await watchUiBuild({
			configFile: false,
			root,
			logLevel: "silent",
			build: { outDir: "dist/ui", emptyOutDir: true },
		});
		watchers.push(watcher);

		expect(bundleText(outDir)).toContain("first bundle");

		// the daemon comes up serving the first bundle, so it is nobody's news;
		// every one after it strands the pages already running the old hashes
		const rebuilt = vi.fn();
		watcher.onRebuild(rebuilt);
		expect(rebuilt).not.toHaveBeenCalled();

		writeFileSync(source, 'document.body.textContent = "second bundle";');
		await until(() => bundleText(outDir).includes("second bundle"));
		await until(() => rebuilt.mock.calls.length > 0);
	});

	it("starts only for the foreground serve child", () => {
		expect(watchesCheckoutUi(["serve", "--foreground"])).toBe(true);
		expect(watchesCheckoutUi(["serve"])).toBe(false);
		expect(watchesCheckoutUi(["stop"])).toBe(false);
	});

	it("wires pnpm dev through the checkout entry", () => {
		const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
			scripts: Record<string, string>;
		};
		expect(pkg.scripts.dev).toContain("tsx src/dev.ts");
	});
});

function bundleText(outDir: string): string {
	const assets = join(outDir, "assets");
	try {
		return readdirSync(assets)
			.filter((file) => file.endsWith(".js"))
			.map((file) => readFileSync(join(assets, file), "utf8"))
			.join("\n");
	} catch {
		return "";
	}
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (done()) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error("UI watcher did not rebuild");
}
