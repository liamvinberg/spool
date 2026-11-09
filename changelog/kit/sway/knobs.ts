import { ui } from "spool";

/* Sway's tunables: the card that holds the move you're on, and the colour the class runs in. */
export const k = ui.knobs({
	card: {
		radius: { type: "corners", value: 30, min: 0, max: 48 },
		accent: { type: "color", value: "#b4492b", swatches: ["#b4492b", "#5f6b3a", "#2d5d7b", "#c4677a", "#1e1a16"] },
		paper: { type: "color", value: "#fbf8f3", swatches: ["#fbf8f3", "#ffffff", "#f1ece3", "#1e1a16"] },
	},
	type: {
		title: { type: "font", value: "Instrument Serif", options: ["Instrument Serif", "Inter"] },
	},
});
