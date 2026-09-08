// Attribute spellings from the pinned React DOM 19.2.7 aliases and setProp cases.
// Case-sensitive SVG names that React passes through (viewBox, preserveAspectRatio)
// deliberately remain unchanged. This projects an already-authorized source field.
const aliases: Readonly<Record<string, string>> = {
	className: "class",
	tabIndex: "tabindex",
	acceptCharset: "accept-charset",
	htmlFor: "for",
	httpEquiv: "http-equiv",
	crossOrigin: "crossorigin",
	accentHeight: "accent-height",
	alignmentBaseline: "alignment-baseline",
	arabicForm: "arabic-form",
	baselineShift: "baseline-shift",
	capHeight: "cap-height",
	clipPath: "clip-path",
	clipRule: "clip-rule",
	colorInterpolation: "color-interpolation",
	colorInterpolationFilters: "color-interpolation-filters",
	colorProfile: "color-profile",
	colorRendering: "color-rendering",
	dominantBaseline: "dominant-baseline",
	enableBackground: "enable-background",
	fillOpacity: "fill-opacity",
	fillRule: "fill-rule",
	floodColor: "flood-color",
	floodOpacity: "flood-opacity",
	fontFamily: "font-family",
	fontSize: "font-size",
	fontSizeAdjust: "font-size-adjust",
	fontStretch: "font-stretch",
	fontStyle: "font-style",
	fontVariant: "font-variant",
	fontWeight: "font-weight",
	glyphName: "glyph-name",
	glyphOrientationHorizontal: "glyph-orientation-horizontal",
	glyphOrientationVertical: "glyph-orientation-vertical",
	horizAdvX: "horiz-adv-x",
	horizOriginX: "horiz-origin-x",
	imageRendering: "image-rendering",
	letterSpacing: "letter-spacing",
	lightingColor: "lighting-color",
	markerEnd: "marker-end",
	markerMid: "marker-mid",
	markerStart: "marker-start",
	overlinePosition: "overline-position",
	overlineThickness: "overline-thickness",
	paintOrder: "paint-order",
	"panose-1": "panose-1",
	pointerEvents: "pointer-events",
	renderingIntent: "rendering-intent",
	shapeRendering: "shape-rendering",
	stopColor: "stop-color",
	stopOpacity: "stop-opacity",
	strikethroughPosition: "strikethrough-position",
	strikethroughThickness: "strikethrough-thickness",
	strokeDasharray: "stroke-dasharray",
	strokeDashoffset: "stroke-dashoffset",
	strokeLinecap: "stroke-linecap",
	strokeLinejoin: "stroke-linejoin",
	strokeMiterlimit: "stroke-miterlimit",
	strokeOpacity: "stroke-opacity",
	strokeWidth: "stroke-width",
	textAnchor: "text-anchor",
	textDecoration: "text-decoration",
	textRendering: "text-rendering",
	transformOrigin: "transform-origin",
	underlinePosition: "underline-position",
	underlineThickness: "underline-thickness",
	unicodeBidi: "unicode-bidi",
	unicodeRange: "unicode-range",
	unitsPerEm: "units-per-em",
	vAlphabetic: "v-alphabetic",
	vHanging: "v-hanging",
	vIdeographic: "v-ideographic",
	vMathematical: "v-mathematical",
	vectorEffect: "vector-effect",
	vertAdvY: "vert-adv-y",
	vertOriginX: "vert-origin-x",
	vertOriginY: "vert-origin-y",
	wordSpacing: "word-spacing",
	writingMode: "writing-mode",
	xmlnsXlink: "xmlns:xlink",
	xHeight: "x-height",
};
const namespaces: Readonly<Record<string, readonly [string, string]>> = {
	xlinkHref: ["http://www.w3.org/1999/xlink", "xlink:href"],
	xlinkActuate: ["http://www.w3.org/1999/xlink", "xlink:actuate"],
	xlinkArcrole: ["http://www.w3.org/1999/xlink", "xlink:arcrole"],
	xlinkRole: ["http://www.w3.org/1999/xlink", "xlink:role"],
	xlinkShow: ["http://www.w3.org/1999/xlink", "xlink:show"],
	xlinkTitle: ["http://www.w3.org/1999/xlink", "xlink:title"],
	xlinkType: ["http://www.w3.org/1999/xlink", "xlink:type"],
	xmlBase: ["http://www.w3.org/XML/1998/namespace", "xml:base"],
	xmlLang: ["http://www.w3.org/XML/1998/namespace", "xml:lang"],
	xmlSpace: ["http://www.w3.org/XML/1998/namespace", "xml:space"],
};
const nameOf = (field: string) => namespaces[field]?.[1] ?? aliases[field] ?? field;
const ownValue = (props: object | undefined, field: string): unknown =>
	props ? Object.getOwnPropertyDescriptor(props, field)?.value : undefined;

