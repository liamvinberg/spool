import type { JSXElement, Node } from "@babel/types";
import { walkNodes } from "./jsx-walk";
import { type Selection, type Sources, StructuralShapeRefusal, sourceRead } from "./source-origins";

function range(node: Node) {
	if (node.start == null || node.end == null) throw new Error("missing authored range");
	return { start: node.start, end: node.end };
}
function body(fn: ReturnType<Sources["valueCallee"]>["fn"]) {
	return fn.body.type === "BlockStatement" && fn.body.body.length === 1 && fn.body.body[0]?.type === "ReturnStatement"
		? fn.body.body[0].argument
		: fn.body;
}
function significant(node: JSXElement | Extract<Node, { type: "JSXFragment" }>) {
	return node.children.filter(
		(child) =>
			(child.type !== "JSXText" || child.value.trim() !== "") &&
			!(child.type === "JSXExpressionContainer" && child.expression.type === "JSXEmptyExpression"),
	);
}
function key(node: Node): string {
	if (node.type === "JSXExpressionContainer") return key(node.expression);
	if (node.type === "ConditionalExpression") {
		if (node.consequent.type === "NullLiteral") return key(node.alternate);
		if (node.alternate.type === "NullLiteral") return key(node.consequent);
		const a = key(node.consequent),
			b = key(node.alternate);
		if (a !== b) throw new Error("conditional branches change key; movement identity unproved");
		return a;
	}
	if (node.type === "CallExpression") {
		if (node.arguments.some((argument) => argument.type === "SpreadElement"))
			throw new Error("spread factory arguments have no stable structural identity");
		const config = node.arguments[1];
		if (
			config?.type !== "ObjectExpression" ||
			config.properties.some((property) => property.type !== "ObjectProperty" || property.computed)
		)
			throw new Error("factory key configuration is not a direct immutable object");
		const fields = config.properties.filter(
			(property) =>
				property.type === "ObjectProperty" &&
				((property.key.type === "Identifier" && property.key.name === "key") ||
					(property.key.type === "StringLiteral" && property.key.value === "key")),
		);
		const field = fields[0];
		if (fields.length !== 1 || field?.type !== "ObjectProperty" || field.value.type !== "StringLiteral")
			throw new Error("stable authored factory keys required");
		return field.value.value;
	}
	if (node.type !== "JSXElement") throw new Error("complete keyed JSX sibling required");
	if (node.openingElement.attributes.some((a) => a.type === "JSXSpreadAttribute"))
		throw new Error("spread key unproved");
	const fields = node.openingElement.attributes.filter((a) => a.type === "JSXAttribute" && a.name.name === "key");
	const field = fields[0];
	if (fields.length !== 1 || field?.type !== "JSXAttribute" || field.value?.type !== "StringLiteral")
		throw new Error("stable authored keys required; unsafe unkeyed state transfer");
	return field.value.value;
}
function retainedOwner(pick: Selection): void {
	for (const call of pick.chain) {
		if (!call.retainedProps) continue;
		const current = call.values,
			rendered = call.renderedValues;
		const invocation = "invocation" in call ? call.invocation : undefined;
		const input =
			invocation && typeof invocation === "object" && "input" in invocation ? invocation.input : undefined;
		if (!current || !rendered || !input || JSON.stringify(input) !== JSON.stringify(rendered))
			throw new Error("retained invocation input is absent or differs from actual retained fields");
		const origin = (value: typeof current) =>
			JSON.stringify({
				kind: value.kind,
				source: value.source,
				type: value.type.origin.source,
				key: value.key.value,
				fields: Object.entries(value.fields).map(([name, field]) => [
					name,
					field.value,
					field.origin.kind,
					field.origin.source,
					field.origin.field,
					field.origin.via.map((edge) => [edge.kind, edge.source, edge.replaced]),
				]),
			});
		if (origin(current) !== origin(rendered))
			throw new Error("the retained component still uses an earlier source expression or field value");
	}
}
function slotLocal(fn: ReturnType<Sources["valueCallee"]>["fn"], field: string): string | undefined {
	const param = fn.params[0];
	if (param?.type !== "ObjectPattern") return;
	const prop = param.properties.find(
		(p) => p.type === "ObjectProperty" && !p.computed && p.key.type === "Identifier" && p.key.name === field,
	);
	return prop?.type === "ObjectProperty" && prop.value.type === "Identifier" ? prop.value.name : undefined;
}
function nullFallback(fn: ReturnType<Sources["valueCallee"]>["fn"], field: string): JSXElement | undefined {
	const local = slotLocal(fn, field);
	const found: JSXElement[] = [];
	walkNodes(fn.body, [], (node) => {
		if (
			node.type === "LogicalExpression" &&
			node.operator === "??" &&
			node.left.type === "Identifier" &&
			node.left.name === local &&
			node.right.type === "JSXElement"
		)
			found.push(node.right);
	});
	return found.length === 1 ? found[0] : undefined;
}

