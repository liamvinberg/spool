import { createElement } from "react";
import { mount } from "own";
import Anim from "./anim";

mount(document.getElementById("c") as HTMLCanvasElement, createElement(Anim), {
	width: 2400,
	height: 1400,
	dpr: 1,
	fonts: { Inter: "/fonts/Inter.ttf" },
	onFrameStats: (s: unknown) => {
		(window as unknown as { __stats: unknown }).__stats = { ...(s as object) };
	},
});
