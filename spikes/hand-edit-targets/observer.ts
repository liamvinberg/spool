// Disposable adapter for the pinned React 19.2.7 renderer. This uses private
// Fiber fields behind the DevTools hook; it is evidence, not a stable React API.
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
export interface Observation {
	occurrence: string;
	source: string;
	element?: number;
	chain: {
		source: string;
		occurrence: string;
		passedChild?: boolean;
		element?: number;
		retainedProps?: boolean;
		renderedSource?: string;
	}[];
	refusal?: string;
}
export interface Observer {
	register(element: { props: unknown; type: unknown }, source: string, entry?: boolean): void;
	observe(node: Element): Observation;
	node(occurrence: string): Element | undefined;
	commits: number;
	failure: string | null;
}
declare global {
	var __handObserver: Observer;
	var __handReconcile: {
		bind(fiber: Fiber, element: Authored["element"]): void;
		copy(current: Fiber | null, work: Fiber): void;
	};
}

export function installObserver(reconciled = false): void {
	const global = globalThis as typeof globalThis & { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown };
	const elements = new WeakMap<object, Authored>();
	const bindings = new WeakMap<Fiber, Authored["element"]>();
	// Speculation writes only a side table. Only the commit walk publishes picks.
	global.__handReconcile = {
		bind(fiber, element) {
			bindings.set(fiber, element);
		},
		copy(current, work) {
			const held = current ? bindings.get(current) : undefined;
			if (held) bindings.set(work, held);
			else bindings.delete(work);
		},
	};
	if (global.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
		global.__handObserver = {
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
	const roots = new Set<{ current: Fiber }>();
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
	const observe = (fiber: Fiber, parents: readonly Fiber[]): Observation => {
		const result: Observation = { occurrence: identity(fiber), source: "", chain: [] };
		try {
			result.source = at(fiber).source;
			if (reconciled) result.element = at(fiber).id;
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
					occurrence: identity(parent),
					passedChild: children === child.element || (Array.isArray(children) && children.includes(child.element)),
					...(reconciled
						? {
								element: value.id,
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
	global.__handObserver = {
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
			return result;
		},
		node(occurrence) {
			return nodes.get(occurrence);
		},
	};
	global.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
		supportsFiber: true,
		inject(renderer: {
			version?: string;
			rendererPackageName?: string;
			bundleType?: number;
			reconcilerVersion?: string;
		}) {
			if (
				renderer.version !== "19.2.7" ||
				renderer.reconcilerVersion !== "19.2.7" ||
				renderer.rendererPackageName !== "react-dom" ||
				renderer.bundleType !== 0
			)
				global.__handObserver.failure = "only React DOM 19.2.7 production is pinned by this observer";
			return 1;
		},
		onCommitFiberRoot(_renderer: number, root: { current: Fiber }) {
			if (global.__handObserver.failure) return;
			try {
				roots.add(root);
				hosts = new WeakMap();
				nodes = new Map();
				const walk = (fiber: Fiber | null, parents: readonly Fiber[]): void => {
					if (!fiber) return;
					if (fiber.stateNode instanceof Element && [5, 26, 27].includes(fiber.tag)) {
						const observation = observe(fiber, parents);
						hosts.set(fiber.stateNode, observation);
						nodes.set(observation.occurrence, fiber.stateNode);
					}
					walk(fiber.child, [...parents, fiber]);
					walk(fiber.sibling, parents);
				};
				for (const current of roots) {
					walk(current.current, []);
					if (!current.current.child) roots.delete(current);
				}
				global.__handObserver.commits++;
			} catch (error) {
				global.__handObserver.failure = `observer failed: ${String(error)}`;
			}
		},
		onCommitFiberUnmount() {},
	};
}
