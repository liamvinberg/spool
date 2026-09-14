import { join } from "node:path";
import { buildDesignEntry } from "./compile";
import { layeredProjectCss } from "./document";
import { frameFolder } from "./projection";
import { buildFrameCss } from "./tailwind";

const STYLESHEET_ENTRY = "<spool-styles>";

export interface FrameStyleRef {
	name: string;
	page?: string;
}

export interface FrameStyleClosure {
	css: string;
	sources: string[];
	stylesheets: string[];
}

/** Build the exact stylesheet closure a frame receives in its standalone document. */
export async function buildFrameStyleClosure(
	designDir: string,
	ref: FrameStyleRef,
	publication = false,
): Promise<FrameStyleClosure> {
	const folder = frameFolder(ref.name, ref.page);
	const frame = await buildDesignEntry({
		designDir,
		resolveDir: join(designDir, folder),
		sourcefile: STYLESHEET_ENTRY,
		contents: `import frame from ${JSON.stringify("./frame.tsx")};\nexport default frame;\n`,
		label: `frame "${ref.name}"`,
		...(publication ? { publication: true } : {}),
	});
	const compiled = await buildFrameCss(designDir, frame.sourceFiles);
	const project = frame.bundledCss === undefined ? "" : layeredProjectCss(frame.bundledCss);
	return {
		css: project === "" ? compiled.css : `${compiled.css}\n${project}`,
		sources: frame.sourceFiles,
		stylesheets: compiled.stylesheets,
	};
}
