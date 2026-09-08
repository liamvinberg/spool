import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { readInput } from "./retained-compile";
import { compileImageChange } from "./source-image-plan";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"/>';

it("preflights a precise image import against frozen inputs without source writes or publication authority", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/assets/first.svg", SVG);
	writeDesignFile(root, "shared/assets/second.svg", SVG.replace('width="3"', 'width="7"'));
	const source =
		'import picture from "shared/assets/first.svg"; export default function Frame(){return <img src={picture}/>}';
	writeFrame(root, "home", source);
	const compiler = createFrameCompiler("test");
	const document = await compiler.getDocument(root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const original = id ? compiler.publication(id)?.compilation : undefined;
	if (!original) throw new Error("missing original publication");
	const file = realpathSync(join(root, "design/frames/home/frame.tsx"));
	const asset = realpathSync(join(root, "design/shared/assets/second.svg"));
	const next = source.replace("shared/assets/first.svg", "../../shared/assets/second.svg");
	const snapshot = await compileImageChange(compiler, root, "home", original, file, next, {
		file: asset,
		input: readInput(asset),
	});
	expect(readFileSync(file, "utf8")).toBe(source);
	expect(compiler.publication(snapshot.packet.id)).toBeUndefined();
	expect(snapshot.packet.shape).toBe(original.packet.shape);
	expect(Object.values(snapshot.cells).find((cell) => cell.image)?.value).toBe(
		`data:image/svg+xml;base64,${readFileSync(asset).toString("base64")}`,
	);
	const changedCode = next.replace("return <img", "console.log('new executable');return <img");
	await expect(
		compileImageChange(compiler, root, "home", original, file, changedCode, { file: asset, input: readInput(asset) }),
	).rejects.toThrow("executable shape");
	await expect(
		compileImageChange(compiler, root, "home", original, file, next.replace("second.svg", "first.svg"), {
			file: asset,
			input: readInput(asset),
		}),
	).rejects.toThrow("image resolution");
	const staged = readInput(asset);
	writeFileSync(asset, SVG.replace('width="3"', 'width="9"'));
	await expect(
		compileImageChange(compiler, root, "home", original, file, next, { file: asset, input: staged }),
	).rejects.toThrow("staged image bytes changed");
	expect(readFileSync(file, "utf8")).toBe(source);
});

it("checks the whole shared image closure budget before a source import can change", async () => {
	const { root } = makeProject(makeTempDir());
	const large = SVG + " ".repeat(230_000);
	writeDesignFile(root, "shared/assets/first.svg", SVG);
	writeDesignFile(root, "shared/assets/second.svg", large);
	writeDesignFile(root, "shared/assets/other.svg", large);
	writeDesignFile(
		root,
		"shared/other.tsx",
		'import image from "./assets/other.svg"; export function Other(){return <img src={image}/>}',
	);
	const source =
		'import picture from "shared/assets/first.svg"; import {Other} from "shared/other"; export default function Frame(){return <><Other/><img src={picture}/></>}';
	writeFrame(root, "home", source);
	const compiler = createFrameCompiler("test");
	const document = await compiler.getDocument(root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const original = id ? compiler.publication(id)?.compilation : undefined;
	if (!original) throw new Error("missing original publication");
	const file = realpathSync(join(root, "design/frames/home/frame.tsx"));
	const asset = realpathSync(join(root, "design/shared/assets/second.svg"));
	const next = source.replace("shared/assets/first.svg", "../../shared/assets/second.svg");
	await expect(
		compileImageChange(compiler, root, "home", original, file, next, { file: asset, input: readInput(asset) }),
	).rejects.toThrow("budget");
	expect(readFileSync(file, "utf8")).toBe(source);
	expect(readFileSync(asset, "utf8")).toBe(large);
});
