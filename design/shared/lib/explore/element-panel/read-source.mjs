// Prototype, throwaway (spool-cloud#188). Reads the landing's TSX the way the
// write lane would, so the panel's refusals are the file's, not invented.
// Run from the spool checkout: node design/shared/lib/explore/element-panel/read-source.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "@babel/parser";

const DESIGN = "design";
const ROOTS = ["design/shared/ui/site/current", "design/frames/site/landing-current"];
const OUT = "design/shared/lib/explore/element-panel/landing-source.json";

const files = [];
const walk = (dir) => {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path);
		else if (path.endsWith(".tsx")) files.push(path);
	}
};
for (const root of ROOTS) walk(root);

const tagOf = (name) =>
	name.type === "JSXIdentifier"
		? name.name
		: name.type === "JSXMemberExpression"
			? `${tagOf(name.object)}.${name.property.name}`
			: `${name.namespace.name}:${name.name.name}`;

const elements = {};
for (const path of files) {
	const text = readFileSync(path, "utf8");
	const rel = relative(DESIGN, path);
	const ast = parse(text, { sourceType: "module", plugins: ["typescript", "jsx"] });
	const code = (node) => text.slice(node.start, node.end).replace(/\s+/g, " ");

	const visit = (node, parents) => {
		if (node === null || typeof node !== "object") return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child, parents);
			return;
		}
		if (typeof node.type !== "string") return;
		if (node.type === "JSXElement") record(node, parents);
		const next = [...parents, node];
		for (const key of Object.keys(node)) {
			if (key === "loc" || key === "start" || key === "end" || key === "extra") continue;
			visit(node[key], next);
		}
	};

	const record = (node, parents) => {
		const open = node.openingElement;
		const tag = tagOf(open.name);
		const intrinsic = /^[a-z]/.test(tag);
		const key = `${rel}:${open.loc.start.line}:${open.loc.start.column}`;
		// the nearest JSX element above, and whether anything but JSX stands between
		let parentKey = null;
		let through = null;
		for (let i = parents.length - 1; i >= 0; i -= 1) {
			const up = parents[i];
			if (up.type === "JSXElement") {
				parentKey = `${rel}:${up.openingElement.loc.start.line}:${up.openingElement.loc.start.column}`;
				break;
			}
			if (up.type === "JSXFragment" || up.type === "JSXExpressionContainer") continue;
			if (through === null && up.type !== "ParenthesizedExpression") through = up;
		}
		let place = "jsx";
		let rows = null;
		if (through !== null) {
			const fn = parents.findLast((up) => up.type === "ArrowFunctionExpression" || up.type === "FunctionExpression");
			const call = fn === undefined ? undefined : parents[parents.indexOf(fn) - 1];
			const mapped =
				call?.type === "CallExpression" &&
				call.callee.type === "MemberExpression" &&
				call.callee.property.name === "map" &&
				parents.indexOf(fn) > parents.findLastIndex((up) => up.type === "JSXElement");
			if (mapped) {
				const over = call.callee.object;
				const bare = over.type === "TSAsExpression" ? over.expression : over;
				place = "row";
				rows = { over: code(bare), literal: bare.type === "ArrayExpression" };
			} else if (parentKey === null) place = "return";
			else place = "expression";
		}
		const children = [];
		for (const child of node.children) {
			if (child.type === "JSXText") {
				if (child.value.trim() !== "") children.push({ t: "text", v: child.value.replace(/\s+/g, " ").trim() });
			} else if (child.type === "JSXExpressionContainer") {
				if (child.expression.type === "JSXEmptyExpression") continue;
				if (child.expression.type === "StringLiteral") children.push({ t: "text", v: child.expression.value });
				else children.push({ t: "expr", code: code(child.expression) });
			} else children.push({ t: "el" });
		}
		const props = {};
		if (!intrinsic)
			for (const attribute of open.attributes) {
				if (attribute.type !== "JSXAttribute") continue;
				const value = attribute.value;
				const name = attribute.name.name;
				if (value === null) props[name] = { lit: "true" };
				else if (value.type === "StringLiteral") props[name] = { lit: value.value };
				else if (value.type === "JSXExpressionContainer")
					props[name] =
						value.expression.type === "StringLiteral" ? { lit: value.expression.value } : { expr: code(value.expression) };
			}
		elements[key] = { tag, intrinsic, parentKey, place, rows, children, props };
	};

	visit(ast.program, []);
}

// every file here is reached by both landing frames, and by nothing else
const reach = ["site/landing-current", "site/landing-current--mobile"];
writeFileSync(OUT, `${JSON.stringify({ reach, elements })}\n`);
console.log(`${Object.keys(elements).length} elements from ${files.length} files`);
