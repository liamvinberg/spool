import { installConsumed } from "./source-consumed";
import { installLazyWitness, type LazyChoice } from "./source-lazy";
import type { CacheEvent, ValueSnapshot } from "./source-values";

// Committed element adapter for the pinned React 19.2.7 renderer. This uses private
// Fiber fields behind the DevTools hook; upgrades require replaying the committed-origin contract.
// Neither the hook nor the observer writes to React elements, props or Fibers.
interface Fiber {
	tag: number;
	type: unknown;
	elementType: unknown;
	memoizedProps: unknown;
	pendingProps: unknown;
	stateNode: unknown;
	child: Fiber | null;
	sibling: Fiber | null;
	return: Fiber | null;
	alternate: Fiber | null;
}
interface Authored {
	source: string;
	type: unknown;
	entry: boolean;
	element: { props: unknown; type: unknown };
	id: number;
}
export interface Invocation {
	id: number;
	reads: CacheEvent[];
	input: ValueSnapshot | undefined;
}
export interface Observation {
	occurrence: string;
	source: string;
	element?: number;
	values?: ValueSnapshot | undefined;
	chain: {
		source: string;
		occurrence: string;
		passedChild?: boolean;
		lazyResolved?: boolean;
		lazyChoice?: LazyChoice;
		element?: number;
		invocation?: Invocation | undefined;
		retainedProps?: boolean;
		renderedSource?: string;
		values?: ValueSnapshot | undefined;
		renderedValues?: ValueSnapshot | undefined;
		transportedFields?: string[];
	}[];
	refusal?: string;
}
export interface Observer {
	commit(root: Fiber): void;
	register(element: { props: unknown; type: unknown }, source: string, entry?: boolean): void;
	observe(node: Element): Observation;
	node(occurrence: string): Element | undefined;
	commits: number;
	failure: string | null;
}
declare global {
	var __SPOOL_OBSERVER__: Observer;
	var __SPOOL_RECONCILE__: {
		invoke<T>(fiber: Fiber, props: unknown, action: () => T): T;
		bind(fiber: Fiber, element: Authored["element"]): void;
		copy(current: Fiber | null, work: Fiber): void;
	};
}

