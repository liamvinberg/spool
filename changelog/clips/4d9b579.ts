import type { Clip } from "../../.agents/skills/changelog/scripts/clip";

/** 0.50.0, knobs: a frame's own values in the properties rail, tuned by hand while it runs */
export default {
	files: {
		"design/frames/product-card/frame.json": JSON.stringify({ x: 80, y: 80, w: 390, h: 520 }),
		"design/frames/product-card/frame.tsx": `import { ui } from "spool";

const k = ui.knobs({
	card: {
		radius: { type: "slider", value: 8, min: 0, max: 40, unit: "px" },
		accent: { type: "color", value: "#c9a77c", swatches: ["#c9a77c", "#c8553d", "#2f6f5e"] },
	},
});

export default function ProductCard() {
	return (
		<div style={{ display: "grid", placeItems: "center", height: "100%", background: "#efe6da", fontFamily: "system-ui" }}>
			<div style={{ width: 300, borderRadius: k.card.radius + 8, background: "white", padding: 20 }}>
				<div style={{ height: 160, borderRadius: k.card.radius, background: k.card.accent }} />
				<h2 style={{ margin: "16px 0 4px" }}>Guji, Etiopien</h2>
				<p style={{ margin: 0, color: "#777" }}>Ljusrost, 250 g</p>
			</div>
		</div>
	);
}
`,
	},
	viewport: { w: 1120, h: 700 },
	steps: [
		{ wait: 600 },
		{ click: { selector: '[aria-label="clip canvas"] >> text=product-card', dy: 140 } },
		{ wait: 2500 },
		{ click: "text=radius" },
		{ wait: 800 },
		{ drag: { selector: "[role=slider]", dx: -80 }, by: { dx: 170, dy: 0 }, ms: 1600 },
		{ wait: 400 },
		{ click: "text=accent" },
		{ wait: 300 },
		{ click: '[aria-label="#c8553d"]' },
		{ wait: 600 },
		{ click: '[aria-label="#2f6f5e"]' },
		{ wait: 1200 },
	],
} satisfies Clip;
