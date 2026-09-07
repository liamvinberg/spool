import { type File, getBindingIdentifiers, type Node } from "@babel/types";

interface Module {
	file: string;
	ast: File;
}
export type Binding<U extends Module> =
	| { unit: U; kind: "local"; name: string }
	| { unit: U; kind: "namespace" }
	| { unit: U; kind: "default"; node: Node };
type Resolution<U extends Module> = Binding<U> | "ambiguous" | null;

// Resolve binding identity before following the value of a local const. Two
// consts holding the same function are still different star-export bindings.
// ResolveExport's cycle sentinel is absence on that route, not a graph error.
export class ModuleBindings<U extends Module> {
	constructor(private readonly resolve: (unit: U, specifier: string) => U) {}
	local(unit: U, name: string, seen = new Set<string>()): Resolution<U> {
		for (const statement of unit.ast.program.body) {
			if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue;
			const imported = statement.specifiers.find((binding) => binding.local.name === name);
			if (!imported || (imported.type === "ImportSpecifier" && imported.importKind === "type")) continue;
			const dependency = this.resolve(unit, statement.source.value);
			if (imported.type === "ImportNamespaceSpecifier") return { unit: dependency, kind: "namespace" };
			return this.exported(
				dependency,
				imported.type === "ImportDefaultSpecifier"
					? "default"
					: imported.imported.type === "Identifier"
						? imported.imported.name
						: imported.imported.value,
				seen,
			);
		}
		return { unit, kind: "local", name };
	}
	exported(unit: U, name: string, seen = new Set<string>()): Resolution<U> {
		const key = `${unit.file}:export:${name}`;
		if (seen.has(key)) return null;
		seen.add(key);
		for (const statement of unit.ast.program.body) {
			if (statement.type === "ExportDefaultDeclaration" && name === "default") {
				const node = statement.declaration;
				return (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id
					? { unit, kind: "local", name: node.id.name }
					: { unit, kind: "default", node };
			}
			if (statement.type !== "ExportNamedDeclaration" || statement.exportKind === "type") continue;
			if (statement.declaration && getBindingIdentifiers(statement.declaration)[name])
				return this.local(unit, name, seen);
			for (const specifier of statement.specifiers) {
				const exported =
					specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value;
				if (exported !== name) continue;
				if (specifier.type === "ExportNamespaceSpecifier" && statement.source)
					return { unit: this.resolve(unit, statement.source.value), kind: "namespace" };
				if (specifier.type !== "ExportSpecifier" || specifier.exportKind === "type") continue;
				return statement.source
					? this.exported(this.resolve(unit, statement.source.value), specifier.local.name, seen)
					: this.local(unit, specifier.local.name, seen);
			}
		}
		if (name === "default") return null;
		let found: Resolution<U> = null;
		for (const statement of unit.ast.program.body) {
			if (statement.type !== "ExportAllDeclaration" || statement.exportKind === "type") continue;
			const candidate = this.exported(this.resolve(unit, statement.source.value), name, seen);
			if (candidate === "ambiguous") return candidate;
			if (!candidate) continue;
			if (found && this.identity(found) !== this.identity(candidate)) return "ambiguous";
			found = candidate;
		}
		return found;
	}
	require(binding: Resolution<U>): Binding<U> {
		if (binding === "ambiguous") throw new Error("ambiguous export binding");
		if (!binding) throw new Error("unresolved export binding (cycles and stars never supply a default)");
		return binding;
	}
	private identity(binding: Binding<U>): string {
		return `${binding.unit.file}:${binding.kind}:${binding.kind === "local" ? binding.name : ""}`;
	}
}
