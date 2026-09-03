/**
 * The design/ contract written by `spool init`. Bump FORMAT_VERSION only on
 * breaking layout changes; the stamp lives in canvas.json, the marker file.
 */
export const FORMAT_VERSION = 1;

/**
 * The marker file: the format stamp, and whether this project keeps history
 * (#158). The flag is written at init rather than left out, so the posture a
 * project was started under is on disk and in the first commit.
 */
export const canvasJson = (history: boolean): string =>
	`${JSON.stringify({ format: FORMAT_VERSION, history }, null, "\t")}\n`;

const gitignore = ".spool/\n";

const claudeMd = "@AGENTS.md\n";

const agentsMd = `# spool canvas

This folder is a [spool](https://spool.page) project: frames on an infinite canvas — agents author the files, humans arrange and play them.

Run \`spool skill\` before working here. It is the complete contract: if it isn't in there, spool doesn't do it. Topics: \`spool skill frames|flows|scenarios|styling|verbs\`.

- A frame is born by writing \`frames/<name>/frame.tsx\` default-exporting one React component — no registration, no \`spool new\`. Variants are \`--\`-named siblings (\`checkout--empty/\`).
- The one law: never write app-owned files — \`canvas.json\` and \`.spool/\` are spool's.
`;

const tokensCss = `/*
 * spool tokens, the single token file for this canvas.
 * Distilling from an existing product: paste its variables into :root verbatim.
 * Spool-born tokens: use @theme (Tailwind v4, shadcn v4 shape).
 * Starts empty on purpose: tokens arrive per change, carried by the agent.
 */
:root {}
`;

const transitionsCss = `/*
 * Player transition styling, plain CSS (no Tailwind here).
 * Crossfade is the default. For morphs, give elements a shared
 * view-transition-name in their frames and style ::view-transition-* here.
 * One direction or one data-transition type:
 * html:active-view-transition-type(forward)::view-transition-old(root) { ... }
 */
`;

const fontsCss = `/*
 * Project fonts, plain CSS, loaded in every frame document:
 * a hosted @import url(...), or @font-face with absolute/data src.
 * A relative url() resolves from this folder — drop the file in
 * assets/fonts/ and spool carries it in the document.
 */
`;

const importmapJson = `{
	"imports": {
		"class-variance-authority": "https://esm.sh/class-variance-authority@0.7.1",
		"clsx": "https://esm.sh/clsx@2.1.1",
		"motion": "https://esm.sh/motion@12.42.2?external=react,react-dom",
		"motion/react": "https://esm.sh/motion@12.42.2/react?external=react,react-dom",
		"tailwind-merge": "https://esm.sh/tailwind-merge@3.6.0"
	}
}
`;

const defaultScenario = `{
	"state": {}
}
`;

const utilsTs = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
`;

/** Files written under design/, keyed by relative path. */
export const scaffoldFiles = (history: boolean): Record<string, string> => ({
	".gitignore": gitignore,
	"AGENTS.md": agentsMd,
	"CLAUDE.md": claudeMd,
	"canvas.json": canvasJson(history),
	"shared/tokens.css": tokensCss,
	"shared/transitions.css": transitionsCss,
	"shared/fonts.css": fontsCss,
	"shared/importmap.json": importmapJson,
	"shared/scenarios/default.json": defaultScenario,
	"shared/lib/utils.ts": utilsTs,
});

/** Directories that start empty but are part of the contract's shape. */
export const scaffoldDirs: string[] = ["frames", "shared/ui", "shared/assets/fonts"];
