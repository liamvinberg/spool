import { join } from "node:path";
import { frameFolder } from "../page-path";
import { designPathResolver, designRelativePath } from "./design-boundary";
import { buildDesignEntry, type CompileHost, cssSources } from "./design-compile";
import type { DesignReads } from "./design-reads";
import { projectCssParts } from "./document";
import { inlineLocalFonts } from "./font-faces";

const STYLESHEET_ENTRY = "<spool-styles>";

export interface FrameStyleRef {
	name: string;
	page?: string;
}

/**
 * Build the exact stylesheet closure a frame receives in its standalone
 * document, from the compile's own reads: every file it reaches is read once
 * for the whole compile, and the stylesheets Tailwind read are noted in it.
 * Its inputs are every file the stylesheet was made of, so a caller can tell
 * when it would come out the same. A frame with a theme carries the theme's
 * fonts in it: inlined for the canvas, as files beside it for a publication.
 */
export async function buildFrameStyleClosure(
	host: CompileHost,
	designDir: string,
	ref: FrameStyleRef,
	reads: DesignReads,
	publication = false,
): Promise<{ css: string; inputs: string[]; themed: boolean }> {
	const folder = frameFolder(ref.name);
	const frame = await buildDesignEntry(host.esbuild, {
		designDir,
		resolveDir: join(designDir, folder),
		sourcefile: STYLESHEET_ENTRY,
		contents: `import frame from ${JSON.stringify("./frame.tsx")};\nexport default frame;\n`,
		label: `frame "${ref.name}"`,
		...(publication ? { publication: true } : {}),
		files: host.files,
		reads: () => reads,
	});
	const compiled = await host.stylesheets(designDir, cssSources(reads, frame.sourceFiles));
	for (const sheet of compiled.stylesheets) reads.noted(sheet.file, sheet.digest);
	// the bundle's @imports lead the whole sheet: after Tailwind's rules a browser ignores them
	const { head, layered } = projectCssParts(frame.bundledCss ?? "");
	let css = compiled.css;
	let faces: string[] = [];
	if (compiled.theme !== undefined) {
		// a publication reads its faces, for they are inputs, and leaves them files
		const read = publication ? (file: string) => void reads.bytes(file) : reads.bytes;
		const label = `design/${designRelativePath(designDir, compiled.theme)}`;
		const inlined = inlineLocalFonts(designDir, css, read, designPathResolver(designDir, host.files), label);
		css = inlined.css ?? css;
		faces = inlined.files;
	}
	return {
		css: `${head}${layered === "" ? css : `${css}\n${layered}`}`,
		inputs: [...frame.sourceFiles, ...compiled.stylesheets.map((sheet) => sheet.file), ...faces],
		themed: compiled.theme !== undefined,
	};
}