function nativeControl(element: Element): HTMLInputElement | HTMLTextAreaElement | undefined {
	if (element.namespaceURI !== "http://www.w3.org/1999/xhtml" || element.hasAttribute("is")) return;
	if (element.localName === "input" || element.localName === "textarea")
		return element as HTMLInputElement | HTMLTextAreaElement;
}
function controlProperty(element: Element, field: string) {
	if (element.namespaceURI !== "http://www.w3.org/1999/xhtml" || element.hasAttribute("is")) return;
	const prototypes: Readonly<Record<string, object>> = {
		input: HTMLInputElement.prototype,
		textarea: HTMLTextAreaElement.prototype,
		select: HTMLSelectElement.prototype,
		option: HTMLOptionElement.prototype,
		button: HTMLButtonElement.prototype,
		progress: HTMLProgressElement.prototype,
		meter: HTMLMeterElement.prototype,
		li: HTMLLIElement.prototype,
		param: HTMLParamElement.prototype,
		data: HTMLDataElement.prototype,
		output: HTMLOutputElement.prototype,
	};
	const prototype = prototypes[element.localName];
	if (!prototype || (field !== "value" && !(field === "defaultValue" && nativeControl(element)))) return;
	const descriptor = Object.getOwnPropertyDescriptor(prototype, field)!;
	return {
		read: (): string => String(descriptor.get!.call(element)),
		write: (value: string): void => {
			descriptor.set!.call(element, value);
		},
	};
}

export function renderedAttribute(element: Element, field: string): string {
	return controlProperty(element, field)?.read() ?? element.getAttribute(nameOf(field)) ?? "";
}
export function hasRenderedField(element: Element, field: string, committedProps: object | undefined): boolean {
	// value/defaultValue have no distinct native attribute. Presence comes only
	// from the actually committed host's own data prop, never a guessed DOM value.
	if (
		controlProperty(element, field) &&
		(nativeControl(element) || element.localName === "select" || element.localName === "output")
	)
		return ownValue(committedProps, field) !== undefined;
	return element.hasAttribute(nameOf(field));
}
export function previewAttribute(
	element: Element,
	field: string,
	value: string,
	committedProps: object | undefined,
): void {
	const property = controlProperty(element, field);
	if (property) {
		const control = nativeControl(element);
		if (!control) {
			if (property.read() !== value) property.write(value);
			return;
		}
		const focusedNumber =
			element.localName === "input" &&
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "type")!.get!.call(element) === "number" &&
			element.ownerDocument.activeElement === element;
		if (field === "defaultValue" && element.localName === "input") {
			// React's input value takes precedence over defaultValue. A focused
			// number input also delays defaultValue changes to preserve its draft.
			if (ownValue(committedProps, "value") != null || focusedNumber) return;
		}
		if (property.read() !== value) property.write(value);
		if (field === "value" && (element.localName === "input" || ownValue(committedProps, "defaultValue") == null)) {
			const fallback = controlProperty(element, "defaultValue")!;
			if (!focusedNumber && fallback.read() !== value) fallback.write(value);
		}
		return;
	}
	const namespace = namespaces[field];
	if (namespace) element.setAttributeNS(namespace[0], namespace[1], value);
	else element.setAttribute(nameOf(field), value);
}

export function captureAttribute(element: Element, field: string): () => void {
	const property = controlProperty(element, field);
	if (property && element.localName === "select") {
		const options = [...(element as HTMLSelectElement).options];
		const selected = Object.getOwnPropertyDescriptor(HTMLOptionElement.prototype, "selected")!;
		const values: boolean[] = options.map((option) => selected.get!.call(option));
		return () => {
			for (const [index, option] of options.entries()) selected.set!.call(option, values[index]);
		};
	}
	if (property && element.localName === "output") {
		const children = [...element.childNodes].map((node) => ({ node, value: node.nodeValue }));
		return () => {
			for (const child of children) child.node.nodeValue = child.value;
			element.replaceChildren(...children.map((child) => child.node));
		};
	}
	if (property && nativeControl(element)) {
		const current = controlProperty(element, "value")!,
			fallback = controlProperty(element, "defaultValue")!;
		const value = current.read(),
			defaultValue = fallback.read();
		const control = nativeControl(element)!;
		const prototype = element.localName === "input" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
		const selection = (name: string) => Object.getOwnPropertyDescriptor(prototype, name)!.get!.call(control);
		const start: number | null = selection("selectionStart"),
			end: number | null = selection("selectionEnd");
		const direction: "forward" | "backward" | "none" | null = selection("selectionDirection");
		const valueAttribute = element.getAttribute("value");
		return () => {
			if (fallback.read() !== defaultValue) fallback.write(defaultValue);
			if (element.localName === "input" && valueAttribute === null) element.removeAttribute("value");
			// A defaultValue preview owns only the reset value. Later native typing
			// is independent application state and must survive cancellation.
			if (field === "value" && current.read() !== value) {
				current.write(value);
				if (start !== null && end !== null)
					prototype.setSelectionRange.call(control, start, end, direction ?? undefined);
			}
		};
	}
	const original = element.getAttribute(nameOf(field));
	return () => {
		if (original !== null) {
			const namespace = namespaces[field];
			if (namespace) element.setAttributeNS(namespace[0], namespace[1], original);
			else element.setAttribute(nameOf(field), original);
		} else {
			const namespace = namespaces[field];
			if (namespace) element.removeAttributeNS(namespace[0], namespace[1].split(":")[1]!);
			else element.removeAttribute(nameOf(field));
		}
	};
}
