// @vitest-environment happy-dom
import { expect, it, onTestFinished } from "vitest";
import { previewPropertyStyles, restorePropertyStyles } from "./source-property-preview";

const packet = { id: "installed", css: "original", bundledCss: "bundle" };
function fixture(generation: number) {
	document.head.innerHTML =
		'<style id="spool-compiled-css">original</style><style id="spool-bundled-css">bundle</style>';
	onTestFinished(() => restorePropertyStyles(generation));
	const compiled = document.getElementById("spool-compiled-css")!;
	const bundle = document.getElementById("spool-bundled-css")!;
	const plan = (revision: number, css: string) => ({
		generation,
		revision,
		value: "preview-class",
		frames: [{ publication: "installed", css, bundledCss: "bundle" }],
	});
	return { compiled, bundle, plan };
}

it("restores only owned CSS and refuses a delayed older preview", () => {
	const f = fixture(1);
	expect(previewPropertyStyles(f.plan(1, "first"), packet)).toBe(true);
	expect(previewPropertyStyles(f.plan(2, "second"), packet)).toBe(true);
	expect(previewPropertyStyles(f.plan(1, "late"), packet)).toBe(false);
	expect(f.compiled.textContent).toBe("second");
	restorePropertyStyles(1);
	expect(f.compiled.textContent).toBe("original");
});

it("preserves an outside stylesheet mutation and refuses another preview over it", () => {
	const f = fixture(2);
	expect(previewPropertyStyles(f.plan(1, "preview"), packet)).toBe(true);
	f.compiled.textContent = "outside";
	expect(previewPropertyStyles(f.plan(2, "later"), packet)).toBe(false);
	restorePropertyStyles(2);
	expect(f.compiled.textContent).toBe("outside");
	expect(f.bundle.textContent).toBe("bundle");
});

it("does not overwrite an outside stylesheet before the first preview", () => {
	const f = fixture(3);
	f.compiled.textContent = "outside";
	expect(previewPropertyStyles(f.plan(1, "preview"), packet)).toBe(false);
	expect(f.compiled.textContent).toBe("outside");
});

it.each(["before", "during"])("preserves outside CSSOM edits made %s preview", (when) => {
	const f = fixture(4);
	if (when === "during") expect(previewPropertyStyles(f.plan(1, "preview"), packet)).toBe(true);
	if (!(f.compiled instanceof HTMLStyleElement) || !f.compiled.sheet) throw new Error("missing live stylesheet");
	f.compiled.sheet.insertRule(".outside {color: red}", 0);
	expect(previewPropertyStyles(f.plan(2, "later"), packet)).toBe(false);
	restorePropertyStyles(4);
	expect([...f.compiled.sheet.cssRules].some((rule) => rule.cssText.includes(".outside"))).toBe(true);
});

function element(style: string) {
	document.body.innerHTML = `<b id="subject" style="${style}"></b>`;
	return document.getElementById("subject") as HTMLElement;
}

it("previews an inline member on the element and gives its own value back", () => {
	const f = fixture(5);
	const subject = element("padding: 40px; opacity: 0.75");
	const plan = (revision: number, opacity: string) => ({
		...f.plan(revision, "original"),
		inline: [
			{ property: "padding", value: "40px" },
			{ property: "opacity", value: opacity },
		],
	});
	expect(previewPropertyStyles(plan(1, "0.5"), packet, [subject])).toBe(true);
	expect(subject.style.opacity).toBe("0.5");
	expect(previewPropertyStyles(plan(2, "0.25"), packet, [subject])).toBe(true);
	expect(subject.style.opacity).toBe("0.25");
	restorePropertyStyles(5);
	expect([subject.style.padding, subject.style.opacity]).toEqual(["40px", "0.75"]);
});

it("removes the declaration a removed member carried, and puts it back", () => {
	const f = fixture(6);
	const subject = element("padding: 40px; opacity: 0.75");
	expect(
		previewPropertyStyles(
			{
				...f.plan(1, "original"),
				inline: [
					{ property: "padding", value: "40px" },
					{ property: "opacity", value: "" },
				],
			},
			packet,
			[subject],
		),
	).toBe(true);
	expect(subject.style.opacity).toBe("");
	restorePropertyStyles(6);
	expect(subject.style.opacity).toBe("0.75");
});

it("keeps an outside change to the same declaration and refuses to preview over it", () => {
	const f = fixture(7);
	const subject = element("opacity: 0.75");
	const plan = (revision: number, opacity: string) => ({
		...f.plan(revision, "original"),
		inline: [{ property: "opacity", value: opacity }],
	});
	expect(previewPropertyStyles(plan(1, "0.5"), packet, [subject])).toBe(true);
	subject.style.opacity = "0.9";
	expect(previewPropertyStyles(plan(2, "0.25"), packet, [subject])).toBe(false);
	restorePropertyStyles(7);
	expect(subject.style.opacity).toBe("0.9");
});
