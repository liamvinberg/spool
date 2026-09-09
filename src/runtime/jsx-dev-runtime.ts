import type { ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { SourceImagePreview } from "../source-image";
import type { SourcePropertyPreview } from "../source-property";
import type { SourceStructuralExpectation } from "../source-structure";
import { captureAttribute, hasRenderedField, previewAttribute, renderedAttribute } from "./field-projection";
import { propertyOutcome } from "./property-outcome";
import { decodeImage, observeImage } from "./source-image";
import { installObserver } from "./source-observer";
import { previewPropertyStyles, restorePropertyStyles } from "./source-property-preview";
import { changedStructure, compatibleStructure, structuralList, structuralOptional } from "./source-structure";
import { createStructuralBaselines } from "./source-structure-baselines";
import {
	captureStructure,
	observeStructuralParent,
	refreshStructuralNative,
	retainVerifiedRestorations,
	type StructuralBasis,
	verifyReloadedStructure,
	verifyStructure,
} from "./source-structure-verification";
import { installValueFlow } from "./source-values";

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

const sourceLocations: Record<string, string> = {};
installValueFlow(sourceLocations);
installObserver();
export const sourceLazy = globalThis.__SPOOL_LAZY__;
export const sourceConsumed = globalThis.__SPOOL_CONSUMED__;

export function jsxDEV(
	type: unknown,
	props: Record<string, unknown> | null,
	key: unknown,
	isStaticChildren: boolean,
	source?: JsxSource,
): unknown {
	const generated = source ? `${source.fileName}:${source.lineNumber}:${source.columnNumber}` : "";
	const site = initialStamps[generated];
	let stamped =
		typeof type === "string" && source !== undefined
			? { ...props, "data-spool-source": (site ? sourcePacket?.locations?.[site] : undefined) ?? generated }
			: props;
	if (site && sourcePacket?.childValues?.[site] === null && stamped) {
		stamped = { ...stamped };
		delete stamped.children;
	}
	if (typeof type === "string" && stamped && site)
		for (const [field, definition] of Object.entries(sourcePacket?.attributes?.[site] ?? {})) {
			if (definition.absent) delete stamped[field];
			else stamped[field] = sourcePacket?.values[definition.cell];
		}
	const create = isStaticChildren ? jsxs : jsx;
	const element = (create as (type: unknown, props: unknown, key: unknown) => unknown)(type, stamped, key);
	if (typeof element === "object" && element !== null && "props" in element && "type" in element) {
		const original = site ?? generated;
		globalThis.__SPOOL_VALUES__?.jsx(element, original);
		globalThis.__SPOOL_OBSERVER__.register(element, original);
	}
	return element;
}

export function observeEntry<T>(element: T): T {
	if (typeof element === "object" && element !== null && "props" in element && "type" in element)
		globalThis.__SPOOL_OBSERVER__.register(element, "spool-entry", true);
	return element;
}

// One module instance is pinned by the frame import map. Its cells are compiler
// products, never a second editable source document.
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
	combineUseOutcomes,
	type RetainedValues,
	type SourceInventory,
	type SourceOccurrence,
	type SourceOperation,
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
let initialStructure: RetainedValues["structure"];
let sourceWasInstalled = false;
let initialStamps: Record<string, string> = {};
let sequence = 0;
let call = 0;
let occurrence = 0;
let intent = 0;
const revoked = new Set<string>();
function revokeSource(publication: SourcePublication): void {
	revoked.add(publication.packet.id);
	if (acceptedOutcome?.publication.packet.id === publication.packet.id) acceptedOutcome = undefined;
	if (publication.expected.kind === "structure") {
		sharedPreviews.delete(publication.generation);
		structuralBases.cancel(publication.generation);
	}
	const held = leases.get(publication.generation);
	if (
		held
			? sameSourceOccurrence(held.original, publication.original)
			: sharedPreviews
					.get(publication.generation)
					?.some((use) => sameSourceOccurrence(use.original, publication.original))
	)
		cancelSource(publication.generation);
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
			queueSourceOutcome();
		},
		caught(boundary: Fiber): void {
			failSourceOutcome(boundary);
		},
		uncaught(root: { current: Fiber }): void {
			failSourceOutcome(root.current);
		},
	},
});
const nodes = new WeakMap<Element, string>();
const subscribers = new Map<string, { revision: number; listeners: Set<() => void> }>();
interface PreviewedUse {
	element: HTMLElement;
	original: SourceOccurrence;
	preview: string;
	previewed: boolean;
	previewAbsent?: boolean | undefined;
	children: { node: ChildNode; value: string | null }[];
	restoreAttribute?: () => void;
}
const leases = new Map<number, PreviewedUse>();
const subscription = (owner: string) => {
	let held = subscribers.get(owner);
	if (!held) {
		held = { revision: 0, listeners: new Set() };
		subscribers.set(owner, held);
	}
	return held;
};

