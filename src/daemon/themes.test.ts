import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rebaseThemeUrls } from "./themes";

const shared = join("/p", "design", "shared");
const file = join(shared, "ui", "paper", "theme.css");

describe("rebaseThemeUrls", () => {
	it("rebases a relative url from the theme's folder to shared/", () => {
		expect(rebaseThemeUrls('src: url("./fonts/serif.woff2");', file, shared)).toBe(
			'src: url("ui/paper/fonts/serif.woff2");',
		);
	});

	it("leaves a quoted data URI whole, a url() inside it included", () => {
		const css = `background: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence/></filter><rect filter='url(%23n)'/></svg>");`;
		expect(rebaseThemeUrls(css, file, shared)).toBe(css);
	});

	it("leaves a single-quoted data URI whole", () => {
		const css = `background: url('data:image/svg+xml,<svg><rect filter="url(%23n)"/></svg>');`;
		expect(rebaseThemeUrls(css, file, shared)).toBe(css);
	});
});
