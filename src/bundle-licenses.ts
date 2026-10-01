import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin as EsbuildPlugin } from "esbuild";
import type { Plugin as VitePlugin } from "vite";

const LICENSE_FILE = /^(licen[cs]e|copying|notice)([-.][\w.-]+)?$/i;

export interface InlinedPackage {
	name: string;
	version: string;
	license: string;
	texts: string[];
}

/** The directory of the package a bundled module belongs to, by its last node_modules segment. */
export function packageDirectory(module: string): string | undefined {
	const path = module.replace(/^\0/, "").replace(/\?.*$/, "");
	const at = path.lastIndexOf("node_modules/");
	if (at === -1) return undefined;
	const [scope, name] = path.slice(at + "node_modules/".length).split("/");
	if (scope === undefined) return undefined;
	const id = scope.startsWith("@") && name !== undefined ? `${scope}/${name}` : scope;
	return path.slice(0, at + "node_modules/".length + id.length);
}

function readPackage(directory: string): InlinedPackage {
	const manifest = join(directory, "package.json");
	if (!existsSync(manifest)) throw new Error(`Cannot credit a bundled module outside a package: ${directory}`);
	const { name, version, license } = JSON.parse(readFileSync(manifest, "utf8")) as {
		name: string;
		version: string;
		license?: string;
	};
	const texts = readdirSync(directory)
		.filter((file) => LICENSE_FILE.test(file))
		.sort()
		.map((file) => readFileSync(join(directory, file), "utf8").trim());
	return { name, version, license: license ?? "UNKNOWN", texts };
}

/** One section per name and version, in name order. */
export function renderLicenses(packages: Iterable<InlinedPackage>): string {
	const unique = new Map([...packages].map((inlined) => [`${inlined.name}@${inlined.version}`, inlined]));
	const sections = [...unique.values()]
		.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
		.map(({ name, version, license, texts }) =>
			[
				`## ${name} ${version}`,
				"",
				`License: ${license}.`,
				...(texts.length === 0
					? ["", "The published package carries no license file of its own."]
					: texts.flatMap((text) => ["", "```", text, "```"])),
			].join("\n"),
		);
	return [
		"# Bundled package licenses",
		"",
		"These packages are compiled into the JavaScript in this directory rather than installed beside it. Each one's license follows its name.",
		"",
		sections.join("\n\n"),
		"",
	].join("\n");
}

/** The packages behind a set of bundled modules, resolved against the build's working directory. */
function inlinedPackages(modules: Iterable<string>, workingDirectory: string): InlinedPackage[] {
	const directories = new Set<string>();
	for (const module of modules) {
		const directory = packageDirectory(module);
		if (directory !== undefined) directories.add(resolve(workingDirectory, directory));
	}
	return [...directories].map(readPackage);
}

/**
 * For tsup: one instance shared by every config that writes into the same
 * directory. Each finished build adds what it inlined and rewrites
 * `licenses.md` from everything so far, so the last build to finish leaves
 * the whole list.
 */
export function esbuildLicenses(): EsbuildPlugin {
	const inlined: InlinedPackage[] = [];
	return {
		name: "bundle-licenses",
		setup(build) {
			build.initialOptions.metafile = true;
			build.onEnd((result) => {
				const { outdir, absWorkingDir = process.cwd() } = build.initialOptions;
				if (result.metafile === undefined || outdir === undefined) return;
				inlined.push(...inlinedPackages(Object.keys(result.metafile.inputs), absWorkingDir));
				mkdirSync(resolve(absWorkingDir, outdir), { recursive: true });
				writeFileSync(resolve(absWorkingDir, outdir, "licenses.md"), renderLicenses(inlined));
			});
		},
	};
}

type Bundle = Record<string, { type: "chunk"; moduleIds: string[] } | { type: "asset" }>;

/**
 * For vite. Workers are separate builds that finish before the app's, so the
 * worker plugin only collects and the app plugin writes `licenses.md` beside
 * the app with both.
 */
export function viteLicenses(): { app: VitePlugin; worker: VitePlugin } {
	const inlined: InlinedPackage[] = [];
	const collect = (bundle: Bundle) =>
		inlined.push(
			...inlinedPackages(
				Object.values(bundle).flatMap((output) => (output.type === "chunk" ? output.moduleIds : [])),
				process.cwd(),
			),
		);
	return {
		worker: {
			name: "bundle-licenses-worker",
			apply: "build",
			generateBundle(_options, bundle) {
				collect(bundle);
			},
		},
		app: {
			name: "bundle-licenses",
			apply: "build",
			generateBundle(_options, bundle) {
				collect(bundle);
				this.emitFile({ type: "asset", fileName: "licenses.md", source: renderLicenses(inlined) });
			},
		},
	};
}
