import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.51.0, pages as lists: a page of pages is a list you walk into, and the path walks you back */
const frame = (title: string, line: string, bg: string, ink: string) => `export default function Screen() {
	return (
		<div style={{ display: "grid", alignContent: "center", gap: 12, height: "100%", padding: 32, background: "${bg}", color: "${ink}", fontFamily: "system-ui" }}>
			<h1 style={{ margin: 0, fontSize: 34 }}>${title}</h1>
			<p style={{ margin: 0, fontSize: 18, opacity: 0.75 }}>${line}</p>
			<div style={{ height: 48, borderRadius: 12, background: "${ink}", opacity: 0.9 }} />
		</div>
	);
}
`;

const screens: [string, number, string, string, string, string][] = [
	["onboarding/intro", 0, "Välkommen", "Plan your week on the water", "#dbe8f1", "#1d3b53"],
	["onboarding/sign-up", 1, "Skapa konto", "One email, no password", "#e6eef4", "#1d3b53"],
	["checkout/cart", 0, "Varukorg", "Two items, 418 kr", "#f3e3d3", "#7a3416"],
	["checkout/pay", 1, "Betala", "Swish or card", "#f6ebe0", "#7a3416"],
	["checkout/done", 2, "Klart", "Your order is on its way", "#e3efe2", "#24502b"],
	["settings/profile", 0, "Profil", "Name, photo and email", "#ebe6f2", "#3c2b5c"],
];

export default {
	files: Object.fromEntries(
		screens.flatMap(([path, at, title, line, bg, ink]) => [
			[`design/frames/${path}/frame.json`, JSON.stringify({ x: 80 + at * 440, y: 80, w: 390, h: 520 })],
			[`design/frames/${path}/frame.tsx`, frame(title, line, bg, ink)],
		]),
	),
	// narrow enough that the window folds its rails away and the list fills the clip
	viewport: { w: 900, h: 560 },
	steps: [
		{ wait: 1000 },
		{ move: '[data-page-row="onboarding"]', ms: 700 },
		{ wait: 500 },
		{ move: '[data-page-row="checkout"]', ms: 500 },
		{ wait: 400 },
		{ press: " " },
		{ wait: 1800 },
		{ press: "Escape" },
		{ wait: 400 },
		{ click: '[data-page-row="checkout"]', ms: 300 },
		{ wait: 3000 },
		{ move: '[aria-label="Path"]', ms: 800 },
		{ wait: 600 },
		{ click: '[data-path-kind="crumb"]', ms: 300 },
		{ wait: 1500 },
		// the clip ends a beat after the last input, so the hand settles back on the page it left
		{ move: '[data-page-row="checkout"]', ms: 900 },
		{ wait: 1000 },
	],
} satisfies Clip;
