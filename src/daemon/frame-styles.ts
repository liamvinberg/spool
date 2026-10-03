import { join } from "node:path";
import { buildDesignEntry, cssSources } from "./compile";
import type { DesignReads } from "./design-reads";
import { layeredProjectCss } from "./document";
import { frameFolder } from "./projection";
import { compileFrameCssOnWorker } from "./tailwind";

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
 * when it would come out the same.
 */
export async function buildFrameStyleClosure(
	designDir: string,
	ref: FrameStyleRef,
	reads: DesignReads,
	publication = false,
): Promise<{ css: string; inputs: string[] }> {
	const folder = frameFolder(ref.name);
	const frame = await buildDesignEntry({
		designDir,
		resolveDir: join(designDir, folder),
		sourcefile: STYLESHEET_ENTRY,
		contents: `import frame from ${JSON.stringify("./frame.tsx")};\nexport default frame;\n`,
		label: `frame "${ref.name}"`,
		...(publication ? { publication: true } : { reads: () => reads }),
	});
	const compiled = await compileFrameCssOnWorker(designDir, cssSources(reads, frame.sourceFiles));
	for (const sheet of compiled.stylesheets) reads.noted(sheet.file, sheet.digest);
	const project = frame.bundledCss === undefined ? "" : layeredProjectCss(frame.bundledCss);
	return {
		css: project === "" ? compiled.css : `${compiled.css}\n${project}`,
		inputs: [...frame.sourceFiles, ...compiled.stylesheets.map((sheet) => sheet.file)],
	};
}
