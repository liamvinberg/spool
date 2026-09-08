import type { UseOutcome } from "../source-edit";
import type { SourceImageExpectation } from "../source-image";

/** A loaded attribute is not proof that its bytes decoded or are the chosen native image. */
export function observeImage(
	element: HTMLElement,
	expected: SourceImageExpectation,
): Pick<UseOutcome, "rendered" | "reason"> {
	if (!(element instanceof HTMLImageElement))
		return { rendered: "unverified", reason: "the original image host changed" };
	if (expected.absent || expected.value === "")
		return !element.hasAttribute("src") && !element.currentSrc
			? { rendered: "verified" }
			: { rendered: "mismatching" };
	if (element.getAttribute("src") !== expected.value) return { rendered: "mismatching" };
	if (!element.complete) return { rendered: "pending", reason: "the saved image is still decoding" };
	if (!element.naturalWidth || !element.naturalHeight)
		return { rendered: "failed", reason: "the saved image could not decode" };
	if (element.currentSrc !== new URL(expected.value, element.ownerDocument.baseURI).href)
		return { rendered: "mismatching", reason: "the browser selected a different image resource" };
	return { rendered: "verified" };
}

export async function decodeImage(value: string): Promise<boolean> {
	const image = new Image();
	image.src = value;
	try {
		await image.decode();
		return image.naturalWidth > 0 && image.naturalHeight > 0;
	} catch {
		return false;
	}
}
