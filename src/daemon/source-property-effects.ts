import type { SourcePropertyEffect, SourcePropertyEnvironment } from "../source-property";
import { anatomyOf } from "./class-write";
import type { PropertyCertificate } from "./source-property-compile";

/** Control identities for compound compiler components, not token-prefix ownership. */
const components: Readonly<Record<string, readonly string[]>> = {
	scale: ["scale", "--tw-scale-x", "--tw-scale-y", "--tw-scale-z"],
	"column-gap, between children": ["margin-inline-start", "margin-inline-end"],
	"row-gap, between children": ["margin-block-start", "margin-block-end"],
	"border-color, between children": ["border-color"],
	"scale-x": ["--tw-scale-x"],
	"scale-y": ["--tw-scale-y"],
	"rotate-x": ["--tw-rotate-x"],
	"rotate-y": ["--tw-rotate-y"],
	skew: ["--tw-skew-x", "--tw-skew-y"],
	"skew-x": ["--tw-skew-x"],
	"skew-y": ["--tw-skew-y"],
	translate: ["--tw-translate-x", "--tw-translate-y"],
	"translate-x": ["--tw-translate-x"],
	"translate-y": ["--tw-translate-y"],
	"font-variant-numeric": [
		"font-variant-numeric",
		"--tw-ordinal",
		"--tw-slashed-zero",
		"--tw-numeric-figure",
		"--tw-numeric-spacing",
		"--tw-numeric-fraction",
	],
	filter: ["--tw-blur", "--tw-grayscale", "--tw-invert", "--tw-sepia", "filter"],
	brightness: ["--tw-brightness"],
	contrast: ["--tw-contrast"],
	saturate: ["--tw-saturate"],
	"hue-rotate": ["--tw-hue-rotate"],
	"ring-width": ["--tw-ring-shadow"],
	"ring-offset-width": ["--tw-ring-offset-width"],
	"ring-color": ["--tw-ring-color"],
	"box-shadow color": ["--tw-shadow-color"],
	"box-shadow": ["--tw-shadow"],
	"placeholder color": ["color"],
};

function physical(property: string, environment: SourcePropertyEnvironment): string {
	if (!/(?:inline|block)-(?:start|end)|border-(?:start|end)-(?:start|end)-radius/.test(property)) return property;
	const { writingMode, direction } = environment;
	if (!["horizontal-tb", "vertical-rl", "vertical-lr"].includes(writingMode))
		throw new Error("this native writing mode has no proven logical property mapping");
	const inline = writingMode === "horizontal-tb" ? ["left", "right"] : ["top", "bottom"];
	if (direction === "rtl") inline.reverse();
	const block =
		writingMode === "horizontal-tb"
			? ["top", "bottom"]
			: writingMode === "vertical-rl"
				? ["right", "left"]
				: ["left", "right"];
	const corner = /^border-(start|end)-(start|end)-radius$/.exec(property);
	if (corner) {
		const sides = [block[corner[1] === "start" ? 0 : 1], inline[corner[2] === "start" ? 0 : 1]];
		return `border-${sides.find((side) => side === "top" || side === "bottom")}-${sides.find((side) => side === "left" || side === "right")}-radius`;
	}
	return property
		.replace(
			/(inline|block)-(start|end)/g,
			(_, axis: string, edge: string) => (axis === "inline" ? inline : block)[edge === "start" ? 0 : 1]!,
		)
		.replace(/^inset-(top|right|bottom|left)$/, "$1");
}

/** CSS shorthand membership is independent of a utility's spelling or value. */
export function propertyKeys(property: string, environment: SourcePropertyEnvironment): string[] {
	let names: string[];
	if (["padding", "margin", "inset"].includes(property))
		names = ["top", "right", "bottom", "left"].map((side) => (property === "inset" ? side : `${property}-${side}`));
	else if (/^border-(width|style|color)$/.test(property))
		names = ["top", "right", "bottom", "left"].map((side) => `border-${side}-${property.slice(7)}`);
	else if (property === "border-radius")
		names = ["top-left", "top-right", "bottom-right", "bottom-left"].map((corner) => `border-${corner}-radius`);
	else if (/^(padding|margin|inset)-(inline|block)$/.test(property))
		names = ["start", "end"].map((edge) => `${property}-${edge}`);
	else if (/^border-(inline|block)-(width|style|color)$/.test(property)) {
		const [, axis, part] = property.split("-");
		names = ["start", "end"].map((edge) => `border-${axis}-${edge}-${part}`);
	} else if (property === "gap") names = ["row-gap", "column-gap"];
	else if (property === "overflow") names = ["overflow-x", "overflow-y"];
	else if (property === "white-space") names = ["white-space-collapse", "text-wrap-mode"];
	else names = [property];
	return names.map((name) => physical(name, environment));
}

export function propertyInputs(effect: SourcePropertyEffect): string[] {
	const names = [...effect.value.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]!);
	if ([...effect.value.matchAll(/var\s*\(/g)].length !== names.length)
		throw new Error("this custom property reference has no bounded dependency proof");
	return names;
}

export function readPropertyEffects(
	certificate: PropertyCertificate,
	property: string,
	scope: string,
	environment: SourcePropertyEnvironment,
) {
	const roots = new Set((components[property] ?? [property]).flatMap((name) => propertyKeys(name, environment)));
	const candidates = certificate.effects.filter((effect) => {
		if (!effect.owner) return false;
		const variants = anatomyOf(effect.owner).variants;
		if ((variants.length ? `${variants.join(":")}:` : "") !== scope) return false;
		const siblings = certificate.effects.filter((other) => other.owner === effect.owner);
		// A size token's paired leading remains attached to that size binding.
		if (property === "line-height" && siblings.some((other) => other.property === "font-size")) return false;
		// The shared final filter declaration does not own its independent inputs.
		if (
			property === "filter" &&
			effect.property === "filter" &&
			propertyInputs(effect).length > 0 &&
			!siblings.some((other) => other.property !== "filter" && roots.has(other.property))
		)
			return false;
		const children = effect.path.includes(":where($ > :not(:last-child))");
		if (property.endsWith(", between children") !== children) return false;
		const placeholder = effect.path.some((part) => part.includes("::placeholder"));
		return property === "placeholder color" ? placeholder : !placeholder;
	});
	// Gradient stop declarations feed the image through compiler component variables.
	if (property === "background-image") {
		let changed = true;
		while (changed) {
			changed = false;
			for (const effect of candidates) {
				if (!propertyKeys(effect.property, environment).some((key) => roots.has(key))) continue;
				for (const name of propertyInputs(effect))
					if (name.startsWith("--tw-") && !roots.has(name)) {
						roots.add(name);
						changed = true;
					}
			}
		}
	}
	const effects = candidates.filter((effect) =>
		propertyKeys(effect.property, environment).some((key) => roots.has(key)),
	);
	const owners = [...new Set(effects.map((effect) => effect.owner!))];
	return { roots, effects, owners };
}