export function configureSource(packet: RetainedValues): void {
	acceptedOutcome = undefined;
	structuralBases.clear();
	initialStamps = packet.stamps ?? {};
	initialStructure = packet.structure;
	sourceWasInstalled = false;
	sourcePacket = packet;
	Object.assign(sourceLocations, packet.locations);
	sequence = packet.sequence;
}
export function sourceTypeFrom(element: Parameters<NonNullable<typeof globalThis.__SPOOL_VALUES__>["typeFrom"]>[0]) {
	return globalThis.__SPOOL_VALUES__!.typeFrom(element);
}
export function observeFactory<T>(site: string, action: () => T): T {
	return globalThis.__SPOOL_VALUES__!.at(site, action);
}
export function sourceOptional(site: string, factory: () => ReactNode): ReactNode {
	return structuralOptional(sourcePacket?.structure, site, factory);
}
export function sourceList(site: string, factories: Record<string, () => ReactNode>): { children?: ReactNode } {
	return structuralList(sourcePacket?.structure, site, factories);
}
export function sourceValue(cell: string, initial: string): string {
	return sourcePacket?.values[cell] ?? initial;
}
export function sourceChildren(
	cell: string,
	initial: string | readonly string[] | null,
): string | readonly string[] | undefined {
	const values = sourcePacket?.childValues;
	const value = values && Object.hasOwn(values, cell) ? values[cell] : initial;
	return Array.isArray(value) ? [...value] : (value ?? undefined);
}
const anonymousOwners = new WeakMap<object, string>();
export function sourceComponent<T extends object>(owner: string, component: T): T {
	anonymousOwners.set(component, owner);
	return component;
}
export function useSourceValues(owner: string, component?: unknown): void {
	// Only React's actual component invocation owns the extra store hook.
	// Calling the same authored function as a helper remains ordinary JavaScript.
	if (
		component === undefined &&
		typeof activeComponent === "function" &&
		anonymousOwners.get(activeComponent) === owner
	)
		component = activeComponent;
	if (component === undefined || activeComponent !== component || activeOwner !== undefined) return;
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
/** The compiler marks only direct data objects; their identity and members are unchanged. */
export function sourceStyle<T extends object>(value: T): T {
	return globalThis.__SPOOL_VALUES__?.styleLiteral(value) ?? value;
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
function sourceContext(element: Element, field?: string): string {
	const path: string[] = [];
	let at: Element | null = element;
	while (at) {
		const ownedClass = at === element && field === "className";
		const className = ownedClass
			? Object.getOwnPropertyDescriptor(committedFiber(at)?.memoizedProps ?? {}, "className")?.value
			: at.getAttribute("class");
		path.push(`${at.tagName}:${typeof className === "string" ? className : ""}:${at.getAttribute("style") ?? ""}`);
		at = at.parentElement;
	}
	if (field !== "className") return JSON.stringify(path);
	const native = getComputedStyle(element);
	return JSON.stringify({ path, native: { direction: native.direction, writingMode: native.writingMode } });
}
function inspectSource(
	element: HTMLElement,
	field?: string,
	operation: SourceOperation = { kind: "literal", ...(field ? { field } : {}) },
): SourceOccurrence | undefined {
	if ((operation.kind === "property" || operation.kind === "properties") && field !== "className") return;
	if (operation.kind === "image" && (!(element instanceof HTMLImageElement) || field !== "src")) return;
	if (!element.isConnected || globalThis.__SPOOL_OBSERVER__.failure) return;
	const fiber = committedFiber(element);
	let origin =
		operation.kind === "literal" && field === undefined && fiber ? origins.get(fiber.memoizedProps) : undefined;
	let provenance: string | undefined;
	const value: unknown = fiber
		? Object.getOwnPropertyDescriptor(fiber.memoizedProps, field ?? "children")?.value
		: undefined;
	try {
		const observed = globalThis.__SPOOL_OBSERVER__.observe(element);
		if (observed.refusal) return;
		provenance = JSON.stringify(observed);
		if (
			!origin &&
			sourcePacket &&
			fiber &&
			(operation.kind === "delete" ||
				((field !== undefined || typeof value === "string") && (value === undefined || typeof value === "string")))
		)
			origin = {
				cell: observed.source,
				publication: sourcePacket.id,
				invocation: JSON.stringify(
					observed.chain.map((call) => [call.occurrence, call.invocation?.id, call.element]),
				),
				value: operation.kind === "delete" ? "" : String(value ?? ""),
			};
	} catch {
		return;
	}
	if (!origin) return;
	let id = nodes.get(element);
	if (!id) {
		id = String(++occurrence);
		nodes.set(element, id);
	}
	const nativeValue =
		operation.kind === "property" ? getComputedStyle(element).getPropertyValue(operation.property) : "";
	const rules = operation.kind === "property" ? matchedRulePaths(element, operation.property) : [];
	let structure: SourceOccurrence["structure"];
	if (operation.kind === "delete") {
		const parent = element.parentElement;
		if (!parent) return;
		let parentId = nodes.get(parent);
		if (!parentId) {
			parentId = String(++occurrence);
			nodes.set(parent, parentId);
		}
		const source = observeStructuralParent(parent, sourcePacket?.locations ?? {});
		structure = { parent: parentId, ...(source ? { source } : {}) };
	}
	return {
		...origin,
		...(operation.kind === "property" && nativeValue
			? { propertyNative: { property: operation.property, value: nativeValue } }
			: {}),
		...(rules.length ? { propertyRules: rules } : {}),
		...(structure ? { structure } : {}),
		// Retained props keep their original invocation/value even when React
		// skips recreating them. This observation belongs to the installed packet.
		publication: sourcePacket?.id ?? origin.publication,
		occurrence: id,
		...(field === undefined ? {} : { field, absent: value === undefined }),
		context: sourceContext(element, field),
		...(provenance === undefined ? {} : { provenance }),
	};
}
/** The dynamic state a rule may name and this element may not be in right now. */
const DYNAMIC =
	/:(?:hover|focus|focus-visible|focus-within|active|disabled|enabled|checked|indeterminate|valid|invalid|required|optional|read-only|read-write|placeholder-shown|target|visited|link|any-link)\b/g;

/**
 * Every rule chain in this document that declares this property and applies to
 * this element, whether or not its state is the state the element is in.
 *
 * This is the evidence that a rule belongs to this element at all: a stylesheet
 * is full of declarations for other subjects, and none of them is a source for
 * this one. A selector this document's own parser will not take, or a grouping
 * rule whose order is not the cascade's own, is left out rather than guessed at.
 */
function matchedRulePaths(element: Element, property: string): string[][] {
	const found: string[][] = [];
	const related = (name: string) =>
		name === property || name.startsWith(`${property}-`) || property.startsWith(`${name}-`);
	const applies = (selector: string): boolean => {
		const resting = selector.replace(DYNAMIC, "");
		if (!resting.trim()) return false;
		try {
			return element.matches(resting);
		} catch {
			return false;
		}
	};
	const walk = (rules: CSSRuleList, path: readonly string[]): void => {
		for (const rule of rules) {
			if (rule instanceof CSSStyleRule) {
				const next = [...path, rule.selectorText];
				let declares = false;
				for (const name of rule.style) if (related(name)) declares = true;
				if (declares && applies(rule.selectorText)) found.push(next);
				if (rule.cssRules.length) walk(rule.cssRules, next);
			} else if (rule instanceof CSSMediaRule) walk(rule.cssRules, [...path, `@media ${rule.conditionText}`]);
			else if (rule instanceof CSSSupportsRule) walk(rule.cssRules, [...path, `@supports ${rule.conditionText}`]);
			else if (rule instanceof CSSLayerBlockRule) walk(rule.cssRules, [...path, `@layer ${rule.name}`]);
		}
	};
	for (const sheet of element.ownerDocument.styleSheets) {
		try {
			walk(sheet.cssRules, []);
		} catch {
			// A stylesheet this document may not read is not evidence about it.
		}
	}
	return found;
}

function renderedField(element: HTMLElement, field?: string): string {
	return field === undefined ? textOf(element) : renderedAttribute(element, field);
}
function previewField(element: HTMLElement, field: string | undefined, value: string): void {
	if (field === undefined) element.textContent = value;
	else previewAttribute(element, field, value, committedFiber(element)?.memoizedProps);
}
function restoreField(
	element: HTMLElement,
	original: SourceOccurrence,
	children: PreviewedUse["children"],
	restoreAttribute?: () => void,
): void {
	if (!original.field) {
		for (const child of children) child.node.nodeValue = child.value;
		element.replaceChildren(...children.map((child) => child.node));
		return;
	}
	restoreAttribute?.();
}
function textOf(element: HTMLElement): string {
	return element.innerText ?? element.textContent ?? "";
}

const sharedPreviews = new Map<number, PreviewedUse[]>();
function previewedUse(element: HTMLElement, original: SourceOccurrence): PreviewedUse {
	return {
		element,
		original,
		preview: original.value,
		previewed: false,
		children: [...element.childNodes].map((node) => ({ node, value: node.nodeValue })),
		...(original.field === undefined ? {} : { restoreAttribute: captureAttribute(element, original.field) }),
	};
}
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
const disclosureFeedback = new Set<HTMLElement>();
const gestureFeedback = new Set<HTMLElement>();
function renderSourceFeedback(): void {
	ensureSourceFeedback();
	for (const element of document.querySelectorAll<HTMLElement>("[data-spool-shared-use]"))
		if (!disclosureFeedback.has(element) && !gestureFeedback.has(element))
			element.removeAttribute("data-spool-shared-use");
	for (const element of [...disclosureFeedback, ...gestureFeedback])
		if (element.isConnected) element.setAttribute("data-spool-shared-use", "");
}
function clearGestureFeedback(): void {
	clearTimeout(feedbackTimer);
	gestureFeedback.clear();
	renderSourceFeedback();
}
function sourceObservationOperation(original: SourceOccurrence, element: HTMLElement): SourceOperation {
	return original.structure
		? { kind: "delete" }
		: original.field === "src" && element instanceof HTMLImageElement
			? { kind: "image" }
			: { kind: "literal", ...(original.field ? { field: original.field } : {}) };
}
function sourceElement(original: SourceOccurrence): HTMLElement | undefined {
	return [...document.querySelectorAll<HTMLElement>("[data-spool-source]")].find((element) => {
		const current = inspectSource(element, original.field, sourceObservationOperation(original, element));
		return current && sameSourceOccurrence(current, original);
	});
}
function highlightSource(uses: SourceOccurrence[]): void {
	disclosureFeedback.clear();
	for (const original of uses) {
		const element = sourceElement(original);
		if (element) disclosureFeedback.add(element);
	}
	renderSourceFeedback();
}
function ensureSourceFeedback(): void {
	if (document.getElementById("spool-shared-use-outline")) return;
	const style = document.createElement("style");
	style.id = "spool-shared-use-outline";
	style.textContent =
		"[data-spool-shared-use]{outline:1px solid rgba(245,57,26,.55)!important;outline-offset:3px!important;}";
	document.head.append(style);
}
function clearSourceFeedback(): void {
	disclosureFeedback.clear();
	gestureFeedback.clear();
	clearTimeout(feedbackTimer);
	for (const element of document.querySelectorAll("[data-spool-shared-use]"))
		element.removeAttribute("data-spool-shared-use");
}
function inventorySource(
	field?: string,
	operation: SourceOperation = { kind: "literal", ...(field ? { field } : {}) },
): Omit<SourceInventory, "frame"> {
	const uses: SourceInventory["uses"] = [];
	let unknown = 0;
	for (const element of document.querySelectorAll<HTMLElement>("[data-spool-source]")) {
		if (operation.kind === "image" && !(element instanceof HTMLImageElement)) continue;
		if (operation.kind === "literal" && field === undefined && element.children.length > 0) continue;
		const original = inspectSource(element, field, operation);
		if (!original) {
			if (field !== undefined || element.textContent) unknown++;
			continue;
		}
		const rect = element.getBoundingClientRect();
		uses.push({
			original,
			visible:
				rect.width > 0 &&
				rect.height > 0 &&
				rect.bottom > 0 &&
				rect.right > 0 &&
				rect.top < innerHeight &&
				rect.left < innerWidth,
		});
	}
	return { publication: sourcePacket?.id ?? "", uses, unknown };
}
function prepareSourceUses(
	generation: number,
	uses: SourceOccurrence[],
	structure?: SourceStructuralExpectation,
): boolean {
	if (structure) structuralBases.prepare(generation, captureStructure(structure, sourceLocations));
	// A field's owner disclosure and its pending preview have separate lives.
	// A late preparation must not erase the already-open disclosure.
	clearGestureFeedback();
	for (const previous of sharedPreviews.keys()) cancelSourceUses(previous, "prepare");
	const prepared: PreviewedUse[] = [];
	for (const original of uses) {
		const element = [...document.querySelectorAll<HTMLElement>("[data-spool-source]")].find((element) => {
			const current = inspectSource(element, original.field, sourceObservationOperation(original, element));
			return current && sameSourceOccurrence(current, original);
		});
		if (element) prepared.push(previewedUse(element, original));
	}
	sharedPreviews.set(generation, prepared);
	if (uses.length) ensureSourceFeedback();
	return prepared.length === uses.length;
}
function previewSourceUses(generation: number, value: string): void {
	for (const held of sharedPreviews.get(generation) ?? []) {
		const current = inspectSource(
			held.element,
			held.original.field,
			sourceObservationOperation(held.original, held.element),
		);
		if (!current || !sameSourceOccurrence(current, held.original)) continue;
		held.preview = value;
		held.previewed = true;
		if (renderedField(held.element, held.original.field) !== value)
			previewField(held.element, held.original.field, value);
		held.previewAbsent =
			held.original.field === undefined
				? undefined
				: !hasRenderedField(held.element, held.original.field, committedFiber(held.element)?.memoizedProps);
		if (leases.get(generation)?.element !== held.element) gestureFeedback.add(held.element);
	}
	renderSourceFeedback();
}
function ownsPreview(held: PreviewedUse): boolean {
	return (
		held.previewed &&
		renderedField(held.element, held.original.field) === held.preview &&
		(held.original.field === undefined ||
			held.previewAbsent ===
				!hasRenderedField(held.element, held.original.field, committedFiber(held.element)?.memoizedProps))
	);
}
function cancelSourceUses(generation: number, reason: "cancel" | "prepare" | "install" = "cancel"): void {
	if (reason !== "install") restorePropertyStyles(generation);
	const held = sharedPreviews.get(generation);
	sharedPreviews.delete(generation);
	for (const use of held ?? []) {
		const current = inspectSource(
			use.element,
			use.original.field,
			sourceObservationOperation(use.original, use.element),
		);
		if (current && sameSourceOccurrence(current, use.original) && ownsPreview(use))
			restoreField(use.element, use.original, use.children, use.restoreAttribute);
	}
	if (reason !== "install") structuralBases.cancel(generation);
	if (reason === "cancel") clearSourceFeedback();
	else if (reason === "prepare") clearGestureFeedback();
}
function sourceRead(
	element: HTMLElement,
	generation: number,
	field?: string,
	operation: SourceOperation = { kind: "literal", ...(field ? { field } : {}) },
): SourceOccurrence | undefined {
	if (generation <= intent) return;
	for (const old of leases.keys()) cancelSource(old);
	intent = generation;
	acceptedOutcome = undefined;
	const original = inspectSource(element, field, operation);
	if (!original || (!original.structure && original.value !== renderedField(element, original.field))) return;
	leases.set(generation, previewedUse(element, original));
	return original;
}
function validLease(generation: number): boolean {
	const held = leases.get(generation);
	if (!held || generation !== intent) return false;
	const current = inspectSource(
		held.element,
		held.original.field,
		sourceObservationOperation(held.original, held.element),
	);
	return current !== undefined && sameSourceOccurrence(current, held.original);
}
function previewSource(generation: number, value: string): boolean {
	const held = leases.get(generation);
	if (held?.original.structure) return false;
	if (!held) {
		previewSourceUses(generation, value);
		return sharedPreviews.has(generation);
	}
	if (!validLease(generation)) return false;
	held.preview = value;
	held.previewed = true;
	if (renderedField(held.element, held.original.field) !== value)
		previewField(held.element, held.original.field, value);
	held.previewAbsent =
		held.original.field === undefined
			? undefined
			: !hasRenderedField(held.element, held.original.field, committedFiber(held.element)?.memoizedProps);
	previewSourceUses(generation, value);
	return true;
}
function previewProperty(plan: SourcePropertyPreview): boolean {
	const uses = leases.has(plan.generation) ? [leases.get(plan.generation)!] : sharedPreviews.get(plan.generation);
	if (!sourcePacket || !uses?.length || uses.some((use) => use.original.field !== "className")) return false;
	if (leases.has(plan.generation) && !validLease(plan.generation)) return false;
	if (
		!previewPropertyStyles(
			plan,
			sourcePacket,
			uses.map((use) => use.element),
		)
	)
		return false;
	return previewSource(plan.generation, plan.value);
}

async function previewImage(generation: number, value: string): Promise<SourceImagePreview> {
	if (!(await decodeImage(value))) return "failed";
	return previewSource(generation, value) ? "ready" : "unavailable";
}
function cancelSource(generation: number): void {
	const held = leases.get(generation);
	leases.delete(generation);
	cancelSourceUses(generation);
	if (!held) return;
	if (
		held.element.isConnected &&
		ownsPreview(held) &&
		inspectSource(held.element, held.original.field, sourceObservationOperation(held.original, held.element))
			?.invocation === held.original.invocation
	)
		restoreField(held.element, held.original, held.children, held.restoreAttribute);
}
function completeSource(generation: number): SourceOccurrence | undefined {
	const held = leases.get(generation);
	if (!held || !validLease(generation)) return;
	held.preview = renderedField(held.element, held.original.field);
	return held.original;
}
function pendingIn(element: Element): boolean {
	return committedHosts.get(element)?.pending ?? false;
}
const structuralBases = createStructuralBaselines();
interface AcceptedOutcome {
	structural?: {
		basis: StructuralBasis;
		before: RetainedValues["structure"];
		originals: Map<HTMLElement, SourceOccurrence>;
		restoredParents: Set<HTMLElement>;
	};
	publication: SourcePublication;
	targets: { original: SourceOccurrence; element: HTMLElement | undefined; ancestors: Fiber[] }[];
	failed: Set<HTMLElement>;
	ready: boolean;
	last: string;
}
let acceptedOutcome: AcceptedOutcome | undefined;
function observedUse(
	original: SourceOccurrence,
	element: HTMLElement | undefined,
	expected: SourcePublication["expected"],
	failed: ReadonlySet<HTMLElement>,
): UseOutcome {
	if (expected.kind === "image") {
		const result = !element?.isConnected
			? { rendered: failed.has(element!) ? ("failed" as const) : ("unmounted" as const) }
			: pendingIn(element)
				? { rendered: "pending" as const }
				: observeImage(element, expected);
		return { occurrence: original.occurrence, installation: "installed", ...result };
	}
	if (expected.kind === "structure")
		return combineUseOutcomes(
			verifyReloadedStructure(expected, sourcePacket?.structure, sourceLocations, pendingIn).map((outcome) => ({
				...outcome,
				occurrence: original.occurrence,
				installation: "installed",
			})),
			original.occurrence,
		);
	if (expected.kind === "properties") {
		const outcomes = expected.selections.flatMap((selection) =>
			selection.observations.map((observation) =>
				observedUse(
					original,
					element,
					{
						kind: "property",
						property: observation.property,
						scope: selection.scope,
						className: expected.className,
						absent: expected.absent,
						css: expected.css,
						scopePaths: observation.scopePaths,
						effects: observation.effects,
					},
					failed,
				),
			),
		);
		const combined = combineUseOutcomes(outcomes, original.occurrence);
		// These are effects of one use, not additional governed occurrences.
		return {
			occurrence: original.occurrence,
			installation: "installed",
			rendered: combined.rendered,
			...(combined.observed === undefined ? {} : { observed: combined.observed }),
			...(combined.reason === undefined ? {} : { reason: combined.reason }),
		};
	}
	let property = expected.kind === "property" && element ? propertyOutcome(element, expected) : undefined;
	if (property?.rendered === "verified" && expected.kind === "property" && element) {
		const props = committedFiber(element)?.memoizedProps;
		const declaration = props ? Object.getOwnPropertyDescriptor(props, "className") : undefined;
		const applied =
			props !== undefined &&
			(expected.absent
				? declaration === undefined || ("value" in declaration && declaration.value === undefined)
				: declaration !== undefined && "value" in declaration && declaration.value === expected.className);
		if (!applied)
			property = {
				...property,
				rendered: "unverified",
				reason: "the native value matches, but the committed class declaration has not received this source change",
			};
	}
	function observedValue(): string | undefined {
		if (expected.kind === "property") return property?.observed;
		return element ? renderedField(element, original.field) : undefined;
	}
	const observed = observedValue();
	function fieldMatches(field: string): boolean {
		if (!element || expected.kind !== "literal") return false;
		const props = committedFiber(element)?.memoizedProps;
		if (expected.absent) return !hasRenderedField(element, field, props);
		return hasRenderedField(element, field, props) && observed === expected.value;
	}
	function matching(): boolean {
		if (expected.kind === "property") return property?.rendered === "verified";
		if (expected.kind !== "literal") return false;
		return original.field ? fieldMatches(original.field) : observed === expected.value;
	}
	function renderedAs(): UseOutcome["rendered"] {
		if (!element?.isConnected) return element && failed.has(element) ? "failed" : "unmounted";
		if (pendingIn(element)) return "pending";
		if (matching()) return "verified";
		if (failed.has(element)) return "failed";
		return property?.rendered ?? "mismatching";
	}
	const rendered = renderedAs();
	return {
		occurrence: original.occurrence,
		installation: "installed",
		rendered,
		...(observed === undefined ? {} : { observed }),
		...(property?.reason === undefined ? {} : { reason: property.reason }),
	};
}
function observedOutcome(held: AcceptedOutcome): UseOutcome {
	const { publication, failed } = held;
	const expected = publication.expected;
	if (expected.kind === "structure") {
		const structural = held.structural;
		if (!structural)
			return {
				occurrence: publication.original.occurrence,
				installation: "installed",
				rendered: "unverified",
				reason: "the original structural parent baseline is missing",
			};
		const outcomes = verifyStructure(
			structural.basis,
			expected,
			structural.before,
			sourceLocations,
			pendingIn,
			(element) => failed.has(element),
		);
		const verifiedParents = new Set(
			outcomes.flatMap((outcome) =>
				outcome.rendered === "verified" &&
				outcome.parent &&
				structural.originals.has(outcome.parent) &&
				!structural.restoredParents.has(outcome.parent)
					? [outcome.parent]
					: [],
			),
		);
		for (const basis of structuralBases.values())
			retainVerifiedRestorations(basis, expected, structural.before, sourceLocations, verifiedParents);
		for (const parent of verifiedParents) structural.restoredParents.add(parent);
		return combineUseOutcomes(
			outcomes.map((outcome) => {
				const original = outcome.parent ? structural.originals.get(outcome.parent) : undefined;
				return {
					occurrence: original?.occurrence ?? publication.original.occurrence,
					installation: "installed" as const,
					rendered: original ? outcome.rendered : ("unverified" as const),
					...(!original
						? { reason: outcome.reason ?? "the structural parent has no original affected-use attribution" }
						: outcome.reason
							? { reason: outcome.reason }
							: {}),
				};
			}),
			publication.original.occurrence,
		);
	}

	return combineUseOutcomes(
		held.targets.map(({ original, element }) =>
			observedUse(original, element, held.publication.expected, held.failed),
		),
		held.publication.original.occurrence,
	);
}
/** Read-only verification after an explicit reload; it never installs or previews. */
function verifySource(
	original: SourceOccurrence,
	expected: SourcePublication["expected"],
	publication: string,
): UseOutcome {
	if (sourcePacket?.id !== publication)
		return {
			occurrence: original.occurrence,
			installation: "refused",
			rendered: "unverified",
			reason: "the verified source publication changed",
		};
	if (expected.kind === "structure" && sourceWasInstalled) {
		if (
			acceptedOutcome?.publication.packet.id === publication &&
			JSON.stringify(acceptedOutcome.publication.expected) === JSON.stringify(expected)
		)
			return observedOutcome(acceptedOutcome);
		return {
			occurrence: original.occurrence,
			installation: "installed",
			rendered: "unverified",
			reason: "the still-running structural result has no original native verification basis",
		};
	}
	if (expected.kind === "structure" && globalThis.__SPOOL_OBSERVER__.failure)
		return { occurrence: original.occurrence, installation: "installed", rendered: "failed" };
	const element = sourceElement(original);
	if (
		(expected.kind === "structure" && leases.size > 0) ||
		[...leases.values()].some((lease) => lease.element === element) ||
		[...sharedPreviews.values()].some((uses) => uses.some((use) => use.element === element && use.previewed))
	)
		return {
			occurrence: original.occurrence,
			installation: "installed",
			rendered: "unverified",
			reason: "an edit still owns this preview",
		};
	return observedUse(original, element, expected, new Set());
}

function queueSourceOutcome(): void {
	const held = acceptedOutcome;
	if (!held?.ready) return;
	queueMicrotask(() => {
		if (
			acceptedOutcome !== held ||
			sourcePacket?.id !== held.publication.packet.id ||
			revoked.has(held.publication.packet.id)
		)
			return;
		const result = observedOutcome(held);
		const serialized = JSON.stringify(result);
		if (serialized === held.last) return;
		held.last = serialized;
		const { publication } = held;
		parent.postMessage(
			{
				spool: "source-outcome",
				frame: publication.frame,
				publication: publication.packet.id,
				owner: publication.owner,
				generation: publication.generation,
				result,
			},
			"*",
		);
	});
}
function failSourceOutcome(boundary: Fiber): void {
	const held = acceptedOutcome;
	if (!held) return;
	for (const { element, ancestors } of held.targets) {
		if (!element) continue;
		for (const at of ancestors) {
			if (at === boundary || at.alternate === boundary || (at.stateNode === boundary.stateNode && at.tag === 3)) {
				held.failed.add(element);
				break;
			}
		}
	}
	queueSourceOutcome();
}

async function installSource(publication: SourcePublication, undo = false): Promise<UseOutcome> {
	const original = publication.original;
	const held = leases.get(publication.generation);
	const element =
		held?.element ??
		[...document.querySelectorAll<HTMLElement>("[data-spool-source]")].find(
			(el) => nodes.get(el) === original.occurrence,
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
		!compatibleStructure(initialStructure, publication.packet.structure) ||
		publication.packet.sequence <= sequence
	)
		return refused("the running source generation changed");

	const prepared = sharedPreviews.get(publication.generation);
	const secondary =
		publication.targets &&
		prepared?.some((use) => {
			const current = inspectSource(
				use.element,
				use.original.field,
				sourceObservationOperation(use.original, use.element),
			);
			return current && sameSourceOccurrence(use.original, original) && sameSourceOccurrence(current, use.original);
		});
	if (!undo && !((held && validLease(publication.generation)) || secondary))
		return refused("the original element changed while saving");
	const sourceAncestry = (element: HTMLElement | undefined) => {
		const ancestors: Fiber[] = [];
		for (let at = element ? committedFiber(element) : undefined; at; at = at.return ?? undefined) ancestors.push(at);
		return ancestors;
	};
	const targets = (publication.targets ?? [original])
		.map((original) => ({
			original,
			element:
				original.occurrence === publication.original.occurrence
					? element
					: [...document.querySelectorAll<HTMLElement>("[data-spool-source]")].find(
							(element) => nodes.get(element) === original.occurrence,
						),
		}))
		.map((target) => ({ ...target, ancestors: sourceAncestry(target.element) }));
	if (undo && leases.size > 0) return refused("another edit is in progress");
	// Remove only this generation's temporary value, then let React reconcile
	// synchronously in this same task. No paint can expose the restored old text.
	restorePropertyStyles(publication.generation);
	if (held && ownsPreview(held)) restoreField(held.element, held.original, held.children, held.restoreAttribute);
	cancelSourceUses(publication.generation, "install");
	feedbackTimer = setTimeout(clearGestureFeedback, 450);
	leases.delete(publication.generation);
	const basis = publication.expected.kind === "structure" ? structuralBases.get(publication.generation) : undefined;
	if (basis) refreshStructuralNative(basis);
	structuralBases.finish(publication.generation);
	const structuralOriginals = new Map<HTMLElement, SourceOccurrence>();
	for (const group of basis?.groups ?? []) {
		const target = targets.find(
			(target) => target.element === group.parent || target.original.structure?.parent === nodes.get(group.parent),
		);
		if (target) structuralOriginals.set(group.parent, target.original);
	}
	const structuralTargets = basis?.groups.flatMap((group) => {
		const original = structuralOriginals.get(group.parent);
		return original ? [{ original, element: group.parent, ancestors: sourceAncestry(group.parent) }] : [];
	});
	const observation: AcceptedOutcome = {
		publication,
		targets: structuralTargets ?? targets,
		failed: new Set(),
		ready: false,
		last: "",
		...(basis
			? {
					structural: {
						basis,
						before: sourcePacket?.structure,
						originals: structuralOriginals,
						restoredParents: new Set(),
					},
				}
			: {}),
	};
	acceptedOutcome = observation;
	try {
		flushSync(() => {
			const attributeAbsence = (packet: RetainedValues | undefined) =>
				new Map(
					Object.values(packet?.attributes ?? {}).flatMap((fields) =>
						Object.values(fields).map(({ cell, absent }) => [cell, absent] as const),
					),
				);
			const previousAbsence = attributeAbsence(sourcePacket);
			const nextAbsence = attributeAbsence(publication.packet);
			const changed = new Set(
				[
					...new Set([
						...Object.keys(publication.packet.values),
						...Object.keys(sourcePacket?.values ?? {}),
						...previousAbsence.keys(),
						...nextAbsence.keys(),
					]),
				]
					.filter(
						(cell) =>
							sourcePacket?.values[cell] !== publication.packet.values[cell] ||
							previousAbsence.get(cell) !== nextAbsence.get(cell) ||
							JSON.stringify(sourcePacket?.childValues?.[cell]) !==
								JSON.stringify(publication.packet.childValues?.[cell]),
					)
					.map((cell) => publication.packet.owners[cell]),
			);
			for (const site of changedStructure(sourcePacket?.structure, publication.packet.structure))
				changed.add(publication.packet.owners[site] ?? sourcePacket?.owners[site]);
			sourcePacket = publication.packet;
			sourceWasInstalled = true;
			Object.assign(sourceLocations, publication.packet.locations);
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

		const result = observedOutcome(observation);
		observation.last = JSON.stringify(result);
		observation.ready = true;
		return result;
	} catch {
		return {
			occurrence: original.occurrence,
			installation: "installed",
			rendered: "failed",
			reason: "the authored render failed",
		};
	}
}

declare global {
	interface Window {
		__SPOOL_SOURCE__?: {
			read: typeof sourceRead;
			inspect: typeof inspectSource;
			verify: typeof verifySource;
			element: typeof sourceElement;
			highlight: typeof highlightSource;
			inventory: typeof inventorySource;
			prepare: typeof prepareSourceUses;
			retainStructures: typeof structuralBases.retain;
			retireStructure: typeof structuralBases.retire;
			clearFeedback: typeof clearSourceFeedback;
			valid: typeof validLease;
			preview: typeof previewSource;
			previewProperty: typeof previewProperty;
			previewImage: typeof previewImage;
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
		inspect: inspectSource,
		verify: verifySource,
		element: sourceElement,
		highlight: highlightSource,
		inventory: inventorySource,
		prepare: prepareSourceUses,
		retainStructures: structuralBases.retain,
		retireStructure: structuralBases.retire,
		clearFeedback: clearSourceFeedback,
		valid: validLease,
		preview: previewSource,
		previewProperty,
		previewImage,
		complete: completeSource,
		cancel: cancelSource,
		install: installSource,
		revoke: revokeSource,
	};

if (typeof document !== "undefined") {
	const imageSettled = (event: Event) => {
		if (event.target instanceof HTMLImageElement) queueSourceOutcome();
	};
	document.addEventListener("load", imageSettled, true);
	document.addEventListener("error", imageSettled, true);
}
