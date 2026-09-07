import { createHash } from "node:crypto";

export function observeReactValues(original: string): string {
	let contents = original;
	const consumed = true;
	if (
		createHash("sha256").update(contents).digest("hex") !==
		"66fa8fc8149e02f61dd5f26e3d0ea7bd03bac64a52d15601019f50a61260a115"
	)
		throw new Error("value taps require exact pinned React bytes");
	const replace = (before: string, after: string) => {
		if (contents.split(before).length !== 2) throw new Error("React value tap anchor is not unique");
		contents = contents.replace(before, after);
	};
	replace(
		"return ReactElement(oldElement.type, newKey, oldElement.props);",
		'return globalThis.__SPOOL_VALUES__ ? globalThis.__SPOOL_VALUES__.created(ReactElement(oldElement.type, newKey, oldElement.props), "key", oldElement, [], true) : ReactElement(oldElement.type, newKey, oldElement.props);',
	);
	if (consumed) {
		replace(
			"function lazyInitializer(payload) {",
			"function lazyInitializer(payload) { globalThis.__SPOOL_CONSUMED__?.begin(payload);",
		);
		replace(
			"if (1 === payload._status) return payload._result.default;",
			"if (1 === payload._status) return globalThis.__SPOOL_CONSUMED__ ? globalThis.__SPOOL_CONSUMED__.consume(payload._result,payload) : payload._result.default;",
		);
		contents = "globalThis.__SPOOL_CONSUMED_ENABLED__=true;\n" + contents;
	}
	const begin = contents.indexOf("exports.cloneElement = function");
	const end = contents.indexOf("exports.createContext =", begin);
	let clone = contents.slice(begin, end);
	clone = clone.replace(
		"var props = assign",
		"var __handReplaced = [], __handKeyReplaced = false;\n  var props = assign",
	);
	clone = clone.replace('(key = "" + config.key)', '(key = "" + config.key, __handKeyReplaced = true)');
	clone = clone.replace(
		"(props[propName] = config[propName]);",
		"(props[propName] = config[propName], __handReplaced.push(propName));",
	);
	clone = clone.replace(
		"if (1 === propName) props.children = children;",
		'if (1 === propName) { props.children = children; __handReplaced.push("children"); }',
	);
	clone = clone.replace(
		"props.children = childArray;",
		'props.children = childArray; __handReplaced.push("children");',
	);
	clone = clone.replace(
		"return ReactElement(element.type, key, props);",
		'return globalThis.__SPOOL_VALUES__ ? globalThis.__SPOOL_VALUES__.created(ReactElement(element.type, key, props), "clone", element, __handReplaced, __handKeyReplaced) : ReactElement(element.type, key, props);',
	);
	contents = contents.slice(0, begin) + clone + contents.slice(end);
	replace(
		"return ReactElement(type, key, props);",
		'return globalThis.__SPOOL_VALUES__ ? globalThis.__SPOOL_VALUES__.created(ReactElement(type, key, props), "create") : ReactElement(type, key, props);',
	);
	return contents;
}
