import { Fragment, jsx, jsxs } from "react/jsx-runtime";

/**
 * The stamping JSX runtime (#23): frames compile with jsxDev pointed here
 * (jsxImportSource "spool"), so every intrinsic element carries its exact
 * compile-time source location as data-spool-source — the element picker's
 * truth (#6, Onlook pattern), never written into files on disk. Components
 * pass through unstamped: their DOM stamps where it is authored, which may
 * be shared/ui — exactly the file an agent should edit. React itself stays
 * the pinned production build; only the source triple is harvested here.
 */

interface JsxSource {
	fileName: string;
	lineNumber: number;
	columnNumber: number;
}

export { Fragment };

export function jsxDEV(
	type: unknown,
	props: Record<string, unknown> | null,
	key: unknown,
	isStaticChildren: boolean,
	source?: JsxSource,
): unknown {
	const generated = source ? `${source.fileName}:${source.lineNumber}:${source.columnNumber}` : "";
	const site = initialStamps[generated];
	const stamped =
		typeof type === "string" && source !== undefined
			? { ...props, "data-spool-source": (site ? sourcePacket?.locations?.[site] : undefined) ?? generated }
			: props;
	const create = isStaticChildren ? jsxs : jsx;
	return (create as (type: unknown, props: unknown, key: unknown) => unknown)(type, stamped, key);
}

// One module instance is pinned by the frame import map. Its cells are compiler
// products, never a second editable source document.
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
	type RetainedValues,
	type SourceOccurrence,
	type SourcePublication,
	sameSourceOccurrence,
	type UseOutcome,
} from "../source-edit";

interface Origin {
	cell: string;
	publication: string;
	invocation: string;
	value: string;
}
interface Fiber {
	memoizedProps: object;
	return: Fiber | null;
	alternate: Fiber | null;
	stateNode: unknown;
	memoizedState: unknown;
	tag: number;
	child: Fiber | null;
	sibling: Fiber | null;
}
let sourcePacket: RetainedValues | undefined;
let initialStamps: Record<string, string> = {};
let sequence = 0;
let call = 0;
let occurrence = 0;
let intent = 0;
const revoked = new Set<string>();
function revokeSource(publication: SourcePublication): void {
	revoked.add(publication.packet.id);
	const held = leases.get(publication.generation);
	if (held && sameSourceOccurrence(held.original, publication.original)) cancelSource(publication.generation);
}
const origins = new WeakMap<object, Origin>();
const committedHosts = new WeakMap<Element, { fiber: Fiber; pending: boolean }>();
interface ClassInstance {
	forceUpdate(): void;
}
const classOwners = new WeakMap<ClassInstance, string>();
const committedClasses = new Map<unknown, Set<ClassInstance>>();
let activeComponent: unknown;
let activeOwner: string | undefined;
Object.assign(globalThis, {
	__SPOOL_REACT__: {
		invoke<T>(component: unknown, render: () => T): T {
			const previous = activeComponent,
				owner = activeOwner;
			activeComponent = component;
			activeOwner = undefined;
			try {
				return render();
			} finally {
				activeComponent = previous;
				activeOwner = owner;
			}
		},
		commit(root: Fiber): void {
			const instances = new Set<ClassInstance>();
			const visit = (fiber: Fiber, pending: boolean) => {
				const suspended = pending || (fiber.tag === 13 && fiber.memoizedState !== null);
				if (fiber.stateNode instanceof Element) committedHosts.set(fiber.stateNode, { fiber, pending: suspended });
				if (
					fiber.tag === 1 &&
					typeof fiber.stateNode === "object" &&
					fiber.stateNode !== null &&
					"forceUpdate" in fiber.stateNode
				)
					instances.add(fiber.stateNode as ClassInstance);
				for (let child = fiber.child; child; child = child.sibling) visit(child, suspended);
			};
			visit(root, false);
			committedClasses.set(root.stateNode, instances);
		},
	},
});
const nodes = new WeakMap<Element, string>();
const subscribers = new Map<string, { revision: number; listeners: Set<() => void> }>();
const leases = new Map<number, { element: HTMLElement; original: SourceOccurrence; preview: string }>();
const subscription = (owner: string) => {
	let held = subscribers.get(owner);
	if (!held) {
		held = { revision: 0, listeners: new Set() };
		subscribers.set(owner, held);
	}
	return held;
};

