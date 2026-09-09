import type { Page } from "playwright-core";
import type { SourcePropertyEnvironment } from "../../source-property";

export async function mountPropertyNative(page: Page, placeholder = false) {
	await page.setContent(
		`<!doctype html><style id="compiled"></style><main style="display:flex;align-items:flex-start;width:640px;height:480px">${
			placeholder
				? '<input id="subject" placeholder="Native placeholder">'
				: '<div id="subject">Native text<span style="display:inline-block;width:40px">First</span><span style="display:inline-block;width:40px">Second</span></div>'
		}</main><input id="state" value="original">`,
	);
	await page.locator("#state").fill("retained native state");
}

export async function propertyNativeEnvironment(page: Page): Promise<SourcePropertyEnvironment> {
	return page.locator("#subject").evaluate((element) => {
		const style = getComputedStyle(element);
		if (style.direction !== "ltr" && style.direction !== "rtl") throw new Error("unknown native direction");
		return { direction: style.direction, writingMode: style.writingMode };
	});
}

/** Observe the browser's complete computed declarations, including inherited child and pseudo effects. */
export async function observePropertyNative(page: Page, literal: string, css: string) {
	return page.evaluate(
		async ({ literal, css }) => {
			const sheet = document.querySelector("#compiled")!;
			const subject = document.querySelector("#subject")!;
			sheet.textContent = css;
			subject.setAttribute("class", literal);
			// Authored transition delays also apply while a fresh reference receives its stylesheet.
			// Wait for those actual transitions, rather than sampling an intermediate native value.
			await Promise.all(document.getAnimations().map((animation) => animation.finished));
			function styles(element: Element, pseudo?: string) {
				const style = getComputedStyle(element, pseudo);
				return Object.fromEntries(Array.from(style, (property) => [property, style.getPropertyValue(property)]));
			}
			return {
				subject: styles(subject),
				children: [...subject.children].map((child) => styles(child)),
				before: styles(subject, "::before"),
				after: styles(subject, "::after"),
				placeholder: subject instanceof HTMLInputElement ? styles(subject, "::placeholder") : null,
				state: document.querySelector<HTMLInputElement>("#state")!.value,
			};
		},
		{ literal, css },
	);
}

/** Unused theme variables cannot count as evidence that the native property changed. */
export function nativePropertyEffects(snapshot: Awaited<ReturnType<typeof observePropertyNative>>) {
	const visible = (style: Record<string, string>) =>
		Object.fromEntries(Object.entries(style).filter(([property]) => !property.startsWith("--")));
	return {
		subject: visible(snapshot.subject),
		children: snapshot.children.map(visible),
		before: visible(snapshot.before),
		after: visible(snapshot.after),
		placeholder: snapshot.placeholder ? visible(snapshot.placeholder) : null,
	};
}

