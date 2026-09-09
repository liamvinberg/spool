import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

const plain = (color: string) => `export default function Frame() {
	return <div style={{ width: "100%", height: "100%", background: "${color}" }} />;
}
`;

it("paints a frame label above a neighboring frame", { timeout: 180_000 }, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });

	writeFrame(project.root, "upper", plain("#ff0000"));
	writeDesignFile(project.root, "frames/upper/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 300 }\n');
	writeFrame(project.root, "lower", plain("#0000ff"));
	writeDesignFile(project.root, "frames/lower/frame.json", '{ "x": 0, "y": 310, "w": 800, "h": 300 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

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
