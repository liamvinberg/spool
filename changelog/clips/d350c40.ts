import { cpSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { assembleCanvasFig, createFigZip, encodeFigParts, parseFig } from "openfig-core";
import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.52.0, Figma files: a .fig dropped on Home becomes a project, and the agent rebuilds its frames from what spool read */

/**
 * Kin.fig, made the way the reader's fixture was: the real Figma copy in src/fixtures/import/reading-list.fig, re-encoded
 * with openfig-core, its frame and text layers the templates for kin's three phone screens (changelog/kit/kin), linked
 * Pay → Confirm → Sent → Amount as kin walks them.
 */
function kinFig(): string {
	const doc = parseFig(
		new Uint8Array(readFileSync(new URL("../../src/fixtures/import/reading-list.fig", import.meta.url))),
	);
	type Guid = { sessionID: number; localID: number };
	type Layer = Record<string, unknown>;
	const layer = (id: string): Layer => structuredClone(doc.nodeMap.get(id)) as unknown as Layer;
	const FRAME = layer("1:15");
	for (const key of Object.keys(FRAME))
		if (key.startsWith("stack") || key === "parameterConsumptionMap") delete FRAME[key];
	const TEXT = layer("1:16");
	delete TEXT.derivedTextData;
	delete TEXT.stackChildAlignSelf;
	const page = layer("0:1");
	page.name = "Pay";
	const root = page.guid as Guid;
	const layers: Layer[] = [];
	let next = 100;
	const counts = new Map<Guid, number>();
	const place = (parent: Guid) => {
		const n = counts.get(parent) ?? 0;
		counts.set(parent, n + 1);
		return { guid: parent, position: String.fromCharCode(0x21 + n) };
	};
	const solid = (hex: string, opacity = 1) => {
		const n = Number.parseInt(hex.slice(1), 16);
		const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as [number, number, number];
		const authoredColor = { space: "DEFAULT", c0: r, c1: g, c2: b, c3: 1 };
		return { type: "SOLID", color: { r, g, b, a: 1 }, opacity, visible: true, blendMode: "NORMAL", authoredColor };
	};
	const at = (x: number, y: number) => ({ m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y });
	const frame = (
		parent: Guid,
		name: string,
		box: { x: number; y: number; w: number; h: number; fill?: string; alpha?: number; radius?: number; link?: Guid },
	): Guid => {
		const guid = { sessionID: 1, localID: next++ };
		const radius = box.radius ?? 0;
		layers.push({
			...structuredClone(FRAME),
			guid,
			parentIndex: place(parent),
			name,
			size: { x: box.w, y: box.h },
			transform: at(box.x, box.y),
			fillPaints: box.fill === undefined ? [] : [solid(box.fill, box.alpha)],
			...(radius > 0 && {
				cornerRadius: radius,
				rectangleTopLeftCornerRadius: radius,
				rectangleTopRightCornerRadius: radius,
				rectangleBottomLeftCornerRadius: radius,
				rectangleBottomRightCornerRadius: radius,
			}),
			...(box.link !== undefined && {
				prototypeInteractions: [
					{
						id: { sessionID: 1, localID: next++ },
						event: { interactionType: "ON_CLICK" },
						actions: [
							{ transitionNodeID: box.link, connectionType: "INTERNAL_NODE", navigationType: "NAVIGATE" },
						],
						isDeleted: false,
						stateManagementVersion: 1,
					},
				],
			}),
		});
		return guid;
	};
	const text = (
		parent: Guid,
		characters: string,
		t: {
			x: number;
			y: number;
			w: number;
			size: number;
			style?: string;
			color: string;
			alpha?: number;
			align?: string;
			tracking?: number;
		},
	) =>
		layers.push({
			...structuredClone(TEXT),
			guid: { sessionID: 1, localID: next++ },
			parentIndex: place(parent),
			name: characters,
			textData: { ...(TEXT.textData as object), characters },
			fontSize: t.size,
			fontName: { family: "Inter Tight", style: t.style ?? "Regular", postscript: "" },
			letterSpacing: { value: t.tracking ?? 0, units: "PERCENT" },
			size: { x: t.w, y: Math.round(t.size * 1.2) },
			transform: at(t.x, t.y),
			fillPaints: [solid(t.color, t.alpha)],
			textAlignHorizontal: t.align ?? "LEFT",
			textAutoResize: "HEIGHT",
		});

	const ACCENT = "#3b3bf0";
	const INK = "#111214";
	const WHITE = "#ffffff";
	const W = 390;
	const mid = (w: number) => (W - w) / 2;
	const amount = frame(root, "Amount", { x: 0, y: 0, w: W, h: 844, fill: ACCENT });
	const confirm = frame(root, "Confirm", { x: 470, y: 0, w: W, h: 844, fill: "#f4f3f0" });
	const sent = frame(root, "Sent", { x: 940, y: 0, w: W, h: 844, fill: ACCENT });
	(layers[0] as Layer).prototypeStartingPoint = { name: "Pay Maya", description: "", position: "!" };
	const status = (on: Guid, color: string) =>
		text(frame(on, "Status bar", { x: 0, y: 0, w: W, h: 54 }), "9:41", {
			x: 32,
			y: 18,
			w: 60,
			size: 16,
			style: "Semi Bold",
			color,
		});
	const card = (on: Guid, y: number, balance: string, inverted: boolean) => {
		const color = inverted ? ACCENT : WHITE;
		const c = frame(on, "Card", { x: 20, y, w: 350, h: 196, fill: inverted ? WHITE : ACCENT, radius: 26 });
		text(c, "kin", { x: 24, y: 24, w: 80, size: 22, style: "Extra Bold", color, tracking: -4 });
		text(c, "Balance", { x: 24, y: 112, w: 120, size: 14, style: "Medium", color, alpha: 0.7 });
		text(c, balance, { x: 24, y: 134, w: 200, size: 34, style: "Bold", color, tracking: -3 });
		text(c, "•••• 4021", { x: 226, y: 146, w: 100, size: 16, style: "Semi Bold", color, alpha: 0.8, align: "RIGHT" });
	};
	const button = (on: Guid, label: string, box: Parameters<typeof frame>[2], color: string, style = "Bold") =>
		text(frame(on, label, box), label, {
			x: 0,
			y: (box.h - 22) / 2,
			w: box.w,
			size: 18,
			style,
			color,
			align: "CENTER",
		});

	status(amount, WHITE);
	frame(amount, "Clear", { x: 20, y: 62, w: 40, h: 40, fill: WHITE, alpha: 0.16, radius: 20 });
	const to = frame(amount, "To", { x: mid(118), y: 62, w: 118, h: 40, fill: WHITE, alpha: 0.16, radius: 20 });
	frame(to, "Avatar", { x: 6, y: 6, w: 28, h: 28, fill: WHITE, radius: 14 });
	text(to, "To Maya", { x: 42, y: 10, w: 70, size: 16, style: "Semi Bold", color: WHITE });
	text(amount, "$42", { x: 0, y: 200, w: W, size: 136, style: "Bold", color: WHITE, align: "CENTER", tracking: -5 });
	const note = frame(amount, "Note", { x: mid(160), y: 380, w: 160, h: 38, fill: WHITE, alpha: 0.14, radius: 19 });
	text(note, "Ramen at Tajima", { x: 0, y: 10, w: 160, size: 15, style: "Medium", color: WHITE, align: "CENTER" });
	const keypad = frame(amount, "Keypad", { x: 24, y: 452, w: 342, h: 264 });
	for (const [i, key] of ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "←"].entries())
		text(keypad, key, {
			x: (i % 3) * 114,
			y: Math.floor(i / 3) * 66 + 16,
			w: 114,
			size: 30,
			style: "Semi Bold",
			color: WHITE,
			align: "CENTER",
		});
	button(
		amount,
		"Request",
		{ x: 20, y: 734, w: 169, h: 58, fill: WHITE, alpha: 0.16, radius: 29 },
		WHITE,
		"Semi Bold",
	);
	button(amount, "Pay", { x: 201, y: 734, w: 169, h: 58, fill: WHITE, radius: 29, link: confirm }, ACCENT);

	status(confirm, INK);
	frame(confirm, "Back", { x: 20, y: 62, w: 40, h: 40, fill: "#000000", alpha: 0.06, radius: 20 });
	text(confirm, "Review", { x: 0, y: 72, w: W, size: 17, style: "Semi Bold", color: INK, align: "CENTER" });
	const face = frame(confirm, "Avatar", { x: mid(92), y: 134, w: 92, h: 92, fill: ACCENT, radius: 46 });
	text(face, "MC", { x: 0, y: 28, w: 92, size: 32, style: "Bold", color: WHITE, align: "CENTER" });
	text(confirm, "Maya Collins", {
		x: 0,
		y: 242,
		w: W,
		size: 28,
		style: "Bold",
		color: INK,
		align: "CENTER",
		tracking: -2,
	});
	text(confirm, "$mayacollins", { x: 0, y: 280, w: W, size: 16, color: INK, alpha: 0.52, align: "CENTER" });
	text(confirm, "$42", { x: 0, y: 330, w: W, size: 76, style: "Bold", color: INK, align: "CENTER", tracking: -5 });
	text(confirm, "Ramen at Tajima", { x: 0, y: 418, w: W, size: 17, color: INK, alpha: 0.52, align: "CENTER" });
	text(confirm, "Pay from", { x: 24, y: 512, w: 200, size: 15, style: "Medium", color: INK, alpha: 0.52 });
	card(confirm, 540, "$1,284.50", false);
	button(confirm, "Pay $42", { x: 20, y: 756, w: 350, h: 62, fill: INK, radius: 31, link: sent }, WHITE);

	status(sent, WHITE);
	frame(sent, "Check", { x: mid(112), y: 190, w: 112, h: 112, fill: WHITE, radius: 56 });
	text(sent, "$42", { x: 0, y: 334, w: W, size: 104, style: "Bold", color: WHITE, align: "CENTER", tracking: -5 });
	text(sent, "Sent to Maya", { x: 0, y: 456, w: W, size: 24, style: "Semi Bold", color: WHITE, align: "CENTER" });
	text(sent, "Ramen at Tajima", { x: 0, y: 490, w: W, size: 17, color: WHITE, alpha: 0.7, align: "CENTER" });
	card(sent, 538, "$1,242.50", true);
	button(sent, "Done", { x: 20, y: 756, w: 350, h: 62, fill: WHITE, radius: 31, link: amount }, ACCENT);

	// the document and the hidden canvas Figma keeps, then the one page and its layers
	doc.message.nodeChanges = [layer("0:0"), page, layer("20000003:2"), ...layers] as never;
	const parts = encodeFigParts(doc);
	const canvasFig = assembleCanvasFig({ ...parts, messageCompressed: deflateRawSync(parts.messageRaw) });
	return Buffer.from(createFigZip({ canvasFig, meta: { file_name: "Kin" } })).toString("base64");
}
const fig = kinFig();

