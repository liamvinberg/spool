import { ui } from "spool";

/* Lope's tunables: the card everything sits on, and the one colour the run is painted in. */
export const k = ui.knobs({
	card: {
		radius: { type: "corners", value: 28, min: 0, max: 48 },
		accent: { type: "color", value: "#d4ff3f", swatches: ["#d4ff3f", "#ff6a3d", "#7dd3fc", "#ff8fc7", "#f4f1ea"] },
	},
	numbers: {
		slant: { type: "toggle", value: true },
		width: { type: "slider", value: 72, min: 62, max: 100, unit: "%" },
	},
	motion: {
		replay: { type: "action", label: "Replay route" },
	},
});

/* black ink on a light accent, white on a dark one */
export function inkOn(hex: string) {
	const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
	if (Number.isNaN(n)) return "#0b0b0c";
	const r = (n >> 16) & 255;
	const g = (n >> 8) & 255;
	const b = n & 255;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? "#0b0b0c" : "#ffffff";
}
