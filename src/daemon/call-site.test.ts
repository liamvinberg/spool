import { describe, expect, it } from "vitest";
import { callSiteLabel } from "./call-site";

/**
 * The call-site label (#37): siblings sharing a stamp collapse into one row,
 * and the row's name is the call that repeats them — read straight out of the
 * stamped source, never guessed from the DOM.
 */

describe("callSiteLabel", () => {
	it("names a multiline map call from the stamped element", () => {
		const source = [
			"export default function Cart() {",
			"\treturn (",
			"\t\t<div>",
			"\t\t\t{cart.map((item) => (",
			'\t\t\t\t<div className="row">{item.name}</div>',
			"\t\t\t))}",
			"\t\t</div>",
			"\t);",
			"}",
		].join("\n");

		expect(callSiteLabel(source, 5, 5)).toBe("cart.map(…)");
	});

	it("names an inline map with unparenthesized arrow params", () => {
		const source = "const List = () => <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>;\n";

		expect(callSiteLabel(source, 1, 43)).toBe("items.map(…)");
	});

	it("keeps the whole property chain", () => {
		const source = ["<div>", "\t{data.rows.flatMap((row) => (", "\t\t<span>{row}</span>", "\t))}", "</div>"].join(
			"\n",
		);

		expect(callSiteLabel(source, 3, 3)).toBe("data.rows.flatMap(…)");
	});

	it("answers nothing for an element outside any call", () => {
		const source = ["<main>", '\t<div className="row">x</div>', "</main>"].join("\n");

		expect(callSiteLabel(source, 2, 2)).toBeUndefined();
	});

	it("answers nothing when the stamp no longer lands on an element", () => {
		const source = "const x = 1;\n";

		expect(callSiteLabel(source, 1, 1)).toBeUndefined();
	});
});
