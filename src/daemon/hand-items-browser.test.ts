import { expect, it } from "vitest";
import { apiRequests, handCanvas } from "./hand-browser-helpers";

/**
 * One row of a list, out of the list (#324).
 *
 * The fixture is olmestudios' shape, which is where this was found: a shared
 * component holding a module-level array and mapping it, rendered by two
 * frames. The stamp under the hand is one `<div>` the document drew three
 * times, so the characters at it are every row; what a person means by ⌫ is
 * the entry, and the entry is in the array literal. A second list maps a call
 * rather than a literal, which has no entry to take out and says so.
 */

const EXPERIENCE = `export const experience = [
  { brand: 'UNIQLO', role: 'Head of Marketing Scandinavia' },
  { brand: 'Rodebjer', role: 'Marketing Director' },
  { brand: 'Eton', role: 'Global PR Director' },
];

export function Experience() {
  return <section className="experience"><div className="experience-grid">{experience.map(item => <div key={item.brand} className="row"><h3>{item.brand}</h3><span>{item.role}</span></div>)}</div></section>;
}
`;

const CSS = `.site { font-family: system-ui, sans-serif; color: #1a1a1a; background: #f5f2ee; padding: 24px; }
.experience { padding: 20px 0; }
.experience-grid { display: flex; flex-direction: column; gap: 12px; }
.row { display: flex; gap: 12px; align-items: baseline; }
h3 { font-size: 22px; margin: 0; }
span { font-size: 14px; color: #6b6560; }
li { font-size: 14px; }
`;

/** A list with no literal behind it: the rows come from a call, and a hand cannot take an entry out of one. */
const COMPUTED = `export function Places() {
  return <ul className="places">{rooms().map(room => <li key={room}>{room}</li>)}</ul>;
}

function rooms() {
  return ['Studio', 'Atelier'];
}
`;

const PAGE = `import { Experience } from '../../shared/ui/experience';
import { Places } from '../../shared/ui/places';
import '../../shared/ui/site.css';

export default function Page() {
  return <main className="site" id="top"><Experience/><Places/></main>;
}
`;

/** The second frame rendering the same shared definition, which the write has to reach. */
const OTHER = `import { Experience } from '../../shared/ui/experience';
import '../../shared/ui/site.css';

export default function Other() {
  return <main className="site" id="top"><Experience/></main>;
}
`;

const FILES = {
	"shared/ui/site.css": CSS,
	"shared/ui/experience.tsx": EXPERIENCE,
	"shared/ui/places.tsx": COMPUTED,
	"frames/other/frame.tsx": OTHER,
	"frames/other/frame.json": JSON.stringify({ x: 700, y: 0, w: 420, h: 320 }),
};

it("deletes one row of a list from the array behind it", { timeout: 240_000 }, async () => {
	const f = await handCanvas(FILES, PAGE, { w: 650, h: 500 });
	const { page, frame } = f;
	const other = page.frameLocator('iframe[title="other"]');
	const requests = apiRequests(page, f.project.name);
	const array = () => f.bytes("shared/ui/experience.tsx");
	const says = (snippet: string, there = true) =>
		expect.poll(() => array().includes(snippet), { timeout: 15_000 }).toBe(there);
	const rows = (count: number) => expect.poll(() => frame.locator(".row").count(), { timeout: 20_000 }).toBe(count);
	/**
	 * Hold one element the way a person does.
	 *
	 * Quiet on both sides of the click: a write to a shared file reloads every
	 * document rendering it, and a person does not race a reload — they look at
	 * what arrived and then point at it. The read the next write is measured
	 * against is the last thing a selection sends, so the second wait is what
	 * makes the gesture after this one the one that was meant.
	 */
	const hold = async (selector: string, at?: { x: number; y: number }) => {
		await requests.quiet();
		const held = await f.select(selector, at);
		await requests.quiet();
		return held;
	};

	await expect.poll(() => other.locator(".row").count(), { timeout: 30_000 }).toBe(3);

	// ⌫ on a rung inside a mapped row resolves to the row: the array loses the
	// entry, the JSX literal every row is drawn from stands, and both frames
	// stop drawing that row
	await hold(".row:nth-child(2) h3");
	await page.keyboard.press("Backspace");
	await says("Rodebjer", false);
	await says("{ brand: 'UNIQLO', role: 'Head of Marketing Scandinavia' },");
	await says("<h3>{item.brand}</h3>");
	await rows(2);
	await expect.poll(() => other.locator(".row").count(), { timeout: 20_000 }).toBe(2);

	// undo puts the entry back, and the rows with it, in both frames
	await f.history();
	await says("{ brand: 'Rodebjer', role: 'Marketing Director' },");
	await expect.poll(() => array(), { timeout: 15_000 }).toBe(EXPERIENCE);
	await rows(3);
	await expect.poll(() => other.locator(".row").count(), { timeout: 20_000 }).toBe(3);

	// any other rung inside the row is the same gesture and never the template:
	// one entry goes, not the one literal that draws them all
	await hold(".row:nth-child(3) span");
	await page.keyboard.press("Backspace");
	await says("Eton", false);
	await says('<div key={item.brand} className="row">');
	await rows(2);
	await f.history();
	await expect.poll(() => array(), { timeout: 15_000 }).toBe(EXPERIENCE);
	await rows(3);

	// a list whose rows come from a call has no entry to take out, and the
	// refusal names the call rather than editing a template three rows wide
	const places = f.bytes("shared/ui/places.tsx");
	await hold(".places li");
	await page.keyboard.press("Backspace");
	const refusal = page.locator("[data-hand-refusal]");
	await expect.poll(() => refusal.count(), { timeout: 15_000 }).toBe(1);
	expect(await refusal.innerText()).toContain("rooms()");
	expect(f.bytes("shared/ui/places.tsx")).toBe(places);
	await expect.poll(() => frame.locator(".places li").count(), { timeout: 15_000 }).toBe(2);

	// and the whole of what the component returns still refuses as it did: the
	// call that renders it is what a hand can take out
	// its own padding is the only part of it no child covers, which is where a
	// person clicks to hold a section rather than a row
	await hold("section.experience", { x: 20, y: 6 });
	await page.keyboard.press("Backspace");
	await expect.poll(() => refusal.count(), { timeout: 15_000 }).toBe(1);
	expect(await refusal.innerText()).toContain("Experience");
	expect(array()).toBe(EXPERIENCE);

	requests.stop();
});
