import type { LazyOrigin } from "./source-lazy";

type Member = { value: unknown; origin: LazyOrigin | undefined };
type Fiber = object;
interface Receipt {
	initialization: number;
	attempt: number;
	id: number;
	value: unknown;
	origin: LazyOrigin | undefined;
}
export function installConsumed() {
	let fields = new WeakMap<object, Map<PropertyKey, Member>>();
	const forwarding = new WeakMap<object, object>();
	const receipts = new WeakMap<Fiber, Receipt>();
	let active: { returned?: Member } | undefined;
	let serial = 0;
	let initialization = 0;
	const attempts = new WeakMap<object, { initialization: number; attempt: number }>();
	let last: Receipt | undefined;
	const builtinGet = Reflect.get;
	const api = {
		reflect(receiver: { get: (...args: unknown[]) => unknown }) {
			const get = receiver.get;
			return (...args: unknown[]): Member => {
				if (get === builtinGet && (args.length === 2 || args.length === 3))
					return api.member(
						args[0] as Record<PropertyKey, unknown>,
						args[1] as PropertyKey,
						args.length === 3 ? args[2] : args[0],
					);
				return { value: Reflect.apply(get, receiver, args), origin: undefined };
			};
		},
		member(object: Record<PropertyKey, unknown>, key: PropertyKey, receiver: unknown = object): Member {
			const parent = active;
			const scope: { returned?: Member } = {};
			active = scope;
			try {
				const target = object === null || object === undefined ? object : Object(object);
				const value = Reflect.get(target, key, receiver);
				const returned = scope.returned;
				const field = fields.get(forwarding.get(object) ?? object)?.get(key);
				const known = globalThis.__SPOOL_LAZY__.origin(object, key, value);
				return {
					value,
					origin:
						returned && returned.value === value
							? returned.origin
							: (known ?? (field && field.value === value ? field.origin : undefined)),
				};
			} finally {
				active = parent;
			}
		},
		proxy(ctor: ProxyConstructor, target: object, handler: ProxyHandler<object>, transparent: boolean) {
			const proxy = new ctor(target, handler);
			if (transparent) forwarding.set(proxy, target);
			return proxy;
		},
		opaque() {
			fields = new WeakMap();
		},
		escape<T>(value: T): T {
			if (value && (typeof value === "object" || typeof value === "function")) fields.delete(value);
			return value;
		},
		returned(member: Member) {
			if (active) active.returned = member;
			return member.value;
		},
		write(object: Record<PropertyKey, unknown>, key: PropertyKey, member: Member) {
			object[key] = member.value;
			const map = fields.get(object);
			if (map) map.set(key, member);
			return member.value;
		},
		object(member: Member) {
			const object = { default: member.value };
			fields.set(object, new Map([["default", member]]));
			return object;
		},
		copy(input: unknown) {
			if (input === null || input === undefined) return {};
			const source = Object(input) as Record<PropertyKey, unknown>;
			const value: Record<PropertyKey, unknown> = {};
			const held = new Map<PropertyKey, Member>();
			for (const key of Reflect.ownKeys(source)) {
				const descriptor = Reflect.getOwnPropertyDescriptor(source, key);
				if (descriptor?.enumerable) {
					const field = api.member(source, key);
					Object.defineProperty(value, key, {
						value: field.value,
						writable: true,
						enumerable: true,
						configurable: true,
					});
					held.set(key, field);
				}
			}
			fields.set(value, held);
			return value;
		},
		begin(payload: object) {
			last = undefined;
			const previous = attempts.get(payload);
			attempts.set(payload, {
				initialization: previous?.initialization ?? ++initialization,
				attempt: (previous?.attempt ?? 0) + 1,
			});
		},
		consume(object: Record<PropertyKey, unknown>, payload: object) {
			const member = api.member(object, "default");
			last = { id: ++serial, ...attempts.get(payload)!, ...member };
			return member.value;
		},
		bind(fiber: Fiber) {
			if (last) receipts.set(fiber, last);
			else receipts.delete(fiber);
			last = undefined;
		},
		copyFiber(current: Fiber | null, work: Fiber) {
			const receipt = current && receipts.get(current);
			if (receipt) receipts.set(work, receipt);
			else receipts.delete(work);
		},
		choice(fiber: Fiber) {
			const receipt = receipts.get(fiber);
			if (!receipt?.origin) throw new Error("consumed lazy read has no admitted executed export origin");
			return { ...receipt, origin: receipt.origin };
		},
	};
	globalThis.__SPOOL_CONSUMED__ = api;
}
declare global {
	var __SPOOL_CONSUMED__: {
		opaque(): void;
		escape<T>(value: T): T;
		proxy(ctor: ProxyConstructor, target: object, handler: ProxyHandler<object>, transparent: boolean): object;
		member(object: Record<PropertyKey, unknown>, key: PropertyKey, receiver?: unknown): Member;
		returned(member: Member): unknown;
		write(object: Record<PropertyKey, unknown>, key: PropertyKey, member: Member): unknown;
		object(member: Member): { default: unknown };
		copy(source: Record<PropertyKey, unknown>): Record<PropertyKey, unknown>;
		begin(payload: object): void;
		consume(object: Record<PropertyKey, unknown>, payload: object): unknown;
		bind(fiber: object): void;
		copyFiber(current: object | null, work: object): void;
		choice(fiber: object): Receipt & { origin: LazyOrigin };
	};
}
