// Disposable per-field evidence. React objects are only keys in side tables.
// Data descriptors avoid invoking application getters while taking a read.
export interface ValueElement {
	props: unknown;
	type: unknown;
	key?: unknown;
}
export interface FieldOrigin {
	kind: "jsx" | "clone" | "create" | "key" | "unknown";
	source: string;
	field: string;
	slot: "prop" | "key" | "type";
	element: number;
	via: { kind: string; source: string; element: number; replaced: boolean }[];
}
export interface ValueSnapshot {
	id: number;
	source: string;
	kind: FieldOrigin["kind"];
	base?: number;
	type: { value: unknown; origin: FieldOrigin };
	key: { value: unknown; origin: FieldOrigin };
	fields: Record<string, { value: unknown; origin: FieldOrigin }>;
}
export interface ValueFlow {
	at<T>(source: string, action: () => T): T;
	remap(source: string): string;
	jsx(element: ValueElement, source: string): void;
	created(
		element: ValueElement,
		kind: "clone" | "create" | "key",
		base?: ValueElement,
		replaced?: string[],
		keyReplaced?: boolean,
	): ValueElement;
	snapshot(element: ValueElement | undefined): ValueSnapshot | undefined;
	fromProps(props: unknown): ValueElement | undefined;
	transports(parent: ValueElement, child: ValueElement): string[];
}
declare global {
	var __handValues: ValueFlow | undefined;
}
export function installValueFlow(mapping: Record<string, string>): void {
	interface RecordValue {
		element: ValueElement;
		source: string;
		kind: FieldOrigin["kind"];
		base?: ValueElement | undefined;
		replaced: string[];
		keyReplaced: boolean;
		id: number;
	}
	const records = new WeakMap<object, RecordValue>();
	const props = new WeakMap<object, ValueElement>();
	const identities = new WeakMap<object, number>();
	let serial = 0;
	let active = "";
	const id = (object: object) => {
		let held = identities.get(object);
		if (!held) {
			held = ++serial;
			identities.set(object, held);
		}
		return held;
	};
	const own = (object: unknown, key: string): unknown =>
		object !== null && typeof object === "object" ? Object.getOwnPropertyDescriptor(object, key)?.value : undefined;
	const remember = (
		element: ValueElement,
		source: string,
		kind: RecordValue["kind"],
		base?: ValueElement,
		replaced: string[] = [],
		keyReplaced = false,
	) => {
		records.set(element, { element, source, kind, base, replaced, keyReplaced, id: id(element) });
		// A key-only copy shares props. Preserve their original creation record.
		if (element.props !== null && typeof element.props === "object" && !props.has(element.props))
			props.set(element.props, element);
	};
	const origin = (element: ValueElement, field: string, slot: FieldOrigin["slot"] = "prop"): FieldOrigin => {
		const value = records.get(element);
		if (!value) return { kind: "unknown", source: "", field, slot, element: id(element), via: [] };
		const replaced = slot === "key" ? value.keyReplaced : slot === "prop" && value.replaced.includes(field);
		if (value.base && !replaced) {
			const from = origin(value.base, field, slot);
			return {
				...from,
				via: [...from.via, { kind: value.kind, source: value.source, element: value.id, replaced: false }],
			};
		}
		return {
			kind: value.kind,
			source: value.source,
			field,
			slot,
			element: value.id,
			via: [{ kind: value.kind, source: value.source, element: value.id, replaced }],
		};
	};
	const atom = (value: unknown): unknown => {
		if (value === undefined) return { kind: "undefined" };
		if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number")
			return value;
		if (typeof value === "object" || typeof value === "function")
			return { kind: records.has(value) ? "element" : typeof value, id: id(value) };
		return { kind: typeof value };
	};
	globalThis.__handValues = {
		at(source, action) {
			const before = active;
			active = source;
			try {
				return action();
			} finally {
				active = before;
			}
		},
		remap(source) {
			return mapping[source] ?? source;
		},
		jsx(element, source) {
			remember(element, source, "jsx");
		},
		created(element, kind, base, replaced = [], keyReplaced = false) {
			remember(element, active, kind, base, replaced, keyReplaced);
			if (active) globalThis.__handObserver?.register(element, active);
			return element;
		},
		transports(parent, child) {
			const matches = (input: unknown): boolean => {
				const copies: ValueElement[] = [child];
				for (let at = records.get(child)?.base; at; at = records.get(at)?.base) copies.push(at);
				if (copies.includes(input as ValueElement)) return true;
				if (Array.isArray(input))
					return Object.values(Object.getOwnPropertyDescriptors(input)).some(
						(desc) => "value" in desc && copies.includes(desc.value),
					);
				return false;
			};
			return Object.entries(Object.getOwnPropertyDescriptors(parent.props ?? {}))
				.filter(([, desc]) => "value" in desc && matches(desc.value))
				.map(([key]) => key);
		},
		fromProps(value) {
			return value !== null && typeof value === "object" ? props.get(value) : undefined;
		},
		snapshot(element) {
			if (!element) return undefined;
			const value = records.get(element);
			const fields: ValueSnapshot["fields"] = {};
			for (const name of Object.keys(Object.getOwnPropertyDescriptors(element.props ?? {}))) {
				fields[name] = { value: atom(own(element.props, name)), origin: origin(element, name) };
			}
			return {
				id: id(element),
				source: value?.source ?? "",
				kind: value?.kind ?? "unknown",
				...(value?.base ? { base: id(value.base) } : {}),
				type: { value: atom(own(element, "type")), origin: origin(element, "type", "type") },
				key: { value: atom(own(element, "key")), origin: origin(element, "key", "key") },
				fields,
			};
		},
	};
}