// Authored custom requests and ordinary reference tokens are explicit retained row contracts.
export const appearanceCustom: Readonly<Record<number, { value: string; token: string; retained?: string }>> = {
	49: { value: "0.75", token: "opacity-[0.75]" },
	50: { value: "75%", token: "scale-[75%]" },
	51: { value: "75%", token: "scale-x-[75%]" },
	52: { value: "75%", token: "scale-y-[75%]" },
	53: { value: "7.5deg", token: "rotate-[7.5deg]" },
	54: { value: "7.5deg", token: "rotate-x-[7.5deg]" },
	55: { value: "7.5deg", token: "rotate-y-[7.5deg]" },
	56: { value: "7.5deg", token: "skew-[7.5deg]" },
	57: { value: "7.5deg", token: "skew-x-[7.5deg]" },
	58: { value: "7.5deg", token: "skew-y-[7.5deg]" },
	59: { value: "3.5px", token: "translate-[3.5px]" },
	60: { value: "3.5px", token: "translate-x-[3.5px]" },
	61: { value: "3.5px", token: "translate-y-[3.5px]" },
	62: { value: "125%", token: "brightness-[125%]" },
	63: { value: "125%", token: "contrast-[125%]" },
	64: { value: "125%", token: "saturate-[125%]" },
	65: { value: "7.5deg", token: "hue-rotate-[7.5deg]" },
	66: { value: "12ms", token: "duration-[12ms]" },
	67: { value: "12ms", token: "delay-[12ms]" },
	68: { value: "3.5px", token: "border-[3.5px]" },
	69: { value: "3.5px", token: "border-t-[3.5px]" },
	70: { value: "3.5px", token: "border-r-[3.5px]" },
	71: { value: "3.5px", token: "border-b-[3.5px]" },
	72: { value: "3.5px", token: "border-l-[3.5px]" },
	73: { value: "3.5px", token: "border-x-[3.5px]" },
	74: { value: "3.5px", token: "border-y-[3.5px]" },
	75: { value: "3.5px", token: "border-s-[3.5px]" },
	76: { value: "3.5px", token: "border-e-[3.5px]" },
	77: { value: "3.5px", token: "outline-[3.5px]" },
	78: { value: "3.5px", token: "outline-offset-[3.5px]" },
	79: { value: "3.5px", token: "ring-[3.5px]" },
	80: { value: "3.5px", token: "ring-offset-[3.5px]" },
	81: { value: "3.5", token: "stroke-[3.5]" },
	82: { value: "3.5px", token: "indent-[3.5px]" },
	83: { value: "3.5px", token: "decoration-[3.5px]" },
	84: { value: "3.5px", token: "underline-offset-[3.5px]" },
	85: { value: "3", token: "line-clamp-[3]" },
	104: { value: "#123456", token: "bg-[#123456]" },
	105: { value: "#123456", token: "text-[#123456]" },
	106: { value: "#123456", token: "border-[#123456]" },
	107: { value: "#123456", token: "border-t-[#123456]" },
	108: { value: "#123456", token: "border-r-[#123456]" },
	109: { value: "#123456", token: "border-b-[#123456]" },
	110: { value: "#123456", token: "border-l-[#123456]" },
	111: { value: "#123456", token: "border-x-[#123456]" },
	112: { value: "#123456", token: "border-y-[#123456]" },
	113: { value: "#123456", token: "border-s-[#123456]" },
	114: { value: "#123456", token: "border-e-[#123456]" },
	115: { value: "#123456", token: "outline-[#123456]" },
	116: { value: "#123456", token: "ring-[#123456]" },
	118: { value: "#123456", token: "decoration-[#123456]" },
	119: { value: "#123456", token: "placeholder-[#123456]" },
	120: { value: "#123456", token: "caret-[#123456]" },
	121: { value: "#123456", token: "accent-[#123456]" },
	122: { value: "#123456", token: "shadow-[#123456]" },
	123: { value: "#123456", token: "fill-[#123456]" },
	124: { value: "#123456", token: "stroke-[#123456]" },
	125: { value: "Georgia", token: "font-[Georgia]" },
	126: { value: "23px", token: "text-[23px]", retained: "text-lg" },
	127: { value: "550", token: "font-[550]" },
	128: { value: "29px", token: "leading-[29px]" },
	129: { value: "1.5px", token: "tracking-[1.5px]" },
	130: { value: "0 2px 3px #123456", token: "shadow-[0_2px_3px_#123456]" },
	131: { value: "cubic-bezier(0.2,0,0.8,1)", token: "ease-[cubic-bezier(0.2,0,0.8,1)]" },
	132: { value: "3.5px", token: "rounded-[3.5px]" },
	133: { value: "3.5px", token: "rounded-tl-[3.5px]" },
	134: { value: "3.5px", token: "rounded-tr-[3.5px]" },
	135: { value: "3.5px", token: "rounded-br-[3.5px]" },
	136: { value: "3.5px", token: "rounded-bl-[3.5px]" },
};

export const appearanceCustomRefusals = [96, 97, 98, 99, 100, 101, 103, 137, 138, 140];