/** kin's screens, one frame each, its primary action walking to the next as the file's links do */
const kin = (screen: string, next: string) => `import { ui } from "spool";
import { Kin } from "shared/kit/kin/kin";

export default function Frame() {
	return <Kin screen="${screen}" onNext={() => ui.go("${next}")} />;
}
`;
// phones at their real size, where the file has them
const box = (at: number) => JSON.stringify({ x: at * 450, y: 0, w: 390, h: 844 });

/** a file being dragged in from the Finder: its icon and name, carried under the hand */
const HELD = `<div style="display:grid;justify-items:center;gap:6px;margin:6px 0 0 -30px;opacity:.92">
	<div style="width:52px;height:64px;border-radius:6px;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.45);display:grid;place-items:center">
		<svg width="22" height="33" viewBox="0 0 38 57"><path fill="#f24e1e" d="M19 0H9.5a9.5 9.5 0 0 0 0 19H19z"/><path fill="#ff7262" d="M19 0h9.5a9.5 9.5 0 0 1 0 19H19z"/><path fill="#a259ff" d="M19 19H9.5a9.5 9.5 0 0 0 0 19H19z"/><circle cx="28.5" cy="28.5" r="9.5" fill="#1abcfe"/><path fill="#0acf83" d="M9.5 38H19v9.5A9.5 9.5 0 1 1 9.5 38z"/></svg>
	</div>
	<div style="padding:2px 6px;border-radius:4px;background:#2563eb;color:#fff;font:500 11px system-ui;white-space:nowrap">Kin.fig</div>
</div>`;

