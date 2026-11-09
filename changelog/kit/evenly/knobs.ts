import { ui } from "spool";

export const k = ui.knobs({
	card: {
		radius: { type: "corners", value: 24, min: 0, max: 48 },
	},
	people: {
		you: { type: "color", value: "#b9a2ff", swatches: ["#b9a2ff", "#f3f2ee", "#ffd25e"] },
		leo: { type: "color", value: "#62aaff", swatches: ["#62aaff", "#4fd1c5", "#8fb4ff"] },
		nina: { type: "color", value: "#ff7d5c", swatches: ["#ff7d5c", "#ff9bc4", "#ffb35c"] },
		ruby: { type: "color", value: "#c9f25e", swatches: ["#c9f25e", "#7be0a0", "#ffe45e"] },
	},
});

/** A corners knob reads as one radius or four; CSS takes either. */
export function corners(r: number | readonly number[]) {
	return typeof r === "number" ? r : r.map((v) => `${v}px`).join(" ");
}
