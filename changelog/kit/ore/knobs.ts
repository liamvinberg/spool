import { ui } from "spool";

/** The card on all three screens: its corners, and Clay, the house colour. */
export const ore = ui.knobs({
	card: {
		radius: { type: "corners", value: 16, min: 0, max: 40 },
		accent: { type: "color", value: "#c4613e", swatches: ["#c4613e", "#d9a441", "#8a6cf0", "#e8578a"] },
	},
});
