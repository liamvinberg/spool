import { parse } from "@babel/parser";
import { expect, it } from "vitest";
import { installConsumed } from "../runtime/source-consumed";
import { installLazyWitness } from "../runtime/source-lazy";
import { rewriteConsumed } from "./source-consumed-compile";

function evaluate(source: string, transformed: boolean) {
	installLazyWitness();
	installConsumed();
	let code = transformed ? rewriteConsumed(source) : source;
	const names: string[] = [],
		values: unknown[] = [];
	const imports = parse(code, { sourceType: "module" }).program.body.filter(
		(node) => node.type === "ImportDeclaration",
	);
	for (const statement of imports) {
		for (const spec of statement.specifiers) {
			if (spec.type !== "ImportSpecifier") throw new Error("unexpected import");
			names.push(spec.local.name);
			values.push(globalThis.__SPOOL_CONSUMED__);
		}
	}
	for (const statement of imports.reverse()) code = code.slice(0, statement.start!) + code.slice(statement.end!);
	return Function(...names, `${code};return run();`)(...values);
}
it.each([
	'function pick(Reflect){return Reflect.get({x:"wrong"},"x");} function run(){return pick({get(){return "authored"}})}',
	'function pick(globalThis){return globalThis.label;} function run(){return pick({label:"authored"})}',
	'function run(){let count=0;const Reflect={get get(){count++;return function(...args){return [count,this===Reflect,args]}}};return Reflect.get({x:"value"},"x")}',
	'function run(){const order=[];const Reflect={get get(){order.push("callee");return function(value,key){order.push("call");return order}}};return Reflect.get((order.push("first"),{}),(order.push("second"),"x"))}',
])("preserves executed member/call semantics and lexical bindings: %s", (source) => {
	expect(evaluate(source, true)).toEqual(evaluate(source, false));
});