export function configureSource(packet: RetainedValues): void {
	initialStamps = packet.stamps ?? {};
	sourcePacket = packet;
	sequence = packet.sequence;
}
export function sourceValue(cell: string, initial: string): string {
	return sourcePacket?.values[cell] ?? initial;
}
export function useSourceValues(owner: string, component: unknown): void {
	// Only React's actual component invocation owns the extra store hook.
	// Calling the same authored function as a helper remains ordinary JavaScript.
	if (activeComponent !== component || activeOwner !== undefined) return;
	activeOwner = owner;
	if (
		typeof component === "object" &&
		component !== null &&
		"forceUpdate" in component &&
		typeof component.forceUpdate === "function"
	) {
		classOwners.set(component as ClassInstance, owner);
		return;
	}
	const held = subscription(owner);
	// biome-ignore lint/correctness/useHookAtTopLevel: The pinned invocation tap admits exactly the first entry of each real function-component render; class/helper calls cannot enter this branch.
	useSyncExternalStore(
		(listener) => {
			held.listeners.add(listener);
			return () => held.listeners.delete(listener);
		},
		() => held.revision,
		() => held.revision,
	);
}
export function observeSource<T>(cell: string, element: T): T {
	if (
		sourcePacket &&
		activeOwner === sourcePacket.owners[cell] &&
		typeof element === "object" &&
		element !== null &&
		"props" in element &&
		typeof element.props === "object" &&
		element.props !== null
	) {
		origins.set(element.props, {
			cell,
			publication: sourcePacket.id,
			invocation: String(++call),
			value: sourcePacket.values[cell] ?? "",
		});
	}
	return element;
}

