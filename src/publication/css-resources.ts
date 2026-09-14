/** Resource tokens only: comments and ordinary quoted declaration values are opaque. */
export function mapCssResources(css: string, map: (value: string, imported: boolean) => string): string {
	let result = "";
	let at = 0;
	while (at < css.length) {
		if (css.startsWith("/*", at)) {
			const end = css.indexOf("*/", at + 2);
			if (end < 0) throw new Error("Unclosed CSS comment.");
			at = end + 2;
			continue;
		}
		const rest = css.slice(at);
		const imported = /^@import\s+/i.exec(rest);
		const url = /^url\(\s*/i.exec(rest);
		if (imported !== null || url !== null) {
			const prefix = imported?.[0] ?? url?.[0] ?? "";
			let start = at + prefix.length;
			if (imported !== null && /^url\(/i.test(css.slice(start))) {
				const nested = /^url\(\s*/i.exec(css.slice(start));
				start += nested?.[0].length ?? 0;
			}
			const quote = css[start];
			const quoted = quote === '"' || quote === "'";
			let end = quoted ? start + 1 : start;
			while (end < css.length && (quoted ? css[end] !== quote : !/[\s)]/.test(css[end] ?? ""))) {
				if (css[end] === "\\") throw new Error("Escaped CSS resource URLs cannot be exported. Use a literal URL.");
				end++;
			}
			if (end >= css.length) throw new Error("Unclosed CSS resource URL.");
			const value = css.slice(start + (quoted ? 1 : 0), end);
			const target = map(value, imported !== null);
			let next = end + (quoted ? 1 : 0);
			const hasUrl = url !== null || /^url\(/i.test(css.slice(at + prefix.length));
			if (hasUrl) {
				while (/\s/.test(css[next] ?? "")) next++;
				if (css[next] !== ")") throw new Error("Invalid CSS resource URL.");
				next++;
			}
			result += imported === null ? `url(${JSON.stringify(target)})` : `@import ${JSON.stringify(target)}`;
			at = next;
			continue;
		}
		const quote = css[at];
		if (quote === '"' || quote === "'") {
			let end = at + 1;
			while (end < css.length) {
				if (css[end] === "\\") end += 2;
				else if (css[end++] === quote) break;
			}
			result += css.slice(at, end);
			at = end;
		} else {
			result += css[at];
			at++;
		}
	}
	return result;
}
