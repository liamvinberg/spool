import type { NodePath } from "@babel/traverse";
import type { Node } from "@babel/types";

/** Only immutable lexical constants, literal branches and plain object members. */
export function targets(
	path: NodePath,
	seen = new Set<Node>(),
	inputs: Inputs = { values: new Map(), members: new Map() },
): TargetValues | undefined {
	if (seen.has(path.node)) return;
	const next = new Set(seen).add(path.node);
	if (path.isStringLiteral()) return [path.node.value];
	if (path.isNullLiteral()) return [];
	if (path.isTemplateLiteral() && path.node.expressions.length === 0) {
		const value = path.node.quasis[0]?.value.cooked;
		return value == null ? undefined : [value];
	}
	if (path.isTSAsExpression() || path.isTSSatisfiesExpression() || path.isTSNonNullExpression())
		return targets(path.get("expression") as NodePath, next, inputs);
	if (path.isConditionalExpression()) {
		const a = targets(path.get("consequent"), next, inputs);
		const b = targets(path.get("alternate"), next, inputs);
		return [...(a ?? [undefined]), ...(b ?? [undefined])];
	}
	if (path.isLogicalExpression()) {
		const b = targets(path.get("right"), next, inputs);
		if (path.node.operator === "&&") return b;
		const a = targets(path.get("left"), next, inputs);
		return [...(a ?? [undefined]), ...(b ?? [undefined])];
	}
	if (path.isIdentifier()) {
		const binding = path.scope.getBinding(path.node.name);
		if (binding === undefined && path.node.name === "undefined") return [];
		if (binding !== undefined && inputs.values.has(binding.identifier)) return inputs.values.get(binding.identifier);
		if (binding?.constant !== true || binding.kind !== "const" || !binding.path.isVariableDeclarator()) return;
		const init = binding.path.get("init");
		return init.node == null ? undefined : targets(init as NodePath, next, inputs);
	}
	if (path.isMemberExpression() && !path.node.computed) {
		const object = path.get("object");
		const property = path.get("property");
		if (!object.isIdentifier() || !property.isIdentifier()) return;
		const binding = object.scope.getBinding(object.node.name);
		if (binding !== undefined && inputs.members.has(binding.identifier))
			return (
				inputs.members.get(binding.identifier)?.get(property.node.name) ??
				inputs.members.get(binding.identifier)?.get("*") ??
				[]
			);
		if (binding?.constant !== true || binding.kind !== "const" || !binding.path.isVariableDeclarator()) return;
		if (
			binding.referencePaths.some((reference) => {
				const member = reference.parentPath;
				if (!member?.isMemberExpression() || reference.key !== "object") return true;
				const use = member.parentPath;
				return (
					(use.isAssignmentExpression() && member.key === "left") ||
					use.isUpdateExpression() ||
					(use.isUnaryExpression() && use.node.operator === "delete")
				);
			})
		)
			return;
		let init = binding.path.get("init") as NodePath;
		while (init.isTSAsExpression() || init.isTSSatisfiesExpression()) init = init.get("expression") as NodePath;
		if (!init.isObjectExpression()) return;
		const keys = new Set<string>();
		for (const prop of init.get("properties")) {
			if (!prop.isObjectProperty() || prop.node.computed || keys.has(spelling(prop.node.key))) return;
			keys.add(spelling(prop.node.key));
		}
		for (const prop of init.get("properties"))
			if (prop.isObjectProperty() && !prop.node.computed && spelling(prop.node.key) === property.node.name)
				return targets(prop.get("value"), next, inputs);
	}
	return undefined;
}

type TargetValues = (string | undefined)[];
interface Inputs {
	values: Map<Node, TargetValues>;
	members: Map<Node, Map<string, TargetValues>>;
}

/** One direct JSX prop boundary. Further forwarding remains an explicit declaration. */
export function componentInputs(mounts: { component: NodePath; attributes: NodePath[] }[]): Inputs {
	const inputs: Inputs = { values: new Map(), members: new Map() };
	for (const mount of mounts) {
		let component = mount.component;
		const seen = new Set<Node>();
		while (!seen.has(component.node)) {
			seen.add(component.node);
			if (component.isIdentifier()) {
				const bound = component.scope.getBinding(component.node.name)?.path;
				if (bound === undefined) break;
				component = bound;
			} else if (component.isVariableDeclarator() && component.get("init").node != null)
				component = component.get("init") as NodePath;
			else break;
		}
		if (!component.isFunction()) continue;
		const parameter = component.get("params")[0];
		if (parameter === undefined) continue;
		const props = new Map<string, TargetValues>();
		const spread = mount.attributes.some((attribute) => attribute.isJSXSpreadAttribute());
		if (spread) props.set("*", [undefined]);
		for (const attribute of mount.attributes) {
			if (!attribute.isJSXAttribute() || !attribute.get("name").isJSXIdentifier()) continue;
			const name = attribute.node.name.type === "JSXIdentifier" ? attribute.node.name.name : "";
			const value = attribute.get("value");
			props.set(
				name,
				spread || value.node == null
					? [undefined]
					: (targets(value.isJSXExpressionContainer() ? value.get("expression") : (value as NodePath)) ?? [
							undefined,
						]),
			);
		}
		if (parameter.isObjectPattern()) {
			for (const property of parameter.get("properties")) {
				if (!property.isObjectProperty() || property.node.computed) continue;
				const value = property.get("value");
				if (!value.isIdentifier()) continue;
				const binding = component.scope.getBinding(value.node.name);
				if (binding === undefined) continue;
				inputs.values.set(binding.identifier, [
					...(inputs.values.get(binding.identifier) ?? []),
					...(props.get(spelling(property.node.key)) ?? (spread ? [undefined] : [])),
				]);
			}
		} else if (parameter.isIdentifier()) {
			const binding = component.scope.getBinding(parameter.node.name);
			if (binding === undefined) continue;
			const known = inputs.members.get(binding.identifier);
			if (known === undefined) inputs.members.set(binding.identifier, props);
			else {
				for (const name of new Set([...known.keys(), ...props.keys()]))
					known.set(name, [
						...(known.get(name) ?? known.get("*") ?? []),
						...(props.get(name) ?? props.get("*") ?? []),
					]);
			}
		}
	}
	return inputs;
}

function spelling(node: Node): string {
	return node.type === "Identifier" ? node.name : node.type === "StringLiteral" ? node.value : "";
}
