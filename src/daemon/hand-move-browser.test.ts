import { expect, it } from "vitest";
import { apiRequests, handCanvas } from "./hand-browser-helpers";

/**
 * Reorder by hand (#340).
 *
 * A person holds an element and presses an arrow key, or picks up the Edit
 * tool and drags it among its siblings. What they see is the frame and what
 * the file says is the file: one write per press or drop, one step of undo
 * each, and a refusal on the element where the file does not write the
 * siblings side by side.
 */

const CSS = `main { font-family: system-ui, sans-serif; padding: 24px; }
.links { display: flex; gap: 24px; font-size: 18px; }
.links a { padding: 6px 10px; }
.steps { display: flex; flex-direction: column; gap: 10px; }
.steps li { padding: 6px; font-size: 18px; }
.cards { display: flex; gap: 16px; }
.card { width: 120px; height: 60px; background: #e6ded4; padding: 8px; }
.gated h2 { font-size: 20px; margin: 8px 0; }
`;

const CARD = `export function Card({ title }: { title: string }) {
  return <div className="card">{title}</div>;
}
`;

const PAGE = `import { Card } from '../../shared/ui/card';
import '../../shared/ui/move.css';

const steps = ['Sketch', 'Build', 'Ship'];

export default function Page() {
  return <main id="top">
    <nav className="links">
      <a href="#docs">Docs</a>
      <a href="#code">GitHub</a>
      <a href="#get">Get</a>
    </nav>
    <ol className="steps">{steps.map((step) => <li key={step}><b>{step}</b></li>)}</ol>
    <section className="cards">
      <Card title="One" />
      <Card title="Two" />
    </section>
    <div className="gated">
      <h2>Kept</h2>
      {false && <p>hidden</p>}
      <p className="after">After</p>
    </div>
  </main>;
}
`;

const FILES = { "shared/ui/move.css": CSS, "shared/ui/card.tsx": CARD };

const NAV = (...hrefs: string[]) =>
	hrefs
		.map((href) => `      <a href="#${href}">${{ docs: "Docs", code: "GitHub", get: "Get" }[href] ?? ""}</a>\n`)
		.join("");

