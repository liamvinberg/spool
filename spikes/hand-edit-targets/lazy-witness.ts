// Disposable value-origin records. Registration never reads module exports.
// member replaces the application's one property access, with its receiver.
export interface LazyOrigin {
	module: string;
	export: string;
	via: "namespace" | "projection";
}
export interface LazyChoice extends LazyOrigin {
	loader: { file: string; start: number; end: number };
}
interface Member {
	value: unknown;
	origin: LazyOrigin | undefined;
}
interface Witness {
	namespace(value: object, file: string): void;
	member(namespace: Record<string, unknown>, key: string): Member;
	project(member: Member): { default: unknown };
	copy(source: Record<string, unknown>): Record<string, unknown>;
	replace(target: { default: unknown }, member: Member): unknown;
	created<T extends object>(value: T, loader: LazyChoice["loader"]): T;
	choice(lazy: object, result: object, committed: unknown): LazyChoice;
}
declare global {
	var __handLazy: Witness;
}

export function installLazyWitness(): void {
	const namespaces = new WeakMap<object, { file: string; descriptors: PropertyDescriptorMap }>();
	const projections = new WeakMap<object, Member>();
	const loaders = new WeakMap<object, LazyChoice["loader"]>();
	const unchanged = (value: object, key: string, held: PropertyDescriptor | undefined) => {
		const current = Object.getOwnPropertyDescriptor(value, key);
		return (
			!!held &&
			!!current &&
			["get", "set", "value", "writable", "enumerable", "configurable"].every(
				(key) => Reflect.get(held, key) === Reflect.get(current, key),
			)
		);
	};
	globalThis.__handLazy = {
		namespace(value, file) {
			const held = namespaces.get(value);
			if (held && held.file !== file) throw new Error("compiler merged distinct module namespace identities");
			namespaces.set(value, { file, descriptors: Object.getOwnPropertyDescriptors(value) });
		},
		member(namespace, key) {
			const value: unknown = namespace[key];
			const held = namespaces.get(namespace);
			const projection = projections.get(namespace);
			return {
				value,
				origin:
					held && unchanged(namespace, key, held.descriptors[key])
						? { module: held.file, export: key, via: "projection" }
						: key === "default" && projection && value === projection.value
							? projection.origin
							: undefined,
			};
		},
		project(member) {
			const value = { default: member.value };
			projections.set(value, member);
			return value;
		},
		copy(source) {
			// Spread performs exactly the application's own enumeration and reads.
			// Only registered sources are inspected beyond the original spread.
			const value = { ...source };
			const namespace = namespaces.get(source),
				projection = projections.get(source);
			const origin =
				namespace && unchanged(source, "default", namespace.descriptors.default)
					? { module: namespace.file, export: "default", via: "projection" as const }
					: projection?.origin;
			// Promise resolution calls an authored `then` with this object as
			// its receiver. That is an escape, even without an explicit call in
			// the loader, so subsequent replacements cannot restore a witness.
			if (typeof Object.getOwnPropertyDescriptor(value, "then")?.value !== "function")
				projections.set(value, { value: value.default, origin });
			return value;
		},
		replace(target, member) {
			target.default = member.value;
			if (projections.has(target)) projections.set(target, member);
			return member.value;
		},
		created(value, loader) {
			loaders.set(value, loader);
			return value;
		},
		choice(lazy, result, committed) {
			const loader = loaders.get(lazy);
			if (!loader) throw new Error("lazy loader result flow has no compiler witness");
			const namespace = namespaces.get(result);
			if (namespace && unchanged(result, "default", namespace.descriptors.default))
				return { loader, module: namespace.file, export: "default", via: "namespace" };
			const projection = projections.get(result);
			// Unknown objects can be proxies. Do not probe descriptors or getters
			// on application-owned result objects merely to reject them.
			if (!projection?.origin) throw new Error("lazy resolved default has no preserved executed module/export origin");
			const property = Object.getOwnPropertyDescriptor(result, "default");
			if (!property || !("value" in property) || property.value !== projection.value || property.value !== committed)
				throw new Error("lazy resolved default has no preserved executed module/export origin");
			return { loader, ...projection.origin };
		},
	};
}
