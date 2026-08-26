import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile } from "../test-helpers";
import { compileClasses, readTheme, type ThemeToken } from "./theme";

/**
 * The compiled theme (#257): what a properties menu is allowed to say.
 *
 * Every assertion here is about one lie the rail must not tell — that this
 * project's `text-base` is Tailwind's, that a token nobody used does not
 * exist, or that a class compiles when the compiler says otherwise.
 */

const tokens = `@theme {
  --color-thread: #F5391A;
  --color-bg: #0E0E0E;
  --text-base: 13px;
  --text-md: 14px;
  --radius-lg: 12px;
  --breakpoint-app: 1280px;
  --font-weight-regular: 400;
  --leading-base: 20px;
  --tracking-tight: -0.01em;
}
`;

function project(tokensCss = tokens): string {
	const { root } = makeProject(join(makeTempDir(), ".spool"));
	writeDesignFile(root, "shared/tokens.css", tokensCss);
	return root;
}

function named(list: readonly ThemeToken[], name: string): ThemeToken | undefined {
	return list.find((token) => token.name === name);
}

describe("the compiled theme", () => {
	it("reads the project's own tokens, and puts them before Tailwind's", async () => {
		const theme = await readTheme(project());

		expect(named(theme.colour, "thread")).toEqual({ name: "thread", value: "#F5391A", from: "project" });
		expect(theme.colour.slice(0, 2).map((token) => token.name)).toEqual(["thread", "bg"]);
		// Tailwind's palette is still offered, under the divider a `default` marks
		expect(named(theme.colour, "red-500")?.from).toBe("default");
		expect(theme.colour.findIndex((token) => token.from === "default")).toBe(2);
	});

	it("reads a token no frame has used yet", async () => {
		// nothing in this project wears `rounded-lg`, and a menu that only listed
		// what the built stylesheet carried would leave it out
		const theme = await readTheme(project());

		expect(named(theme.radius, "lg")).toEqual({ name: "lg", value: "12px", from: "project" });
	});

	it("says the project's value where the project overrode Tailwind's", async () => {
		const theme = await readTheme(project());

		expect(named(theme.text, "base")).toEqual({ name: "base", value: "13px", from: "project" });
		expect(named(theme.text, "xl")?.from).toBe("default");
		expect(named(theme.screen, "app")).toEqual({ name: "app", value: "1280px", from: "project" });
		expect(named(theme.screen, "md")?.from).toBe("default");
	});

	it("carries every list a menu offers, and the scale a number box steps by", async () => {
		const theme = await readTheme(project());

		expect(named(theme.weight, "regular")?.from).toBe("project");
		expect(named(theme.leading, "base")?.value).toBe("20px");
		expect(named(theme.tracking, "tight")?.value).toBe("-0.01em");
		expect(named(theme.shadow, "md")?.from).toBe("default");
		expect(named(theme.ease, "out")?.from).toBe("default");
		expect(named(theme.font, "sans")?.from).toBe("default");
		// `--text-lg--line-height` is the size's paired leading, not a size, and
		// `--text-shadow-sm` is a shadow behind text rather than a size called
		// `shadow-sm`: neither is a font size the menu should offer
		expect(theme.text.some((token) => token.name.includes("-line-height"))).toBe(false);
		expect(theme.text.map((token) => token.name)).not.toContain("shadow-sm");
		expect(theme.text.every((token) => /^\d|^[a-z0-9]+$/.test(token.name))).toBe(true);
		expect(theme.step).toBe(4);
	});

	it("follows a project that clears Tailwind's palette", async () => {
		const theme = await readTheme(project(`@theme {\n  --color-*: initial;\n  --color-ink: #111;\n}\n`));

		expect(theme.colour.map((token) => token.name)).toEqual(["ink"]);
	});

	it("follows a tokens.css that changed underneath", async () => {
		const root = project();
		expect(named((await readTheme(root)).colour, "thread")?.value).toBe("#F5391A");

		writeDesignFile(root, "shared/tokens.css", tokens.replace("#F5391A", "#00FF00"));

		expect(named((await readTheme(root)).colour, "thread")?.value).toBe("#00FF00");
	});

	it("reads a scale a project set to something other than four", async () => {
		const theme = await readTheme(project(`@theme {\n  --spacing: 8px;\n}\n`));

		expect(theme.step).toBe(8);
	});
});

describe("the compiler as the gate", () => {
	it("lands what compiles, with the CSS it compiles to", async () => {
		const [thread, arbitrary, screen, weighty] = await compileClasses(project(), [
			"bg-thread/50",
			"[mask-type:luminance]",
			"app:hidden",
			"mt-3.5!",
		]);

		expect(thread?.ok).toBe(true);
		expect(thread?.ok === true ? thread.css : "").toContain("--color-thread");
		expect(arbitrary?.ok === true ? arbitrary.css : "").toContain("mask-type: luminance");
		// the project's own breakpoint is a variant, because the compiler says so
		expect(screen?.ok).toBe(true);
		expect(weighty?.ok === true ? weighty.css : "").toContain("!important");
	});

	it("refuses with the reason, per what is wrong with the class", async () => {
		const [utility, variant, image, several] = await compileClasses(project(), [
			"foo-bar",
			"flurb:hidden",
			"bg-[url(cat.png)]",
			"flex gap-2",
		]);

		expect(utility).toEqual({ ok: false, token: "foo-bar", reason: "no utility foo-bar" });
		expect(variant).toEqual({ ok: false, token: "flurb:hidden", reason: "no variant flurb:" });
		expect(image?.ok === false ? image.reason : "").toBe("an image is an import, not a class");
		expect(several?.ok === false ? several.reason : "").toBe("one class at a time");
	});

	it("refuses a colour this project does not have, and takes the one it does", async () => {
		const [gone, here] = await compileClasses(project(), ["bg-thredd", "bg-bg"]);

		expect(gone?.ok).toBe(false);
		expect(here?.ok).toBe(true);
	});
});