it("reorders by arrow and by drag, one write and one undo step each", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, PAGE, { w: 700, h: 560 });
	const { page, frame } = f;
	const requests = apiRequests(page, f.project.name);
	const file = () => f.bytes();
	const says = (text: string) => expect.poll(file, { timeout: 15_000 }).toBe(text);
	const order = (selector: string) =>
		frame.locator(selector).evaluateAll((all) => all.map((one) => (one.textContent ?? "").trim()));
	const shows = (selector: string, texts: string[]) =>
		expect.poll(() => order(selector), { timeout: 20_000 }).toEqual(texts);
	const hold = async (selector: string) => {
		await requests.quiet();
		const held = await f.select(selector);
		await requests.quiet();
		return held;
	};
	const moved = (from: string, to: string) => PAGE.replace(from, to);

	// ↓ on the first link: one step later, in the frame and in the file
	await hold('a[href="#docs"]');
	await page.keyboard.press("ArrowDown");
	const once = moved(NAV("docs", "code"), NAV("code", "docs"));
	await says(once);
	await shows(".links a", ["GitHub", "Docs", "Get"]);
	// the selection stayed on the link where it went, so the next press moves it on
	await requests.quiet();
	await page.keyboard.press("ArrowRight");
	await says(moved(NAV("docs", "code", "get"), NAV("code", "get", "docs")));
	await shows(".links a", ["GitHub", "Get", "Docs"]);
	// the end of the row is as far as a step goes
	await requests.quiet();
	await page.keyboard.press("ArrowDown");
	await requests.quiet();
	await shows(".links a", ["GitHub", "Get", "Docs"]);
	// two presses, two steps of undo
	await f.history();
	await says(once);
	await f.history();
	await says(PAGE);
	await shows(".links a", ["Docs", "GitHub", "Get"]);

	// presses made while a move is still settling wait their turn, and each
	// is still its own write and its own step
	await hold('a[href="#docs"]');
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowDown");
	await says(moved(NAV("docs", "code", "get"), NAV("code", "get", "docs")));
	await shows(".links a", ["GitHub", "Get", "Docs"]);
	await requests.quiet();
	await f.history();
	await says(once);
	await f.history();
	await says(PAGE);

	// a row of a list moves as its entry in the array
	await hold(".steps li:nth-child(1) b");
	await page.keyboard.press("Escape");
	await requests.quiet();
	await page.keyboard.press("ArrowDown");
	await says(moved("['Sketch', 'Build', 'Ship']", "['Build', 'Sketch', 'Ship']"));
	await shows(".steps li", ["Build", "Sketch", "Ship"]);
	await f.history();
	await says(PAGE);

	// a card is all of Card, so the call that renders it moves, and the file
	// Card is written in stays as it was
	await hold(".card:nth-child(2)");
	await page.keyboard.press("ArrowUp");
	await says(
		moved('<Card title="One" />\n      <Card title="Two" />', '<Card title="Two" />\n      <Card title="One" />'),
	);
	await shows(".card", ["Two", "One"]);
	expect(f.bytes("shared/ui/card.tsx")).toBe(CARD);
	await f.history();
	await says(PAGE);

	// the heading's neighbour on screen is past a condition the file computes:
	// the move refuses on the element, and the file stands
	await hold(".gated h2");
	await page.keyboard.press("ArrowDown");
	const refusal = page.locator("[data-hand-refusal]");
	await expect.poll(() => refusal.count(), { timeout: 15_000 }).toBe(1);
	expect(await refusal.innerText()).toContain("comes from a condition");
	expect(file()).toBe(PAGE);

	// the Edit tool: a drag moves the element grabbed
	await requests.quiet();
	await page.keyboard.press("e");
	const docs = await frame.locator('a[href="#docs"]').boundingBox();
	const get = await frame.locator('a[href="#get"]').boundingBox();
	if (docs === null || get === null) throw new Error("the links have no box");
	await page.mouse.move(docs.x + docs.width / 2, docs.y + docs.height / 2);
	await page.mouse.down();
	await page.mouse.move(docs.x + docs.width / 2 + 10, docs.y + docs.height / 2, { steps: 4 });
	await page.mouse.move(get.x + get.width - 4, get.y + get.height / 2, { steps: 12 });
	await expect.poll(() => page.locator("[data-drop-line]").count(), { timeout: 10_000 }).toBe(1);
	await page.mouse.up();
	await says(moved(NAV("docs", "code", "get"), NAV("code", "get", "docs")));
	await shows(".links a", ["GitHub", "Get", "Docs"]);
	expect(await page.locator("[data-drop-line]").count()).toBe(0);
	await f.history();
	await says(PAGE);

	// a drag that starts inside a row moves the row
	await requests.quiet();
	const ship = await frame.locator(".steps li:nth-child(3) b").boundingBox();
	const sketch = await frame.locator(".steps li:nth-child(1)").boundingBox();
	if (ship === null || sketch === null) throw new Error("the rows have no box");
	await page.mouse.move(ship.x + ship.width / 2, ship.y + ship.height / 2);
	await page.mouse.down();
	await page.mouse.move(ship.x + ship.width / 2, ship.y + ship.height / 2 - 10, { steps: 4 });
	await page.mouse.move(sketch.x + 20, sketch.y + 2, { steps: 12 });
	await expect.poll(() => page.locator("[data-drop-line]").count(), { timeout: 10_000 }).toBe(1);
	await page.mouse.up();
	await says(moved("['Sketch', 'Build', 'Ship']", "['Ship', 'Sketch', 'Build']"));
	await shows(".steps li", ["Ship", "Sketch", "Build"]);
	await f.history();
	await says(PAGE);
	requests.stop();
});
