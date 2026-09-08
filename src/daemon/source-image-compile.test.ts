import { expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createFrameCompiler } from "./compile";
import { lowerLiterals } from "./retained-compile";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"><path fill="red" d="M0 0h3v2H0z"/></svg>';

it("captures the imported image bytes in its retained source cell", async () => {
	const { root } = makeProject(makeTempDir());
	writeDesignFile(root, "shared/assets/red.svg", SVG);
	writeFrame(
		root,
		"home",
		'import picture from "shared/assets/red.svg"; export default function Frame(){return <img src={picture} alt="red"/>}',
	);
	const compiler = createFrameCompiler("test");
	const document = await compiler.getDocument(root, "home", {
		projectCapability: "test",
		controlOrigin: "http://localhost",
	});
	if (document.kind !== "ok") throw new Error(document.message);
	const id = /configureSource\(\{"id":"([^"]+)"/.exec(document.document)?.[1];
	const compilation = id ? compiler.publication(id)?.compilation : undefined;
	if (!compilation) throw new Error("no immutable publication");
	const entry = Object.entries(compilation.cells).find(([, cell]) => cell.field === "src");
	expect(entry).toBeDefined();
	if (!entry) throw new Error("no retained image");
	expect(entry[1].value).toBe(`data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`);
	expect(compilation.packet.values[entry[0]]).toBe(entry[1].value);
	expect(compilation.packet.attributes?.[entry[0].split("@")[0]!]?.src).toEqual({ cell: entry[0], absent: false });
});

it("keeps an image-only import replacement out of executable shape and preserves other consumers", () => {
	const before =
		'import first from "./first.svg"; export default function Frame(){return <main><img src={first}/><img src={first}/></main>}';
	const after =
		'import first from "./first.svg"; import second from "./second.svg"; export default function Frame(){return <main><img src={second}/><img src={first}/></main>}';
	expect(lowerLiterals("frame.tsx", before).shape).toBe(lowerLiterals("frame.tsx", after).shape);
	const other =
		'import first from "./first.svg"; export const untouched = first; export default function Frame(){return <img src={first}/>}';
	const replaced =
		'import first from "./first.svg"; import second from "./second.svg"; export const untouched = first; export default function Frame(){return <img src={second}/>}';
	expect(lowerLiterals("frame.tsx", other).shape).toBe(lowerLiterals("frame.tsx", replaced).shape);
	expect(lowerLiterals("frame.tsx", other).shape).not.toBe(
		lowerLiterals("frame.tsx", other.replace('"./first.svg"', '"./changed.svg"')).shape,
	);
});

it("keeps computed and shadowed bindings executable and gives empty images a retained field", () => {
	const computed = 'import image from "./a.svg"; export default function Frame(){return <img src={choose(image)}/>}';
	expect(Object.values(lowerLiterals("frame.tsx", computed).cells).some((cell) => cell.image)).toBe(false);
	expect(lowerLiterals("frame.tsx", computed).shape).not.toBe(
		lowerLiterals("frame.tsx", computed.replace("a.svg", "b.svg")).shape,
	);
	const shadowed = 'import image from "./a.svg"; export default function Frame({image}){return <img src={image}/>}';
	expect(Object.values(lowerLiterals("frame.tsx", shadowed).cells).some((cell) => cell.image)).toBe(false);
	const empty = lowerLiterals("frame.tsx", "export default function Frame(){return <img/>}");
	expect(Object.values(empty.cells).find((cell) => cell.field === "src")).toMatchObject({
		image: {},
		value: "",
		absent: true,
	});
	expect(empty.shape).toBe(
		lowerLiterals(
			"frame.tsx",
			'import image from "./a.svg"; export default function Frame(){return <img src={image}/>}',
		).shape,
	);
});