/** React 19.2.7's committed host props. The DOM's pointer can name either alternate. */
function committedFiber(element: Element): Fiber | undefined {
	return committedHosts.get(element)?.fiber;
}
function sourceContext(element: Element): string {
	const path: string[] = [];
	let at: Element | null = element;
	while (at) {
		path.push(`${at.tagName}:${at.getAttribute("class") ?? ""}:${at.getAttribute("style") ?? ""}`);
		at = at.parentElement;
	}
	return JSON.stringify(path);
}
function inspectSource(element: HTMLElement): SourceOccurrence | undefined {
	if (!element.isConnected) return;
	const fiber = committedFiber(element);
	const origin = fiber && origins.get(fiber.memoizedProps);
	if (!origin) return;
	let id = nodes.get(element);
	if (!id) {
		id = String(++occurrence);
		nodes.set(element, id);
	}
	return { ...origin, occurrence: id, context: sourceContext(element) };
}
function textOf(element: HTMLElement): string {
	return element.innerText ?? element.textContent ?? "";
}
function sourceRead(element: HTMLElement, generation: number): SourceOccurrence | undefined {
	if (generation <= intent) return;
	for (const old of leases.keys()) cancelSource(old);
	intent = generation;
	const original = inspectSource(element);
	if (!original || original.value !== element.textContent) return;
	leases.set(generation, { element, original, preview: original.value });
	return original;
}
function validLease(generation: number): boolean {
	const held = leases.get(generation);
	if (!held || generation !== intent) return false;
	const current = inspectSource(held.element);
	return current !== undefined && sameSourceOccurrence(current, held.original);
}
function previewSource(generation: number, value: string): boolean {
	const held = leases.get(generation);
	if (!held || !validLease(generation)) return false;
	held.preview = value;
	held.element.textContent = value;
	return true;
}
function cancelSource(generation: number): void {
	const held = leases.get(generation);
	leases.delete(generation);
	if (!held) return;
	if (held.element.isConnected && inspectSource(held.element)?.invocation === held.original.invocation)
		held.element.textContent = held.original.value;
}
function completeSource(generation: number): SourceOccurrence | undefined {
	const held = leases.get(generation);
	if (!held || !validLease(generation)) return;
	held.preview = textOf(held.element);
	return held.original;
}
function pendingIn(element: Element): boolean {
	return committedHosts.get(element)?.pending ?? false;
}
async function installSource(publication: SourcePublication, undo = false): Promise<UseOutcome> {
	const original = publication.original;
	const held = leases.get(publication.generation);
	const element =
		held?.element ??
		[...document.querySelectorAll<HTMLElement>("[data-spool-source]")].find(
			(el) => inspectSource(el)?.cell === original.cell,
		);
	const refused = (reason: string): UseOutcome => {
		revokeSource(publication);
		return { occurrence: original.occurrence, installation: "refused", rendered: "unverified", reason };
	};
	const admitted = async () => {
		if (revoked.has(publication.packet.id) || Date.now() >= publication.admission.expires) return false;
		try {
			const response = await fetch(`/source-admission/${encodeURIComponent(publication.admission.token)}`, {
				cache: "no-store",
			});
			const reply: unknown = await response.json();
			return (
				response.ok &&
				typeof reply === "object" &&
				reply !== null &&
				"admitted" in reply &&
				reply.admitted === true &&
				!revoked.has(publication.packet.id) &&
				Date.now() < publication.admission.expires
			);
		} catch {
			return false;
		}
	};
	if (!(await admitted())) return refused("the source installation lease expired or was revoked");
	if (
		!sourcePacket ||
		(publication.before !== sourcePacket.id && !(undo && publication.compatibleBefore?.includes(sourcePacket.id))) ||
		publication.packet.shape !== sourcePacket.shape ||
		publication.packet.sequence <= sequence
	)
		return refused("the running source generation changed");
	if (!undo && (!held || !validLease(publication.generation)))
		return refused("the original element changed while saving");
	if (undo && leases.size > 0) return refused("another edit is in progress");
	// Remove only this generation's temporary value, then let React reconcile
	// synchronously in this same task. No paint can expose the restored old text.
	if (held) held.element.textContent = held.original.value;
	leases.delete(publication.generation);
	let failed = false;
	const onError = () => {
		failed = true;
	};
	addEventListener("error", onError);
	try {
		flushSync(() => {
			const changed = new Set(
				Object.keys(publication.packet.values)
					.filter((cell) => sourcePacket?.values[cell] !== publication.packet.values[cell])
					.map((cell) => publication.packet.owners[cell]),
			);
			sourcePacket = publication.packet;
			sequence = publication.packet.sequence;
			const css = document.getElementById("spool-compiled-css"),
				bundled = document.getElementById("spool-bundled-css");
			if (css) css.textContent = publication.packet.css;
			if (bundled) bundled.textContent = publication.packet.bundledCss;
			for (const owner of changed) {
				if (!owner) continue;
				const held = subscribers.get(owner);
				if (!held) continue;
				held.revision++;
				for (const listener of held.listeners) listener();
			}
			for (const instances of committedClasses.values())
				for (const instance of instances) {
					const owner = classOwners.get(instance);
					if (owner && changed.has(owner)) instance.forceUpdate();
				}
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		const expected = publication.packet.values[original.cell];
		const observed = element?.textContent ?? undefined;
		const rendered = failed
			? "failed"
			: !element?.isConnected
				? "unmounted"
				: pendingIn(element)
					? "pending"
					: expected === undefined
						? "unverified"
						: observed === expected
							? "verified"
							: "mismatching";
		return {
			occurrence: original.occurrence,
			installation: "installed",
			rendered,
			...(observed === undefined ? {} : { observed }),
		};
	} catch {
		return {
			occurrence: original.occurrence,
			installation: "installed",
			rendered: "failed",
			reason: "the authored render failed",
		};
	} finally {
		removeEventListener("error", onError);
	}
}

declare global {
	interface Window {
		__SPOOL_SOURCE__?: {
			read: typeof sourceRead;
			valid: typeof validLease;
			preview: typeof previewSource;
			complete: typeof completeSource;
			cancel: typeof cancelSource;
			install: typeof installSource;
			revoke: typeof revokeSource;
		};
	}
}
if (typeof window !== "undefined")
	window.__SPOOL_SOURCE__ = {
		read: sourceRead,
		valid: validLease,
		preview: previewSource,
		complete: completeSource,
		cancel: cancelSource,
		install: installSource,
		revoke: revokeSource,
	};
