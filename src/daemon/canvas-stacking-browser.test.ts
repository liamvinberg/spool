import { join } from "node:path";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

const plain = (color: string) => `export default function Frame() {
	return <div style={{ width: "100%", height: "100%", background: "${color}" }} />;
}
`;

it("paints a frame label above a neighboring frame", { timeout: 180_000 }, async () => {
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });

	writeFrame(project.root, "upper", plain("#ff0000"));
	writeDesignFile(project.root, "frames/upper/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 300 }\n');
	writeFrame(project.root, "lower", plain("#0000ff"));
	writeDesignFile(project.root, "frames/lower/frame.json", '{ "x": 0, "y": 310, "w": 800, "h": 300 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const label = page.locator('[data-frame-label="lower"]');
	await label.waitFor();

	const topmost = await label.evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		const hit = document.elementFromPoint(bounds.left + 4, bounds.top + bounds.height / 2);
		return hit?.closest("[data-frame-label]")?.getAttribute("data-frame-label") ?? null;
	});

	expect(topmost).toBe("lower");
});
