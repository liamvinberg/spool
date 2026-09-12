import { expect, it } from "vitest";
import { handCanvas } from "./hand-browser-helpers";

/**
 * Opening the words of the rung held (#323).
 *
 * The fixture is the veil page's intro: a flex row with a very large heading
 * on the left and a narrow paragraph of three `<br/>`-separated lines on the
 * right, in a frame shorter than the page, so the root element is a wrapper
 * the ladder has to go past. That paragraph is the one the third hand test
 * could not open by clicking.
 *
 * Two paths, and the keyboard one hit-tests nothing: a person holding an
 * element and pressing ⏎ gets its words whatever the pointer would have found.
 */

const CSS = `.landing { font-family: system-ui, sans-serif; color: #efede7; background: #171719; }
.nav { display: flex; gap: 16px; align-items: center; font-size: 14px; padding: 22px 56px; }
.veil-intro { padding: 30px 56px 40px; display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; }
.veil-intro h1 { font-size: 112px; max-width: 920px; line-height: 1.05; margin: 0; font-weight: 500; }
.veil-intro p { max-width: 220px; font-size: 14px; padding-bottom: 10px; color: #aaa6a1; margin: 0; line-height: 1.4; }
.veil-art { margin: 0 24px; height: 500px; background: #c96a3c; }
.serif { font-family: Georgia, serif; }
`;

const PAGE = `import '../../shared/ui/veil.css';

export default function Veil() {
  return <main className="landing veil" id="top">
    <header className="nav"><a className="brand" href="#top">veil®</a></header>
    <section className="veil-intro"><h1>do something<br/><span className="serif"><i>worth feeling.</i></span></h1><p>Independent design and digital experiences.<br/>Made with instinct.<br/>Built with intention.</p></section>
    <div className="veil-art"></div>
  </main>;
}
`;

const FILES = { "shared/ui/veil.css": CSS };

/** The rung the canvas last told the daemon it is pointing at: its tag, or the frame. */
async function heldTag(project: { url: string; name: string; controlToken: string }): Promise<string> {
	const response = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/selection`, {
		headers: { "X-Spool-Control": project.controlToken },
	});
	const body = (await response.json()) as { selection?: { kind: string; name?: string }[] };
	const [only] = body.selection ?? [];
	return only === undefined ? "nothing" : (only.name ?? only.kind);
}

it("opens the intro paragraph's words from the keyboard and from the pointer", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, PAGE, { w: 1200, h: 400 }, { x: 40, y: 40, k: 0.6 });
	const { page, frame } = f;
	const held = () => heldTag(f.project);
	const editable = () => frame.locator("section.veil-intro p").first().getAttribute("contenteditable");

	const box = await frame.locator("section.veil-intro p").boundingBox();
	if (box === null) throw new Error("the veil intro drew no paragraph");
	const at = { x: box.x + 20, y: box.y + 8 };

	await page.getByRole("button", { name: "edit", exact: true }).click();

	// down the ladder to the paragraph: past the wrapper onto the section, then
	// one rung in
	await page.mouse.click(at.x, at.y);
	await expect.poll(held, { timeout: 15_000 }).toBe("section");
	await page.mouse.dblclick(at.x, at.y);
	await expect.poll(held, { timeout: 15_000 }).toBe("p");
	expect(await editable()).toBe(null);

	// ⏎ opens its words with no pointer in it at all
	await page.keyboard.press("Enter");
	await expect.poll(editable, { timeout: 15_000 }).toBe("plaintext-only");
	expect(
		await frame
			.locator("section.veil-intro p")
			.first()
			.evaluate((el) => el.ownerDocument.activeElement === el),
	).toBe(true);
	await page.keyboard.press("Escape");
	await expect.poll(editable, { timeout: 15_000 }).toBe(null);

	// F2 is the same door, and the words survive it: typing lands in the file.
	// The canvas holds a closed edit for one reply window while the frame
	// answers for it, and that window is not a door.
	await expect.poll(held, { timeout: 15_000 }).toBe("p");
	await new Promise((settle) => setTimeout(settle, 600));
	await page.keyboard.press("F2");
	await expect.poll(editable, { timeout: 15_000 }).toBe("plaintext-only");
	await page.keyboard.press("End");
	await page.keyboard.type(" Now.");
	const answered = page.waitForResponse((response) => response.url().endsWith("/text"));
	await page.keyboard.press("Enter");
	await answered;
	await expect.poll(() => f.bytes().includes(" Now."), { timeout: 15_000 }).toBe(true);
	await expect.poll(held, { timeout: 15_000 }).toBe("p");
});

it("opens them from the pointer too, one rung per double-click", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, PAGE, { w: 1200, h: 400 }, { x: 40, y: 40, k: 0.6 });
	const { page, frame } = f;
	const held = () => heldTag(f.project);
	const editable = () => frame.locator("section.veil-intro p").first().getAttribute("contenteditable");

	const box = await frame.locator("section.veil-intro p").boundingBox();
	if (box === null) throw new Error("the veil intro drew no paragraph");
	const at = { x: box.x + 20, y: box.y + 8 };

	await page.getByRole("button", { name: "edit", exact: true }).click();
	// every double-click spends its own descent: the presses behind one used to
	// void the ask it had in flight, which on a frame slow to answer left the
	// ladder where it was however many times the paragraph was clicked
	await page.mouse.click(at.x, at.y);
	await expect.poll(held, { timeout: 15_000 }).toBe("section");
	await page.mouse.dblclick(at.x, at.y);
	await expect.poll(held, { timeout: 15_000 }).toBe("p");
	await page.mouse.dblclick(at.x, at.y);
	await expect.poll(editable, { timeout: 15_000 }).toBe("plaintext-only");
});