/** Validate the committed creation chain, including copied React element types. */
export function readStructuralAncestry(sources: Sources, pick: Selection) {
	retainedOwner(pick);
	try {
		return sourceRead(sources, pick, { kind: "delete" });
	} catch (error) {
		if (!(error instanceof StructuralShapeRefusal)) throw error;
		return undefined;
	}
}

/** Derive a delete unit from the complete committed provenance and captured source.
 * The source owner separately owns observation continuity, source transport and admission. */
export function deriveSourceDelete(sources: Sources, pick: Selection) {
	const originalTarget = readStructuralAncestry(sources, pick);
	const leaf = sources.creation(pick.source);
	const near = pick.chain.at(-1);
	let value = pick.values;
	let inputFromCall = false;
	if (!originalTarget && near && pick.values?.kind === "jsx") {
		const fn = sources.valueCallee(near.values?.type.origin.source ?? near.source).fn;
		const returned = fn.body.type === "BlockStatement" ? fn.body.body.at(-1) : undefined;
		const output = returned?.type === "ReturnStatement" ? returned.argument : fn.body;
		if (
			output?.start === leaf.node.start &&
			sources.valueCallee(near.values?.type.origin.source ?? near.source).unit.file === leaf.unit.file
		) {
			value = near.retainedProps ? near.renderedValues : near.values;
			inputFromCall = true;
		} else if (near.transportedFields?.length !== 1 || pick.values.type.origin.source !== pick.source) {
			throw new Error("selected node is neither a complete returned root nor the actual directly transported host");
		}
	}
	if (!value?.type.origin.source) throw new Error("missing actual element type ancestry");
	const directFactory = value.kind === "create" && value.type.origin.source === value.source;
	let selected = sources.creation(originalTarget?.source ?? value.type.origin.source);
	let role =
		originalTarget?.role ?? (selected.source === leaf.source ? ("definition" as const) : ("call-site" as const));
	let fallbackEffect: { source: string; value: string } | undefined;
	const steps: string[] = [`actual ${value.kind} element -> authored type source`];
	const carrier = inputFromCall ? pick.chain.at(-2) : pick.chain.at(-1);
	if (value.kind === "clone" || (value.kind === "create" && !directFactory)) {
		if (
			!carrier ||
			carrier.retainedProps ||
			carrier.transportedFields?.length !== 1 ||
			carrier.transportedFields[0] !== "children"
		)
			throw new Error("clone lacks unique committed carrier edge");
		const copy = sources.creation(value.source),
			fn = sources.valueCallee(carrier.source).fn;
		const call = body(fn);
		if (call?.type !== "CallExpression" || call.start !== copy.node.start)
			throw new Error("clone is not the complete carrier return");
		selected = sources.creation(carrier.source);
		role = "call-site";
		if (selected.node.type !== "JSXElement" || significant(selected.node).length !== 1)
			throw new Error("clone carrier does not own one complete input");
		steps.push(`verified sole ${value.kind} return -> complete carrier call; required input remains inside it`);
	}
	if (value.kind === "key") {
		if (carrier?.transportedFields?.[0] !== "children") throw new Error("array copy lacks committed children edge");
		const fn = sources.valueCallee(carrier.source).fn;
		const output = body(fn);
		if (output?.type !== "CallExpression" || output.start !== sources.creation(value.source).node.start)
			throw new Error("key copy is not the complete toArray return");
		steps.push("actual key-copy ancestry -> original child; preserve Children.toArray");
	}
	let node: Node = selected.node;
	let parent = selected.ancestors.at(-1);
	let replacement = "";
	if (parent?.type === "ObjectProperty") {
		const field = parent.key.type === "Identifier" ? parent.key.name : undefined;
		const config = selected.ancestors.at(-2),
			copy = selected.ancestors.at(-3);
		if (
			!field ||
			parent.computed ||
			config?.type !== "ObjectExpression" ||
			copy?.type !== "CallExpression" ||
			!carrier?.transportedFields?.includes(field) ||
			carrier.values?.kind !== "clone" ||
			sources.creation(carrier.values.source).node.start !== copy.start
		)
			throw new Error("replacement slot lacks actual clone configuration transport");

		replacement = "null";
		role = "definition";
		parent = copy;
		steps.push(
			"actual replacement field -> configuration JSX value; original supplied field remains untouched; definition scope",
		);
	} else if (parent?.type === "JSXExpressionContainer" && selected.ancestors.at(-2)?.type === "JSXAttribute") {
		const attr = selected.ancestors.at(-2);
		if (
			attr?.type !== "JSXAttribute" ||
			attr.name.type !== "JSXIdentifier" ||
			!carrier ||
			!carrier.transportedFields?.includes(attr.name.name)
		)
			throw new Error("named slot lacks committed field edge");
		const definition = sources.valueCallee(carrier.source),
			fn = definition.fn,
			b = body(fn);
		const local = slotLocal(fn, attr.name.name);
		const direct =
			(b?.type === "Identifier" && b.name === local) ||
			(b?.type === "JSXElement" &&
				b.children.some(
					(child) =>
						child.type === "JSXExpressionContainer" &&
						child.expression.type === "Identifier" &&
						child.expression.name === local,
				));
		const conditional =
			b?.type === "ConditionalExpression" && b.consequent.type === "Identifier" && b.alternate.type === "Identifier";
		const fallback = nullFallback(fn, attr.name.name);
		if (fallback?.loc && fallback.children.every((child) => child.type === "JSXText")) {
			fallbackEffect = {
				source: `${definition.unit.path}:${fallback.loc.start.line}:${fallback.loc.start.column + 1}`,
				value: fallback.children.map((child) => (child.type === "JSXText" ? child.value : "")).join(""),
			};
		}
		role = "call-site";
		if (!direct && !conditional && !fallback) throw new Error("named slot placement lacks a bounded operation proof");

		replacement = "null";
		steps.push(
			fallback
				? "candidate source removal: null supplied value, preserve authored fallback and other carrier output"
				: "replace only selected named field value with null; preserve slot and branch",
		);
		parent = sources.creation(carrier.source).node;
	} else if (parent?.type === "ConditionalExpression") {
		if (parent.test.start === node.start) throw new Error("selected expression is the condition");

		replacement = "null";
		steps.push("replace selected arm only; retain condition evaluation and inactive arm");
	} else if (parent?.type === "JSXExpressionContainer") {
		node = parent;
		parent = selected.ancestors.at(-2);
	}
	if (
		parent?.type !== "JSXElement" &&
		parent?.type !== "JSXFragment" &&
		!(parent?.type === "ConditionalExpression" || parent?.type === "CallExpression")
	)
		throw new Error("no complete authored structural parent");
	// Removing an unkeyed member can transfer positional state just like a swap.
	if (replacement === "" && (parent.type === "JSXElement" || parent.type === "JSXFragment")) {
		const siblings = significant(parent);
		if (siblings.length > 1) {
			const keys = siblings.map(key);
			if (new Set(keys).size !== keys.length) throw new Error("duplicate sibling keys");
		}
	}
	return {
		file: selected.unit.file,
		source: selected.source,
		role,
		...(fallbackEffect ? { fallback: fallbackEffect } : {}),
		selected: range(node),
		parent: range(parent),
		replacement,
		steps,
		text: selected.unit.text,
	};
}
export type SourceDeleteDerivation = ReturnType<typeof deriveSourceDelete>;
