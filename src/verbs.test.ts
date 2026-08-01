import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readDaemonState } from "./daemon/lifecycle";
import { SpoolError } from "./errors";
import { skillText } from "./skill";
import { makeProject, makeTempDir, serveProject, writeDesignFile, writeFrame } from "./test-helpers";
import { mintPlayerUrl, mintRawUrl, readFlows, readSelection, resolveRegisteredProject } from "./verbs";

function controlToken(spoolDir: string): string {
	const token = readDaemonState(spoolDir)?.controlToken;
	if (token === undefined) throw new Error("test daemon has no control token");
	return token;
}

/**
 * The thin verbs (#25) as direct function calls — cwd resolution against temp
 * dirs, reads against a really-served daemon on an ephemeral port.
 */

const plainTsx = `export default function Frame() {
	return <main>hi</main>;
}
`;

describe("resolveRegisteredProject", () => {
	it("resolves by walk-up from any nested cwd", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		const nested = join(root, "src", "deep");
		mkdirSync(nested, { recursive: true });

		expect(resolveRegisteredProject(spoolDir, nested)).toEqual({ root, name });
	});

	it("refuses a cwd outside any project, pointing at init", () => {
		const spoolDir = join(makeTempDir(), ".spool");
		expect(() => resolveRegisteredProject(spoolDir, makeTempDir())).toThrowError(/spool init/);
	});

	it("refuses an unregistered project, pointing at open — registration stays explicit", () => {
		// a project inited against one machine's registry, resolved against another's
		const { root } = makeProject(join(makeTempDir(), ".spool"));
		const otherSpoolDir = join(makeTempDir(), ".spool");

		expect(() => resolveRegisteredProject(otherSpoolDir, root)).toThrowError(/spool open/);
	});
});

describe("selection and flows over the daemon", () => {
	it("prints the live selection as the block a prompt carries", async () => {
		const { spoolDir, root, name, url } = await serveProject();
		writeFrame(root, "cart", plainTsx);
		const token = controlToken(spoolDir);
		const point = (body: unknown) =>
			fetch(`${url}/api/p/${name}/selection`, {
				method: "PUT",
				headers: { "content-type": "application/json", "X-Spool-Control": token },
				body: JSON.stringify(body),
			});

		// nothing pointed at prints nothing, which is the emptiness a prompt carries
		expect(await readSelection(url, name, token)).toBe("");

		await point({ frames: ["cart"] });
		expect(await readSelection(url, name, token)).toBe(
			["<selection>", "cart — design/frames/cart/frame.tsx — 390×844", "</selection>"].join("\n"),
		);

		// an element prints its noun, its lines and its excerpt under it
		await point({
			elements: [
				{
					frame: "cart",
					selector: "main",
					outerHtml: "<main>hi</main>",
					source: "frames/cart/frame.tsx:2:9",
					generated: false,
				},
			],
		});
		const element = [
			"<selection>",
			"cart · main — design/frames/cart/frame.tsx:2-2",
			"  <main>hi</main>",
			"</selection>",
		];
		expect(await readSelection(url, name, token)).toBe(element.join("\n"));
	});

	it("prints the link graph", async () => {
		const { spoolDir, root, name, url } = await serveProject();
		writeFrame(root, "cart", `export default function Frame() {\n\treturn <a data-go="pay">pay</a>;\n}\n`);
		writeFrame(root, "pay", plainTsx);

		const printed = await readFlows(url, name, controlToken(spoolDir));

		expect(JSON.parse(printed)).toEqual({
			frames: ["cart", "pay"],
			edges: [
				{
					from: "cart",
					to: "pay",
					certainty: "will",
					sites: [{ via: "data-go", path: "frames/cart/frame.tsx", line: 2, anchor: { line: 2, col: 9 } }],
				},
			],
			unreadable: [],
		});
	});
});

