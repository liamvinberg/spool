import { expect, it } from "vitest";
import { inspectPropertyCss } from "./source-property-compile";
import { propertyPreviewDeclarations } from "./source-property-preview";

it("derives a component's native function grammar from its compiled consumer", async () => {
	const marker = "var(--sample)";
	const compiled = await inspectPropertyCss(
		`.sample {--tw-brightness:brightness(${marker});--tw-grayscale:grayscale(1);filter:var(--tw-brightness) var(--tw-grayscale)}`,
	);
	expect(propertyPreviewDeclarations(compiled.effects, marker)).toEqual([
		{ property: "filter", value: `brightness(${marker})` },
	]);
	const unattached = await inspectPropertyCss(`.sample {--unrelated:brightness(${marker});filter:var(--different)}`);
	expect(propertyPreviewDeclarations(unattached.effects, marker)).toEqual([]);
});

it("keeps direct declarations and refuses unknown component grammars", async () => {
	const marker = "var(--sample)";
	const compiled = await inspectPropertyCss(`.sample {opacity:${marker};--x:${marker};scale:var(--x) 1}`);
	expect(propertyPreviewDeclarations(compiled.effects, marker)).toEqual([{ property: "opacity", value: marker }]);
});

it("requires a captured gradient consumer before validating a position slot", async () => {
	const marker = "var(--sample)";
	const unattached = await inspectPropertyCss(`.sample {--tw-gradient-from-position:${marker};background-image:none}`);
	expect(propertyPreviewDeclarations(unattached.effects, marker)).toEqual([]);
	const attached = await inspectPropertyCss(
		`.sample {--tw-gradient-from-position:${marker};--tw-gradient-stops:red var(--tw-gradient-from-position),blue;background-image:linear-gradient(var(--tw-gradient-stops))}`,
	);
	expect(propertyPreviewDeclarations(attached.effects, marker)).toEqual([
		{ property: "background-image", value: `linear-gradient(red ${marker}, blue)` },
	]);
});
