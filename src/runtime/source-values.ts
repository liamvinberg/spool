// Committed per-field evidence. React objects are only keys in side tables.
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
	typeInput?: number;
	type: { value: unknown; origin: FieldOrigin };
	key: { value: unknown; origin: FieldOrigin };
	fields: Record<string, { value: unknown; origin: FieldOrigin }>;
}
export interface CacheEvent {
	sequence: number;
	source: string;
	key: string;
	kind: "assignment" | "read";
	value: unknown;
	matchingAssignment?: number;
	// Only instrumented stores are counted. This is not a continuity lease.
	revision: number;
	rhsEvaluated?: boolean;
}
export interface ValueFlow {
	styleLiteral<T extends object>(value: T): T;
	cacheInput<T>(value: T): T;
	cacheAssign<T>(source: string, key: string, action: () => T): T;
	cacheRead<T>(source: string, key: string, value: T): T;
	cacheEvents(): CacheEvent[];
	at<T>(source: string, action: () => T): T;
	remap(source: string): string;
	typeFrom(element: ValueElement): unknown;
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
	transports(parent: ValueElement, child: ValueElement, includeCopies?: boolean): string[];
}
declare global {
	var __SPOOL_VALUES__: ValueFlow | undefined;
}
export function installValueFlow(mapping: Record<string, string>): void {
	interface RecordValue {
		element: ValueElement;
		source: string;
		kind: FieldOrigin["kind"];
		base?: ValueElement | undefined;
		typeInput?: ValueElement | undefined;
		replaced: string[];
		keyReplaced: boolean;
		id: number;
	}
	const records = new WeakMap<object, RecordValue>();
	const literalStyles = new WeakSet<object>();
	const props = new WeakMap<object, ValueElement>();
	const identities = new WeakMap<object, number>();
	let serial = 0;
	let cacheRhs = false;
	const cacheEvents: CacheEvent[] = [];
	const cacheWrites = new Map<string, { sequence: number; revision: number; value: unknown }>();
	let active = "";
	let typeInput: ValueElement | undefined;
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
		records.set(element, {
			element,
			source,
			kind,
			base,
			typeInput: kind === "create" ? typeInput : undefined,
			replaced,
			keyReplaced,
			id: id(element),
		});
		// A key-only copy shares props. Preserve their original creation record.
		if (element.props !== null && typeof element.props === "object" && !props.has(element.props))
			props.set(element.props, element);
	};
	const origin = (element: ValueElement, field: string, slot: FieldOrigin["slot"] = "prop"): FieldOrigin => {
		const value = records.get(element);
		if (!value) return { kind: "unknown", source: "", field, slot, element: id(element), via: [] };
		if (slot === "type" && value.typeInput) {
			const from = origin(value.typeInput, field, slot);
			return {
				...from,
				via: [...from.via, { kind: "type", source: value.source, element: value.id, replaced: false }],
			};
		}
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
	globalThis.__SPOOL_VALUES__ = {
		styleLiteral(value) {
			literalStyles.add(value);
			return value;
		},
		cacheInput(value) {
			cacheRhs = true;
			return value;
		},
		cacheAssign(source, key, action) {
			const before = cacheRhs;
			cacheRhs = false;
			try {
				const value = action();
				const sequence = cacheEvents.length + 1;
				const previous = cacheWrites.get(key);
				const revision = (previous?.revision ?? 0) + (cacheRhs ? 1 : 0);
				if (cacheRhs) cacheWrites.set(key, { sequence, revision, value });
				cacheEvents.push({
					sequence,
					source,
					key,
					kind: "assignment",
					value: atom(value),
					revision,
					rhsEvaluated: cacheRhs,
				});
				return value;
			} finally {
				cacheRhs = before;
			}
		},
		cacheRead(source, key, value) {
			const write = cacheWrites.get(key);
			cacheEvents.push({
				sequence: cacheEvents.length + 1,
				source,
				key,
				kind: "read",
				value: atom(value),
				revision: write?.revision ?? 0,
				...(write?.value === value ? { matchingAssignment: write.sequence } : {}),
			});
			return value;
		},
		cacheEvents() {
			return cacheEvents.map((event) => ({ ...event }));
		},
		at(source, action) {
			const before = active;
			const beforeType = typeInput;
			typeInput = undefined;
			active = source;
			try {
				return action();
			} finally {
				active = before;
				typeInput = beforeType;
			}
		},
		typeFrom(element) {
			const type = element.type;
			typeInput = element;
			return type;
		},
		remap(source) {
			return mapping[source] ?? source;
		},
		jsx(element, source) {
			remember(element, source, "jsx");
		},
		created(element, kind, base, replaced = [], keyReplaced = false) {
			remember(element, active, kind, base, replaced, keyReplaced);
			if (active) globalThis.__SPOOL_OBSERVER__?.register(element, active);
			return element;
		},
		transports(parent, child, includeCopies = true) {
			const matches = (input: unknown): boolean => {
				const copies: ValueElement[] = [child];
				const typeBase = records.get(child)?.typeInput;
				if (includeCopies) {
					if (typeBase) copies.push(typeBase);
					for (let at = records.get(child)?.base; at; at = records.get(at)?.base) copies.push(at);
				}
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
				fields[name] = {
					value:
						name === "style" && literalStyles.has(own(element.props, name) as object)
							? {
									kind: "style-members",
									identity: atom(own(element.props, name)),
									members: Object.entries(Object.getOwnPropertyDescriptors(own(element.props, name))).map(
										([key, desc]) => ({
											key,
											value: "value" in desc ? atom(desc.value) : { kind: "accessor" },
											enumerable: desc.enumerable,
										}),
									),
								}
							: atom(own(element.props, name)),
					origin: origin(element, name),
				};
			}
			return {
				id: id(element),
				source: value?.source ?? "",
				kind: value?.kind ?? "unknown",
				...(value?.base ? { base: id(value.base) } : {}),
				...(value?.typeInput ? { typeInput: id(value.typeInput) } : {}),
				type: { value: atom(own(element, "type")), origin: origin(element, "type", "type") },
				key: { value: atom(own(element, "key")), origin: origin(element, "key", "key") },
				fields,
			};
		},
	};
}