describe("url", () => {
	it("mints a player-session URL for a frame that exists", async () => {
		const { spoolDir, root, name, url } = await serveProject();
		writeFrame(root, "cart", plainTsx);

		await expect(mintPlayerUrl(url, name, "cart", controlToken(spoolDir))).resolves.toBe(
			`${url}/play/${name}?frame=cart`,
		);
	});

	it("refuses a frame that does not exist, teaching how one is born without inventing a path", async () => {
		const { spoolDir, root, name, url } = await serveProject();
		// a paged project: `frames/site-local--thread/frame.tsx` is a location this
		// canvas never reads, so the hint must not name it (#156)
		writeDesignFile(root, "frames/site/site-local--plate/frame.tsx", plainTsx);
		const born =
			'no frame "site-local--thread" on the canvas — a frame is born by writing frame.tsx in its own folder under design/frames/, flat or inside a page folder';

		const player = await mintPlayerUrl(url, name, "site-local--thread", controlToken(spoolDir)).catch(
			(error: Error) => error.message,
		);
		const raw = await mintRawUrl(url, name, "site-local--thread", root).catch((error: Error) => error.message);

		expect(player).toBe(born);
		expect(raw).toBe(born);
		expect(player).not.toContain("frames/site-local--thread");
	});

	it("mints direct render URLs for flat and paged frames without using the control origin", async () => {
		const { spoolDir, root, name, url, renderUrl } = await serveProject();
		writeFrame(root, "flat", plainTsx);
		writeDesignFile(root, "frames/journey/paged/frame.tsx", plainTsx);

		const token = controlToken(spoolDir);
		for (const frame of ["flat", "paged"]) {
			const player = await mintPlayerUrl(url, name, frame, token);
			const raw = await mintRawUrl(url, name, frame, root);
			expect(player).toBe(`${url}/play/${name}?frame=${frame}`);
			expect(raw).toBe(`${renderUrl}/p/${name}/frames/${frame}`);
			expect((await fetch(player)).status).toBe(200);
			expect((await fetch(raw)).status).toBe(200);
		}
	});

	it("mints a raw URL without materializing missing geometry", async () => {
		const { root, name, url } = await serveProject();
		writeFrame(root, "unplaced", plainTsx);
		const sidecar = join(root, "design", "frames", "unplaced", "frame.json");

		await expect(mintRawUrl(url, name, "unplaced", root)).resolves.toContain("/frames/unplaced");

		expect(existsSync(sidecar)).toBe(false);
	});
});

