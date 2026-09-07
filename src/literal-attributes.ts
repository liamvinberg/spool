export const LITERAL_ATTRIBUTES_EVERY: readonly string[] = ["title", "aria-label"];

export const LITERAL_ATTRIBUTES_BY_TAG: Readonly<Record<string, readonly string[]>> = {
	a: ["href", "target", "rel"],
	area: ["href", "alt"],
	audio: ["src"],
	button: ["type", "name", "value"],
	form: ["action", "method"],
	iframe: ["src"],
	img: ["src", "alt"],
	input: ["type", "placeholder", "name", "value"],
	label: ["htmlFor"],
	option: ["value"],
	select: ["name"],
	source: ["src", "srcSet"],
	td: ["colSpan", "rowSpan"],
	textarea: ["placeholder", "name"],
	th: ["scope", "colSpan", "rowSpan"],
	time: ["dateTime"],
	track: ["src", "label"],
	video: ["src", "poster"],
};
