/** Native color serialization without drawing pixels or adopting styles into the application. */
export function nativeColor(value: string): string | undefined {
	if (
		/\b(?:currentcolor|inherit|initial|unset|revert|revert-layer)\b|\b(?:light-dark|contrast-color|var|env|attr)\(/i.test(
			value,
		)
	)
		return;
	const context = new OffscreenCanvas(1, 1).getContext("2d");
	if (!context) return;
	const parse = (input: string): string | undefined => {
		context.fillStyle = "#010203";
		context.fillStyle = input;
		const first = context.fillStyle;
		context.fillStyle = "#040506";
		context.fillStyle = input;
		return typeof first === "string" && first === context.fillStyle ? first : undefined;
	};
	// Serialize once before changing color spaces, matching computed CSS precision.
	const parsed = parse(value);
	return parsed === undefined ? undefined : parse(`color(from ${parsed} srgb r g b / alpha)`);
}
