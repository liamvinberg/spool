// The one scene both variants render. Identical layout so the judgment is about feel, not content.

export type ScreenId = "login" | "today" | "habit" | "stats" | "buttons";

export type SceneFrame = {
	id: string;
	name: string;
	screen: ScreenId;
	x: number;
	y: number;
	w: number;
	h: number;
};

export type SceneArrow = {
	id: string;
	from: string;
	to: string;
};

export const sceneFrames: SceneFrame[] = [
	{ id: "f-login", name: "login", screen: "login", x: 0, y: 0, w: 390, h: 844 },
	{ id: "f-today", name: "today", screen: "today", x: 560, y: 0, w: 390, h: 844 },
	{ id: "f-habit", name: "habit detail", screen: "habit", x: 1120, y: 0, w: 390, h: 844 },
	{ id: "f-buttons", name: "components / buttons", screen: "buttons", x: 0, y: 1020, w: 420, h: 320 },
	{ id: "f-stats", name: "stats · desktop", screen: "stats", x: 560, y: 1020, w: 1180, h: 740 },
];

export const sceneArrows: SceneArrow[] = [
	{ id: "a-login-today", from: "f-login", to: "f-today" },
	{ id: "a-today-habit", from: "f-today", to: "f-habit" },
	{ id: "a-today-stats", from: "f-today", to: "f-stats" },
];
