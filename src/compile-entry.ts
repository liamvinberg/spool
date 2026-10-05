/**
 * `spool.page/compile`: core's compile, for anywhere that is not the daemon.
 *
 * A Cloudflare Worker compiles a project's frames with this, from the files it
 * holds, to the same bytes the daemon compiles them to. Everything the compile
 * does its work with is handed in as a `CompileHost`:
 *
 * - `esbuild`: esbuild's API, `build`, `context` and `formatMessages`. In a
 *   Worker, esbuild-wasm at exactly `ESBUILD_VERSION`, initialized first.
 *   The compile resolves and reads every file itself, so esbuild needs no file
 *   system.
 * - `files`: the project's files (`DesignFiles`), by absolute path, the design
 *   folder anywhere. `memoryDesignFiles` holds them in memory.
 * - `stylesheets`: what makes each frame's Tailwind stylesheet.
 *   `inProcessStylesheets` makes them in place, with the class scanner
 *   (`scanCandidates`), the project's files and the pinned Tailwind's own
 *   stylesheets (`TAILWIND_STYLESHEETS`, from the `tailwindcss` package this
 *   one depends on).
 *
 * Two compiles: `compileFrameDocument`, the canvas's document for one frame
 * (stamped for the picker, the dev dialect), and `compilePublication`, the
 * player's composition built for a destination. Each answers with the hash of
 * its inputs, the same for the same files wherever they are compiled. A frame
 * that does not compile throws, and `describeCompileError` says why with file
 * and line; `errorDocument` is the page the canvas shows in its place.
 *
 * What the canvas draws of the same files, its pages, frames and where each
 * stands, is `projectDesign`: the read-only canvas in a browser draws a team
 * project from it.
 *
 * Importing this module runs nothing: no file is read and no dependency is
 * called until a compile is.
 */

export type { CanvasOrder, CanvasPlaces, Place } from "./daemon/canvas-fields";
export { type ClassScanner, type ScannedFile, scanCandidates } from "./daemon/class-scanner";
export {
	type CompiledFrameDocument,
	type CompileEsbuild,
	type CompileHost,
	compileFrameDocument,
	describeCompileError,
	ESBUILD_VERSION,
	type FrameAuthority,
	type FrameDocumentRequest,
} from "./daemon/design-compile";
export { type DesignEntry, type DesignFileKind, type DesignFiles, memoryDesignFiles } from "./daemon/design-files";
export { type DesignFrame, type DesignProjection, projectDesign } from "./daemon/design-projection";
export { errorDocument } from "./daemon/document";
export { inertWebfonts, type WebfontFile, type Webfonts } from "./daemon/font-faces";
/** The policy every frame document is served under, given the origin it is served from. */
export { servedFrameCsp } from "./daemon/frame-csp";
export {
	compilePublication,
	type PlayerBundle,
	type PlayerFrameRef,
	type PublicationRequest,
} from "./daemon/player-compile";
export {
	type CssSource,
	type FrameCss,
	inProcessStylesheets,
	type StylesheetRunner,
	type StylesheetSources,
	TAILWIND_STYLESHEETS,
	type TailwindStylesheets,
} from "./daemon/tailwind";
/** The `design/` format this compile reads: a canvas.json stamped with a newer one is not this release's to compile. */
export { FORMAT_VERSION } from "./templates";
