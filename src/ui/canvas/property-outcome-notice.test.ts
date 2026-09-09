import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HandNotice } from "./hand-notice";

it.each([
	{ status: "inactive", title: "Saved · scope inactive" },
	{ status: "constrained", title: "Saved · result constrained" },
] as const)("discloses a saved $status result without claiming verification", ({ status, title }) => {
	const output = renderToStaticMarkup(
		createElement(HandNotice, {
			said: {
				kind: "source",
				frame: "home",
				status,
				text: "opacity-50",
				says: "The native context determines this result.",
			},
			onDismiss() {},
		}),
	);
	expect(output).toContain(title);
	expect(output).toContain(`data-hand-notice="${status}"`);
	expect(output).not.toContain("result unverified");
});