export default {
	kit: ["headway"],
	files: {
		"design/frames/departures/frame.json": JSON.stringify({ x: 80, y: 80, w: 390, h: 844 }),
		"design/frames/departures/frame.tsx": `import { ui } from "spool";
import { Headway } from "shared/kit/headway/headway";

export default function Frame() {
	return <Headway screen="departures" onGo={() => undefined} />;
}
`,
	},
	viewport: { w: 1120, h: 700 },
	agent: {
		steps: [
			{ wait: 600 },
			{ say: "Three screens in Kin: Amount, Confirm and Sent, each Pay walking to the next. Building them." },
			{ write: "design/frames/amount/frame.tsx", json: box(0), content: kin("amount", "confirm"), ms: 1200 },
			{ wait: 200 },
			{ write: "design/frames/confirm/frame.tsx", json: box(1), content: kin("confirm", "sent"), ms: 1200 },
			{ wait: 200 },
			{ write: "design/frames/sent/frame.tsx", json: box(2), content: kin("sent", "amount"), ms: 1200 },
			{ say: "Rebuilt Amount, Confirm and Sent from Kin.fig." },
		],
	},
	prepare: async ({ page, walk }) => {
		// the left side shut by hand, as the new project's canvas will keep it, so its frames have room beside the agent
		const left = page.locator('[aria-label="Close the left side"]');
		if (await left.isVisible()) await left.click();
		await page.locator("text=Home").first().click();
		await page.waitForTimeout(1500);
		await walk([{ move: { x: -30, y: 380 }, ms: 50 }]);
		await page.waitForTimeout(1500);
	},
	live: async ({ page, walk, root }) => {
		const drag = (type: string, x: number, y: number) =>
			page.evaluate(
				async ({ type, x, y, fig }) => {
					const bytes = Uint8Array.from(atob(fig), (c) => c.charCodeAt(0));
					const data = new DataTransfer();
					data.items.add(new File([bytes], "Kin.fig", { type: "" }));
					const at = document.elementFromPoint(x, y) ?? document.body;
					at.dispatchEvent(
						new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: data }),
					);
				},
				{ type, x, y, fig },
			);
		await page.evaluate((held) => {
			const element = document.createElement("div");
			element.dataset.clipHeld = "";
			// it starts where the hand waits, outside the window
			element.style.cssText =
				"position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;transform:translate(-30px,380px)";
			element.innerHTML = held;
			document.documentElement.append(element);
		}, HELD);
		await walk([{ wait: 300 }, { move: { x: 180, y: 360 }, ms: 500 }]);
		await drag("dragenter", 180, 360);
		await walk([{ move: { x: 560, y: 350 }, ms: 900 }, { wait: 500 }]);
		await drag("dragover", 560, 350);
		await page.evaluate(() => document.querySelector("[data-clip-held]")?.remove());
		await drag("drop", 560, 350);
		// the new project is beside the clip's, in the lane: it gets the kit its frames import before they are written
		const design = join(dirname(root), "projects", "Kin", "design");
		for (let i = 0; i < 100 && !existsSync(design); i++) await page.waitForTimeout(50);
		cpSync(new URL("../kit/kin", import.meta.url), join(design, "shared/kit/kin"), { recursive: true });
		// a new project's camera stays where its first frame lands: zoom to fit every frame as each one does, as a person would
		for (const name of ["amount", "confirm", "sent"]) {
			const json = join(design, "frames", name, "frame.json");
			for (let i = 0; i < 300 && !existsSync(json); i++) await page.waitForTimeout(50);
			await page.waitForTimeout(250);
			await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
			await page.keyboard.press("Shift+Digit1");
		}
		await page.locator('[data-agent-trail-button="done"]').waitFor({ timeout: 30_000 });
		await walk([{ wait: 2500 }]);
	},
} satisfies Clip;