// Authored custom layout requests and their ordinary reference tokens, keyed by the row they belong to.
export const layoutCustom: Readonly<Record<string, { value: string; token: string; retained?: string }>> = {
	top: { value: "3.5px", token: "top-[3.5px]" },
	right: { value: "3.5px", token: "right-[3.5px]" },
	bottom: { value: "3.5px", token: "bottom-[3.5px]" },
	left: { value: "3.5px", token: "left-[3.5px]" },
	inset: { value: "3.5px", token: "inset-[3.5px]" },
	"inset-inline": { value: "3.5px", token: "inset-x-[3.5px]" },
	"inset-block": { value: "3.5px", token: "inset-y-[3.5px]" },
	"inset-inline-start": { value: "3.5px", token: "start-[3.5px]" },
	"inset-inline-end": { value: "3.5px", token: "end-[3.5px]" },
	"z-index": { value: "3", token: "z-[3]" },
	width: { value: "3.5px", token: "w-[3.5px]" },
	height: { value: "3.5px", token: "h-[3.5px]" },
	"width and height": { value: "3.5px", token: "size-[3.5px]" },
	"min-width": { value: "3.5px", token: "min-w-[3.5px]" },
	"max-width": { value: "3.5px", token: "max-w-[3.5px]" },
	"min-height": { value: "3.5px", token: "min-h-[3.5px]" },
	"max-height": { value: "3.5px", token: "max-h-[3.5px]" },
	"flex-basis": { value: "3.5px", token: "basis-[3.5px]" },
	padding: { value: "3.5px", token: "p-[3.5px]" },
	"padding-inline": { value: "3.5px", token: "px-[3.5px]" },
	"padding-block": { value: "3.5px", token: "py-[3.5px]" },
	"padding-top": { value: "3.5px", token: "pt-[3.5px]" },
	"padding-right": { value: "3.5px", token: "pr-[3.5px]" },
	"padding-bottom": { value: "3.5px", token: "pb-[3.5px]" },
	"padding-left": { value: "3.5px", token: "pl-[3.5px]" },
	"padding-inline-start": { value: "3.5px", token: "ps-[3.5px]" },
	"padding-inline-end": { value: "3.5px", token: "pe-[3.5px]" },
	margin: { value: "3.5px", token: "m-[3.5px]" },
	"margin-inline": { value: "3.5px", token: "mx-[3.5px]" },
	"margin-block": { value: "3.5px", token: "my-[3.5px]" },
	"margin-top": { value: "3.5px", token: "mt-[3.5px]" },
	"margin-right": { value: "3.5px", token: "mr-[3.5px]" },
	"margin-bottom": { value: "3.5px", token: "mb-[3.5px]" },
	"margin-left": { value: "3.5px", token: "ml-[3.5px]" },
	"margin-inline-start": { value: "3.5px", token: "ms-[3.5px]" },
	"margin-inline-end": { value: "3.5px", token: "me-[3.5px]" },
	gap: { value: "3.5px", token: "gap-[3.5px]" },
	"column-gap": { value: "3.5px", token: "gap-x-[3.5px]" },
	"row-gap": { value: "3.5px", token: "gap-y-[3.5px]" },
	"column-gap, between children": { value: "3.5px", token: "space-x-[3.5px]" },
	"row-gap, between children": { value: "3.5px", token: "space-y-[3.5px]" },
	"grid-template-columns": { value: "3", token: "grid-cols-[3]" },
	"grid-template-rows": { value: "3", token: "grid-rows-[3]" },
	"grid-column": { value: "3", token: "col-span-[3]" },
	"grid-row": { value: "3", token: "row-span-[3]" },
	"grid-column-start": { value: "3", token: "col-start-[3]" },
	"grid-row-start": { value: "3", token: "row-start-[3]" },
	columns: { value: "3", token: "columns-[3]" },
	order: { value: "3", token: "order-[3]" },
	"border-color, between children": { value: "#123456", token: "divide-[#123456]" },
};

/** Rows with no arbitrary value, each with the reason its control gives for refusing one. */
export const layoutCustomRefusals: Readonly<Record<string, string>> = {
	display: "a display is a choice from a list, not a value to author",
	"flex-direction": "a direction is a choice from a list, not a value to author",
	"flex-wrap": "a wrap is a choice from a list, not a value to author",
	"align-items": "an alignment is a choice from a list, not a value to author",
	"justify-content": "an alignment is a choice from a list, not a value to author",
	"align-self": "an alignment is a choice from a list, not a value to author",
	position: "a position is a choice from a list, not a value to author",
	overflow: "an overflow is a choice from a list, not a value to author",
	"overflow-x": "an overflow is a choice from a list, not a value to author",
	"overflow-y": "an overflow is a choice from a list, not a value to author",
	flex: "the flex shorthand is a choice from a list, not a value to author",
	"scroll-snap-type": "a snap type is a set of chips, and a chip is on or off",
	"width mode": "a mode picks the sizing utility; the width row authors the value",
	"height mode": "a mode picks the sizing utility; the height row authors the value",
};
