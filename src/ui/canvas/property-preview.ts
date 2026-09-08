import type { SourceRead } from "../../source-edit";
import type { SourcePropertyPreview } from "../../source-property";

/** Native samples use the original compiler's declaration and conditions, never save authority. */
export function samplePropertyPreview(
	read: SourceRead,
	revision: number,
	value: string | undefined,
): SourcePropertyPreview | undefined {
	const template = read.propertyPreview;
	if (!template || read.operation.kind !== "property" || value === undefined || /[;{}]/.test(value)) return;
	if (!CSS.supports(read.operation.property, value)) return;
	return {
		...template.plan,
		revision,
		frames: template.plan.frames.map((frame) => ({
			...frame,
			css: frame.css.replaceAll(template.placeholder, value),
			bundledCss: frame.bundledCss.replaceAll(template.placeholder, value),
		})),
	};
}
