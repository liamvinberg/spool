import { ui } from "spool";

export const k = ui.knobs({
	card: {
		radius: { type: "corners", value: 30, min: 0, max: 48 },
	},
	line: {
		green: { type: "color", value: "#14975a", swatches: ["#14975a", "#0f7f8c", "#e2382f", "#2f6bd8"] },
		pink: { type: "color", value: "#d9468f", swatches: ["#d9468f", "#8a4fd6", "#e07b1f"] },
	},
	ticket: {
		today: { type: "color", value: "#f6a723", swatches: ["#f6a723", "#7cc3ff", "#ff8fb1", "#b8e05a"] },
		name: { type: "text", value: "Amber" },
	},
});

/** A corners knob reads as one radius or four; CSS takes either. */
export function corners(r: number | readonly number[]) {
	return typeof r === "number" ? r : r.map((v) => `${v}px`).join(" ");
}