describe("skill", () => {
	it("prints the overview with every verb and the topic index", () => {
		const text = skillText();
		for (const verb of ["init", "open", "remove", "selection", "flows", "shot", "logs", "url", "skill"]) {
			expect(text).toContain(`spool ${verb}`);
		}
	});

	it("prints every listed topic", () => {
		for (const topic of ["frames", "terminals", "flows", "scenarios", "mock", "styling", "verbs"]) {
			expect(skillText(topic).length).toBeGreaterThan(100);
		}
	});

	it("refuses an unknown topic, listing the real ones", () => {
		expect(() => skillText("vibes")).toThrowError(SpoolError);
		expect(() => skillText("vibes")).toThrowError(/frames, terminals, flows, scenarios, mock, styling, verbs/);
	});

	it("opens with the completeness contract and carries the fixed laws verbatim", () => {
		expect(skillText()).toContain("if it isn't here, spool doesn't do it");
		expect(skillText()).toContain("never write app-owned files");
		expect(skillText("styling")).toContain("cn() only, never template-literal class strings");
	});

	it("scopes lock-free guidance to authored frame code", () => {
		const text = skillText();
		expect(text).toContain("Frame authoring needs no locks or shared registries");
		expect(text).toContain("Lifecycle commands coordinate machine-global state inside spool");
		expect(text).not.toContain("No locks:");
	});

	it("teaches the confirmed frame-authoring traps", () => {
		const styling = skillText("styling");
		expect(styling).toContain("mt-3.5!");
		expect(styling).toContain("not !mt-3.5");

		const frames = skillText("frames");
		expect(frames).toContain("Nested flex-fill chains need a definite h-full");
		expect(frames).toContain("min-h-full does not give flex-1 a definite height");

		const flows = skillText("flows");
		expect(flows).toContain('literal ui.go("target")');
		expect(flows).toContain("data-go navigation");
		expect(flows).toContain("frame-owned file");
		expect(flows).toContain("pass a callback");
	});

	it("names the selector that actually discriminates a swap's direction and type", () => {
		const flows = skillText("flows");
		expect(flows).toContain("View Transitions types, not root attributes");
		expect(flows).toContain(
			"html:active-view-transition-type(forward)::view-transition-old(root) { animation: 0.2s slide-out; }",
		);
	});

	it("keeps ui.state writes out of a render, one-shot flags included", () => {
		const flows = skillText("flows");
		expect(flows).toContain("Writes belong in handlers and effects, never in a render");
		expect(flows).toContain("the value that render read is dropped");
		expect(flows).toContain("warns once per site");
		expect(flows).toContain("read in render and cleared in an effect");
	});

	it("teaches clipboard writes as awaited user interactions", () => {
		const flows = skillText("flows");
		expect(flows).toContain("await ui.copy(text)");
		expect(flows).toContain("click or non-reserved key handler");
		expect(flows).toContain("Show copied state only after");
		expect(flows).toContain("Clipboard reads and paste are not available");
	});

	it("distinguishes html browser boots from inert terminal persisted-grid shots in the overview", () => {
		expect(skillText()).toContain(
			"The CLI boots HTML frames in spool's own headless Chrome; it never reads the human's canvas. A terminal shot executes nothing and rasterizes only a persisted source-current grid to SVG.",
		);
	});

	it("keeps the detailed verify loop kind-specific", () => {
		const verbs = skillText("verbs");
		expect(verbs).toContain("For HTML frames, shot and logs are two outputs of one boot");
		expect(verbs).toContain(
			"A terminal shot does not boot or execute source; it only rasterizes a persisted source-current grid to SVG.",
		);
	});

	it("teaches disposable lanes to register their own source for verification", () => {
		const text = skillText();
		expect(text).toContain("spool open <lane>");
		expect(text).toContain("before verification");
		expect(text).toContain("spool remove <lane>");
		expect(text).toContain("before erasing the worktree");
		expect(text).toContain("Never alias");
		expect(text).toContain("main checkout");
	});

	it("teaches that terminal source stays inert until it has an OS sandbox", () => {
		expect(skillText()).toContain("static disabled surface");
		const terminals = skillText("terminals");
		expect(terminals).toContain("does not compile, evaluate, or execute term.tsx");
		expect(terminals).toContain("inside an OS sandbox");
		expect(terminals).toContain("no terminal input, output, process lifecycle, restart, or shared live session");
		expect(terminals).toContain("Saving a never-run terminal does not create a screen.");
		expect(terminals).toContain('literal `term.go("target")` calls in term.tsx');
		expect(terminals).toContain('`{"\\u00a0"}`');
		expect(terminals).toContain(
			"any stale or never-run terminal rejects the whole player request, even when the selected starting frame is HTML",
		);
		expect(skillText()).toContain("terminal source-current persisted-grid SVG");
		expect(skillText("verbs")).toContain("A terminal never executes for a shot");
	});

	it("indexes every topic as its own overview row", () => {
		for (const topic of ["frames", "terminals", "flows", "scenarios", "mock", "styling", "verbs"]) {
			expect(skillText()).toMatch(new RegExp(`^  ${topic} {2,}\\S`, "m"));
		}
	});

	it("teaches deterministic raw browser driving through Spool's installed Playwright", () => {
		const verbs = skillText("verbs");
		expect(verbs).toContain("spool url --raw <frame>");
		expect(verbs).toContain('waitUntil: "domcontentloaded"');
		expect(verbs).toContain("a meaningful selector");
		expect(verbs).toContain("networkidle");
		expect(verbs).toContain("live reload connection stays open");
		expect(verbs).toMatch(/createRequire\(".*[/\\]package\.json"\)/);
	});

	it("scopes the session contract to the canvas and the player (#182)", () => {
		const flows = skillText("flows");
		expect(flows).not.toContain("A frame document keeps its session across walks and reloads");
		expect(flows).toContain("Two surfaces carry a session across a walk");
		expect(flows).toContain("sandboxed onto an opaque origin with no storage");
		expect(flows).toContain("a walk out of it starts the next frame from the scenario");
		expect(flows).toContain("stays put on the canvas and in the player");
		expect(flows).toContain("lands on the daemon's 404 instead");
	});

	it("says what the raw frame document is for and what it cannot do (#182)", () => {
		const verbs = skillText("verbs");
		expect(verbs).toContain("The raw document is one frame and nothing else");
		expect(verbs).toContain("no storage, so a reload starts over");
		expect(verbs).toContain("the next frame boots from the scenario with the state left behind");
		expect(verbs).toContain("every walk logs a CORS error");
		expect(verbs).toContain("lands on the daemon's 404 text instead of staying put");
		expect(verbs).toContain("Drive the player for anything that walks or carries state");
	});

	it("reaches player frames through the iframe and sizes the viewport to the frame (#178)", () => {
		const verbs = skillText("verbs");
		expect(verbs).toContain('page.frameLocator("#spool-player")');
		expect(verbs).not.toMatch(/^\s*await page\.locator\(/m);
		expect(verbs).toContain("a top-level locator never resolves there");
		expect(verbs).toContain("On a --raw URL the frame is the page");
		expect(verbs).toContain("viewport at least the frame's w×h");
		expect(verbs).toContain("min(1, vw/w, vh/h)");
	});
});