export function installObserver(reconciled = true, lazyChoices = true): void {
	if (lazyChoices) {
		installLazyWitness();
		installConsumed();
	}
	const global = globalThis as typeof globalThis & { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown };
	const elements = new WeakMap<object, Authored>();
	const bindings = new WeakMap<Fiber, Authored["element"]>();
	const invocations = new WeakMap<Fiber, Invocation>();
	let invocationSerial = 0;
	// Speculation writes only a side table. Only the commit walk publishes picks.
	global.__SPOOL_RECONCILE__ = {
		invoke(fiber, props, action) {
			const id = ++invocationSerial;
			const start = globalThis.__SPOOL_VALUES__?.cacheEvents().length ?? 0;
			const input = globalThis.__SPOOL_VALUES__?.snapshot(globalThis.__SPOOL_VALUES__.fromProps(props));
			const value = action();
			invocations.set(fiber, {
				id,
				input,
				reads:
					globalThis.__SPOOL_VALUES__
						?.cacheEvents()
						.slice(start)
						.filter((e) => e.kind === "read") ?? [],
			});
			return value;
		},
		bind(fiber, element) {
			bindings.set(fiber, element);
		},
		copy(current, work) {
			const invocation = current ? invocations.get(current) : undefined;
			if (invocation) invocations.set(work, invocation);
			else invocations.delete(work);
			const held = current ? bindings.get(current) : undefined;
			if (held) bindings.set(work, held);
			else bindings.delete(work);
		},
	};
	if (global.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
		global.__SPOOL_OBSERVER__ = {
			commit() {},
			commits: 0,
			failure: "existing DevTools hook integration is unproven",
			register() {},
			node() {
				return undefined;
			},
			observe() {
				throw new Error(this.failure!);
			},
		};
		return;
	}
	const authored = new WeakMap<object, Authored>();
	const ids = new WeakMap<Fiber, string>();
	const roots = new Map<unknown, { current: Fiber }>();
	let hosts = new WeakMap<Element, Observation>();
	let nodes = new Map<string, Element>();
	let next = 0;
	let nextElement = 0;
	const identity = (fiber: Fiber): string => {
		const held = ids.get(fiber) ?? (fiber.alternate ? ids.get(fiber.alternate) : undefined) ?? `mounted-${++next}`;
		ids.set(fiber, held);
		if (fiber.alternate) ids.set(fiber.alternate, held);
		return held;
	};
	const record = (props: unknown) => (props !== null && typeof props === "object" ? authored.get(props) : undefined);
	const at = (fiber: Fiber): Authored => {
		if (reconciled) {
			const element = bindings.get(fiber);
			const value = element ? elements.get(element) : undefined;
			if (!value) throw new Error("reconciled element has no observed creation source; value origin is unproven");
			if (value.type !== fiber.elementType && value.type !== fiber.type)
				throw new Error("reconciled element type relationship is unproven");
			return value;
		}
		const value = record(fiber.memoizedProps);
		const pending = record(fiber.pendingProps);
		if (!value || !pending) throw new Error("unobserved or cloned component props");
		if (value.source !== pending.source || value.type !== pending.type)
			throw new Error("memoized and incoming source relationships disagree");
		if (value.type !== fiber.elementType && value.type !== fiber.type)
			throw new Error("element type relationship is unproven");
		return value;
	};
	const lazyResolved = (fiber: Fiber, value: Authored): { lazyResolved: boolean; lazyChoice?: LazyChoice } => {
		if (value.type === null || typeof value.type !== "object") return { lazyResolved: false };
		const own = (object: object, key: string): unknown => Object.getOwnPropertyDescriptor(object, key)?.value;
		if (own(value.type, "$$typeof") !== Symbol.for("react.lazy")) return { lazyResolved: false };
		const payload = own(value.type, "_payload");
		if (!payload || typeof payload !== "object" || own(payload, "_status") !== 1)
			throw new Error("lazy payload is not resolved in the committed tree");
		const resolved = own(payload, "_result");
		if (lazyChoices) {
			if (!resolved || typeof resolved !== "object" || value.type !== fiber.elementType)
				throw new Error("lazy export and committed definition disagree");
			return {
				lazyResolved: true,
				lazyChoice:
					reconciled && Reflect.get(globalThis, "__SPOOL_CONSUMED_ENABLED__")
						? {
								...globalThis.__SPOOL_LAZY__.choiceLoader(value.type),
								...globalThis.__SPOOL_CONSUMED__.choice(fiber).origin,
								consumedRead: {
									id: globalThis.__SPOOL_CONSUMED__.choice(fiber).id,
									initialization: globalThis.__SPOOL_CONSUMED__.choice(fiber).initialization,
									attempt: globalThis.__SPOOL_CONSUMED__.choice(fiber).attempt,
								},
							}
						: globalThis.__SPOOL_LAZY__.choice(value.type, resolved, fiber.type),
			};
		}
		// The pinned renderer stores resolveLazy(elementType) in Fiber.type.
		// Never re-read a namespace getter: doing so would execute application
		// code outside React. Data properties can additionally be checked here.
		const exported =
			resolved && typeof resolved === "object" ? Object.getOwnPropertyDescriptor(resolved, "default") : undefined;
		if (
			!resolved ||
			typeof resolved !== "object" ||
			!exported ||
			("value" in exported && exported.value !== fiber.type) ||
			value.type !== fiber.elementType
		)
			throw new Error("lazy export and committed definition disagree");
		return { lazyResolved: true };
	};
	const observe = (fiber: Fiber, parents: readonly Fiber[]): Observation => {
		const result: Observation = { occurrence: identity(fiber), source: "", chain: [] };
		try {
			result.source = at(fiber).source;
			if (reconciled) result.element = at(fiber).id;
			if (globalThis.__SPOOL_VALUES__) result.values = globalThis.__SPOOL_VALUES__.snapshot(at(fiber).element);
			let child = at(fiber);
			const chain: Observation["chain"] = [];
			let foundEntry = false;
			if (!reconciled && parents.some((parent) => [14, 15].includes(parent.tag)))
				throw new Error("memo source continuity is unproven across equal-prop bailouts");
			for (const parent of [...parents].reverse()) {
				// Host/text/root, fragments, mode, context, profiler, suspense,
				// offscreen and host resource nodes are not authored component calls.
				if ([3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 19, 22, 26, 27].includes(parent.tag)) continue;
				if (![0, 1, 11, 14, 15, 16].includes(parent.tag)) throw new Error(`unproven React fiber tag ${parent.tag}`);
				// Custom memo creates an internal component Fiber without a JSX
				// element. Prove that specific renderer edge, not a missing call.
				const above = parents[parents.indexOf(parent) - 1];
				if (
					reconciled &&
					!bindings.has(parent) &&
					above?.tag === 14 &&
					above.child === parent &&
					above.type !== null &&
					typeof above.type === "object" &&
					Reflect.get(above.type, "type") === parent.elementType
				)
					continue;
				const value = at(parent);
				if (value.entry) {
					foundEntry = true;
					continue;
				}
				const children = Reflect.get(value.element.props as object, "children") as unknown;
				chain.push({
					source: value.source,
					invocation: invocations.get(parent.tag === 14 && parent.child ? parent.child : parent),
					...lazyResolved(parent, value),
					occurrence: identity(parent),
					passedChild: children === child.element || (Array.isArray(children) && children.includes(child.element)),
					...(reconciled
						? {
								element: value.id,
								...(globalThis.__SPOOL_VALUES__
									? {
											values: globalThis.__SPOOL_VALUES__.snapshot(value.element),
											transportedFields: globalThis.__SPOOL_VALUES__.transports(
												value.element,
												child.element,
											),
											renderedValues: globalThis.__SPOOL_VALUES__.snapshot(
												globalThis.__SPOOL_VALUES__.fromProps(
													parent.tag === 14 ? parent.child?.memoizedProps : parent.memoizedProps,
												),
											),
										}
									: {}),
								retainedProps:
									[14, 15].includes(parent.tag) &&
									(parent.tag === 14 ? parent.child?.memoizedProps : parent.memoizedProps) !==
										value.element.props,
								renderedSource:
									record(parent.tag === 14 ? parent.child?.memoizedProps : parent.memoizedProps)?.source ??
									"unobserved render props",
							}
						: {}),
				});
				child = value;
			}
			if (!foundEntry) throw new Error("mounted ancestry does not reach the compiled entry");
			result.chain = chain.reverse();
		} catch (error) {
			result.refusal = error instanceof Error ? error.message : String(error);
		}
		return result;
	};
	global.__SPOOL_OBSERVER__ = {
		commit() {},
		commits: 0,
		failure: null,
		register(element, source, entry = false) {
			if (element.props === null || typeof element.props !== "object") {
				this.failure = "unexpected React props shape";
				return;
			}
			const value = { source, type: element.type, entry, element, id: ++nextElement };
			authored.set(element.props, value);
			elements.set(element, value);
		},
		observe(node) {
			if (this.failure) throw new Error(this.failure);
			const result = hosts.get(node);
			if (!result || !node.isConnected) throw new Error("not a committed observed host");
			return JSON.parse(
				JSON.stringify(result, (key, value: unknown) =>
					(key === "source" || key === "renderedSource") && typeof value === "string"
						? (globalThis.__SPOOL_VALUES__?.remap(value) ?? value)
						: value,
				),
			) as Observation;
		},
		node(occurrence) {
			return nodes.get(occurrence);
		},
	};
	global.__SPOOL_OBSERVER__.commit = (current: Fiber) => {
		const root = { current };
		if (global.__SPOOL_OBSERVER__.failure) return;
		try {
			roots.set(root.current.stateNode, root);
			hosts = new WeakMap();
			nodes = new Map();
			const walk = (fiber: Fiber | null, parents: readonly Fiber[]): void => {
				if (!fiber) return;
				if (fiber.stateNode instanceof Element && [5, 26, 27].includes(fiber.tag)) {
					const observation = observe(fiber, parents);
					hosts.set(fiber.stateNode, observation);
					if (!observation.refusal && observation.source)
						fiber.stateNode.setAttribute(
							"data-spool-source",
							globalThis.__SPOOL_VALUES__?.remap(observation.source) ?? observation.source,
						);
					nodes.set(observation.occurrence, fiber.stateNode);
				}
				walk(fiber.child, [...parents, fiber]);
				walk(fiber.sibling, parents);
			};
			for (const current of roots.values()) {
				walk(current.current, []);
				if (!current.current.child) roots.delete(current.current.stateNode);
			}
			global.__SPOOL_OBSERVER__.commits++;
		} catch (error) {
			global.__SPOOL_OBSERVER__.failure = `observer failed: ${String(error)}`;
		}
	};
}
