import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type ParserPlugin, parse } from "@babel/parser";
import { API, type Diagnostic } from "typescript/unstable/sync";
import { CheckerAliasAllocator } from "./check-alias";
import { CheckSourceBudget, CheckSourceLimitError, checkSourceLimitMessage } from "./check-budget";
import { BoundedFileTooLargeError, readBoundedRegularFile, UnsafeFileReadError } from "./check-file";
import { ASSET_EXTENSIONS, TEXT_EXTENSIONS } from "./daemon/assets";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./daemon/design-path";

export interface CheckDiagnostic {
	path: string;
	line: number;
	column: number;
	code: number;
	message: string;
}

const diagnosticIdentity = Symbol("diagnosticIdentity");
type IdentifiedDiagnostic = CheckDiagnostic & { [diagnosticIdentity]?: string };

interface ModuleUse {
	specifier: string;
	start: number;
	end: number;
	statementStart: number;
	statementEnd: number;
	kind: "import" | "import-assignment" | "named-export" | "star-export" | "dynamic-import" | "type-import" | "require";
	namespaceBinding?: string;
	calleeStart?: number;
	calleeEnd?: number;
}

interface ReferenceDirectiveUse {
	kind: "path" | "types" | "lib";
	value: string;
	start: number;
	directiveStart: number;
}

interface BoundaryDependencies {
	moduleUses: Map<string, ModuleUse[]>;
	referenceDirectives: Map<string, ReferenceDirectiveUse[]>;
	diagnostics: CheckDiagnostic[];
}

interface AmbientModuleDeclaration {
	specifier: string;
	rewriteStart: number;
	rewriteEnd: number;
	replacement: string;
	diagnosticStart: number;
	diagnosticEnd: number;
	statementStart: number;
	statementEnd: number;
	namespaceFallback: boolean;
}

interface AmbientModuleUse {
	specifier: string;
	nameStart: number;
	nameEnd: number;
	statementStart: number;
	statementEnd: number;
}

interface JsxImportSourceUse {
	source: string;
	runtimeSpecifier: string;
	start: number;
	pragmaStart: number;
}

interface BindingReceiverUse {
	binding: string;
	start: number;
	end: number;
}

interface SourceInspection {
	moduleUses: ModuleUse[];
	referenceDirectives: ReferenceDirectiveUse[];
	ambientModules: AmbientModuleUse[];
	jsxImportSources: JsxImportSourceUse[];
	bindings: string[];
	bindingReceivers: BindingReceiverUse[];
	inspectable: boolean;
}

interface SourceClosure {
	sources: Map<string, string>;
	inspections: Map<string, SourceInspection>;
}

interface LocalModuleResolution {
	use: ModuleUse;
	alias: string;
	target: string;
}

interface LocalJsxResolution {
	use: JsxImportSourceUse;
	alias: string;
	target: string;
}

interface LocalCssResolution {
	use: ModuleUse;
	alias: string;
	declaration?: string;
}

interface AuthoredModulePolicy {
	permissiveUses: Map<string, ModuleUse[]>;
	rejectedUses: Map<string, ModuleUse[]>;
	ambientDeclarations: Map<string, AmbientModuleDeclaration[]>;
	jsxImportSources: Map<string, JsxImportSourceUse[]>;
	permissiveJsxRuntimes: Set<string>;
	diagnostics: CheckDiagnostic[];
}

interface LocalAssetResolution {
	use: ModuleUse;
	alias: string;
}

interface LocalAssets {
	cssResolutions: Map<string, LocalCssResolution[]>;
	assetResolutions: Map<string, LocalAssetResolution[]>;
	javaScriptUses: Map<string, ModuleUse[]>;
	missingUses: Map<string, ModuleUse[]>;
	missingDiagnostics: CheckDiagnostic[];
}

interface LocalCandidateSelection {
	selected?: string;
	boundary: boolean;
	failure?: string;
}

const requireFromSpool = createRequire(import.meta.url);
const requireFromTypeScript = createRequire(requireFromSpool.resolve("typescript/package.json"));
const sourceSpoolTypes = fileURLToPath(new URL("./runtime/spool-public.ts", import.meta.url));
const builtSpoolTypes = fileURLToPath(new URL("./spool-public.d.ts", import.meta.url));
const spoolTypes = fileExists(sourceSpoolTypes) ? sourceSpoolTypes : builtSpoolTypes;
const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const namespaceFallbackDiagnostics = new Set([1063, 1147, 1194, 1319]);
const maxPolicyAstDepth = 1_000;
const maxDecoratedDeclareRetries = 32;
const nonRegularFileMessage = "Filesystem read refused (non-regular file)";

class NonRegularDesignFileError extends Error {
	readonly path: string;

	constructor(path: string) {
		super(nonRegularFileMessage);
		this.path = path;
	}
}

/** Check every HTML frame without registering, compiling, or writing a project. */
export function checkDesign(root: string): CheckDiagnostic[] {
	try {
		return runCheckDesign(root);
	} catch (error) {
		if (error instanceof NonRegularDesignFileError) {
			return [{ path: error.path, line: 1, column: 1, code: 5083, message: nonRegularFileMessage }];
		}
		if (error instanceof CheckSourceLimitError) {
			return [
				{
					path: designPath(realDesignDir(root), error.file),
					line: 1,
					column: 1,
					code: 5083,
					message: checkSourceLimitMessage,
				},
			];
		}
		if (!(error instanceof DesignBoundaryError) && !isFilesystemError(error)) throw error;
		const code = (error as NodeJS.ErrnoException).code;
		const message =
			code === undefined ? "Design boundary prevents checking this project" : `Filesystem read failed (${code})`;
		return [{ path: "design/frames", line: 1, column: 1, code: 5083, message }];
	}
}

function runCheckDesign(root: string): CheckDiagnostic[] {
	const designDir = realDesignDir(root);
	const sourceBudget = new CheckSourceBudget();
	const entries = discoverHtmlFrames(designDir);
	const importMap = readImportMap(designDir, sourceBudget);
	const sourceClosure = readClosure(designDir, entries, sourceBudget);
	const { sources: closure, inspections } = sourceClosure;
	const uninspectableSources = new Set(
		[...inspections].filter(([, inspection]) => !inspection.inspectable).map(([file]) => file),
	);
	const paths = pinnedPaths();
	const pinnedModules = new Set(Object.keys(paths));
	const checkerAliases = new CheckerAliasAllocator();
	reserveAuthoredCheckerNames(checkerAliases, closure, inspections);
	const localModuleResolutions = resolveLocalModuleUses(designDir, inspections, checkerAliases);
	for (const resolutions of localModuleResolutions.values()) {
		for (const resolution of resolutions) {
			paths[resolution.alias] = [resolution.target];
		}
	}
	const localJsxResolutions = resolveLocalJsxUses(designDir, inspections, checkerAliases);
	for (const resolutions of localJsxResolutions.values()) {
		for (const resolution of resolutions) {
			const runtimeAlias = `${resolution.alias}/jsx-dev-runtime`;
			paths[runtimeAlias] = [resolution.target];
		}
	}
	const internalDir = join(dirname(designDir), ".spool-check-internal");
	const configFile = join(internalDir, "tsconfig.json");
	const boundaryDependencies = inspectBoundaryDependencies(designDir, closure, inspections);
	const authoredModules = inspectAuthoredModules(
		designDir,
		closure,
		inspections,
		importMap,
		pinnedModules,
		checkerAliases,
	);
	const firstStaticRequire = [...inspections].flatMap(([file, inspection]) =>
		inspection.moduleUses.filter((use) => use.kind === "require").map((use) => ({ file, use })),
	)[0];
	const requireIdentifier =
		firstStaticRequire === undefined
			? undefined
			: checkerAliases.allocate("require", firstStaticRequire.file, "require".length, "identifier");
	const boundaries = [
		...entryBoundaries(designDir, entries),
		...boundaryDependencies.diagnostics,
		...authoredModules.diagnostics,
		...[...uninspectableSources].map((file) =>
			checkerDiagnostic(designDir, file, 1, 1, 1003, "Source syntax cannot be inspected safely"),
		),
	];
	const trusted = trustedRoots();
	const virtualFiles = new Map<string, string>();
	const permissiveJsxRuntime = join(internalDir, "jsx-dev-runtime.d.ts");
	if (authoredModules.permissiveJsxRuntimes.size > 0) {
		virtualFiles.set(
			permissiveJsxRuntime,
			[
				"export function jsxDEV(type: any, props: any, key: any, isStaticChildren: boolean, source: any, self: any): any;",
				"export const Fragment: any;",
				"export namespace JSX {",
				"\ttype Element = any;",
				"\tinterface IntrinsicElements { [name: string]: any }",
				"\tinterface IntrinsicAttributes { [name: string]: any }",
				"}",
			].join("\n"),
		);
		for (const runtimeSpecifier of authoredModules.permissiveJsxRuntimes) {
			paths[runtimeSpecifier] = [permissiveJsxRuntime];
		}
	}
	const emptyRoot = join(internalDir, "empty.ts");
	const rootFiles = new Set(
		entries.length > 0 ? entries.map((entry) => canonicalDesignFile(designDir, entry)) : [emptyRoot],
	);
	if (entries.length === 0) virtualFiles.set(emptyRoot, "export {};\n");
	for (const file of closure.keys()) {
		if (isTypeScriptSource(file)) rootFiles.add(file);
	}
	for (const resolutions of localModuleResolutions.values()) {
		for (const resolution of resolutions) {
			if (resolution.use.kind === "require") rootFiles.add(resolution.target);
		}
	}
	if (requireIdentifier !== undefined) {
		const requireTypes = join(internalDir, "require.d.ts");
		virtualFiles.set(requireTypes, `declare function ${requireIdentifier}(specifier: string): any;\n`);
		rootFiles.add(requireTypes);
	}
	const localAssets = inspectLocalAssets(
		designDir,
		closure,
		inspections,
		boundaryDependencies.moduleUses,
		checkerAliases,
	);
	boundaries.push(...localAssets.missingDiagnostics);
	const permissiveCssModule = join(internalDir, "css.d.ts");
	for (const [file, resolutions] of localAssets.cssResolutions) {
		for (const resolution of resolutions) {
			const target = resolution.declaration ?? permissiveCssModule;
			paths[resolution.alias] = [target];
			if (resolution.declaration === undefined) {
				virtualFiles.set(permissiveCssModule, "declare const value: any; export default value;");
			}
			const diagnosticResolutions = localModuleResolutions.get(file) ?? [];
			diagnosticResolutions.push({ use: resolution.use, alias: resolution.alias, target });
			localModuleResolutions.set(file, diagnosticResolutions);
		}
	}
	// Both kinds reach a frame as a string, so the shipped declaration says that
	// and nothing looser (#101).
	const assetModule = join(internalDir, "asset.d.ts");
	if (localAssets.assetResolutions.size > 0) {
		virtualFiles.set(assetModule, "declare const value: string;\nexport default value;\n");
	}
	for (const [file, resolutions] of localAssets.assetResolutions) {
		for (const resolution of resolutions) {
			paths[resolution.alias] = [assetModule];
			const diagnosticResolutions = localModuleResolutions.get(file) ?? [];
			diagnosticResolutions.push({ use: resolution.use, alias: resolution.alias, target: assetModule });
			localModuleResolutions.set(file, diagnosticResolutions);
		}
	}
	const permissiveStarExports = findPermissiveStarExports(
		designDir,
		closure,
		inspections,
		localAssets,
		boundaryDependencies.moduleUses,
		authoredModules,
	);
	const rewrittenSources = rewriteCheckerSources(
		closure,
		inspections,
		localAssets.javaScriptUses,
		localAssets.missingUses,
		boundaryDependencies,
		authoredModules,
		localModuleResolutions,
		localJsxResolutions,
		requireIdentifier,
		uninspectableSources,
	);
	const config = JSON.stringify({
		compilerOptions: {
			target: "es2022",
			lib: ["es2022", "dom", "dom.iterable"],
			module: "esnext",
			moduleResolution: "bundler",
			jsx: "react-jsxdev",
			strict: true,
			noUncheckedIndexedAccess: true,
			exactOptionalPropertyTypes: true,
			noEmit: true,
			resolveJsonModule: true,
			allowImportingTsExtensions: true,
			allowArbitraryExtensions: true,
			types: [],
			paths,
		},
		files: [...rootFiles],
	});
	const diagnosticSources = new Map([...closure, ...virtualFiles, [configFile, config]]);
	const api = new API({
		cwd: designDir,
		fs: {
			readFile(file) {
				if (file === configFile) return config;
				if (isDesignPackagePath(designDir, file)) return null;
				const virtual = virtualFiles.get(file);
				if (virtual !== undefined) return virtual;
				const permitted = permittedFile(designDir, file, trusted);
				if (permitted !== undefined) {
					if (isWithin(designDir, permitted) && !closure.has(permitted)) return null;
					const indexed = rewrittenSources.get(permitted) ?? closure.get(permitted);
					if (indexed !== undefined) return indexed;
					return readFileSync(permitted, "utf8");
				}
				return isTrusted(file, trusted) ? undefined : null;
			},
			fileExists(file) {
				if (file === configFile) return true;
				if (isDesignPackagePath(designDir, file)) return false;
				if (virtualFiles.has(file)) return true;
				const permitted = permittedFile(designDir, file, trusted);
				if (permitted !== undefined) {
					return isWithin(designDir, permitted) ? closure.has(permitted) : fileExists(permitted);
				}
				return isTrusted(file, trusted) ? undefined : false;
			},
			directoryExists(directory) {
				if (
					isAncestor(directory, configFile) ||
					[...virtualFiles.keys()].some((file) => isAncestor(directory, file))
				)
					return true;
				if (isDesignPackagePath(designDir, directory)) return false;
				if (isWithin(designDir, directory)) {
					const canonical = resolveDesignPath(designDir, directory, designPath(designDir, directory));
					return !isDesignPackagePath(designDir, canonical) && directoryExistsOnDisk(canonical);
				}
				if (isAncestor(directory, designDir)) return directoryExistsOnDisk(directory);
				return isTrusted(directory, trusted) ? undefined : false;
			},
			realpath(path) {
				if (path === configFile || virtualFiles.has(path)) return path;
				if (isDesignPackagePath(designDir, path)) return resolve(path);
				if (isWithin(designDir, path)) {
					const canonical = resolveDesignPath(designDir, path, designPath(designDir, path));
					return isDesignPackagePath(designDir, canonical) ? resolve(path) : canonical;
				}
				return isTrusted(path, trusted) || isAncestor(path, designDir) ? undefined : resolve(path);
			},
		},
	});
	try {
		const snapshot = api.updateSnapshot({ openProjects: [configFile] });
		try {
			const project = snapshot.getProject(configFile);
			if (project === undefined) return dedupe(boundaries);
			const diagnostics: CheckDiagnostic[] = [];
			for (const diagnostic of [
				...project.program.getConfigFileParsingDiagnostics(),
				...project.program.getProgramDiagnostics(),
			]) {
				diagnostics.push(
					formatDiagnostic(
						designDir,
						diagnostic,
						diagnosticSources,
						trusted,
						sourceBudget,
						inspections,
						localModuleResolutions,
						localJsxResolutions,
						configFile,
					),
				);
			}
			for (const diagnostic of [
				...project.program.getSyntacticDiagnostics(),
				...project.program.getBindDiagnostics(),
				...project.program.getSemanticDiagnostics(),
			]) {
				if (
					isBoundaryDependencyDiagnostic(designDir, diagnostic, boundaryDependencies.moduleUses) ||
					isTrackedModuleDiagnostic(
						designDir,
						diagnostic,
						authoredModules.permissiveUses,
						authoredModules.rejectedUses,
					) ||
					isNeutralizedAmbientDiagnostic(designDir, diagnostic, authoredModules.ambientDeclarations) ||
					isPermissiveExportDiagnostic(designDir, diagnostic, inspections, permissiveStarExports) ||
					isLocalAssetResolutionDiagnostic(
						designDir,
						diagnostic,
						localAssets.javaScriptUses,
						localAssets.missingUses,
					)
				)
					continue;
				if (diagnostic.fileName === undefined || !isWithin(designDir, diagnostic.fileName)) continue;
				diagnostics.push(
					formatDiagnostic(
						designDir,
						diagnostic,
						diagnosticSources,
						trusted,
						sourceBudget,
						inspections,
						localModuleResolutions,
						localJsxResolutions,
					),
				);
			}
			return dedupe([...diagnostics, ...boundaries]);
		} finally {
			snapshot.dispose();
		}
	} finally {
		api.close();
	}
}

function discoverHtmlFrames(designDir: string): string[] {
	const framesDir = resolveDesignPath(designDir, join(designDir, "frames"), "frames");
	try {
		if (!lstatSync(framesDir).isDirectory()) {
			const error = new Error("frames entry is not a directory") as NodeJS.ErrnoException;
			error.code = "ENOTDIR";
			throw error;
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const entries: string[] = [];
	// discovery's own walk: a folder holding an entry is a frame, and one holding
	// neither is a page whose own folders get the same question (#231)
	const walk = (dir: string): void => {
		for (const entry of directories(designDir, dir)) {
			const frame = join(dir, entry, "frame.tsx");
			if (designFileExists(designDir, frame)) {
				entries.push(frame);
				continue;
			}
			if (entryMarkerExists(join(dir, entry, "term.tsx"))) continue;
			walk(join(dir, entry));
		}
	};
	walk(framesDir);
	return entries.sort((a, b) => compareCodeUnits(designPath(designDir, a), designPath(designDir, b)));
}

function directories(designDir: string, dir: string): string[] {
	try {
		const canonical = resolveDesignPath(designDir, dir, designPath(designDir, dir));
		return readdirSync(canonical, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && isSafeName(entry.name))
			.map((entry) => entry.name);
	} catch (error) {
		if (isMissing(error)) return [];
		throw error;
	}
}

function designFileExists(designDir: string, file: string): boolean {
	try {
		const canonical = resolveDesignPath(designDir, file, designPath(designDir, file));
		if (isDesignPackagePath(designDir, canonical)) {
			throw new DesignBoundaryError(designPath(designDir, file));
		}
		const stat = lstatSync(canonical);
		if (stat.isDirectory()) {
			const error = new Error("frame entry is a directory") as NodeJS.ErrnoException;
			error.code = "EISDIR";
			throw error;
		}
		if (!stat.isFile()) throw new NonRegularDesignFileError(designPath(designDir, file));
		return true;
	} catch (error) {
		if (isMissing(error)) return false;
		throw error;
	}
}

function entryMarkerExists(file: string): boolean {
	try {
		lstatSync(file);
		return true;
	} catch (error) {
		if (isMissing(error)) return false;
		throw error;
	}
}

function readImportMap(designDir: string, sourceBudget: CheckSourceBudget): Set<string> {
	try {
		const file = resolveDesignPath(designDir, join(designDir, "shared", "importmap.json"), "shared/importmap.json");
		if (isDesignPackagePath(designDir, file)) return new Set();
		const parsed: unknown = JSON.parse(
			readRegularDesignFile(designDir, file, sourceBudget, "design/shared/importmap.json"),
		);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return new Set();
		const imports = (parsed as Record<string, unknown>).imports;
		if (typeof imports !== "object" || imports === null || Array.isArray(imports)) return new Set();
		return new Set(
			Object.entries(imports)
				.filter((entry): entry is [string, string] => typeof entry[1] === "string")
				.map(([name]) => name),
		);
	} catch (error) {
		if (!isMissing(error) && !(error instanceof SyntaxError)) throw error;
		return new Set();
	}
}

function pinnedPaths(): Record<string, string[]> {
	const reactTypes = dirname(requireFromSpool.resolve("@types/react/package.json"));
	const reactDomTypes = dirname(requireFromSpool.resolve("@types/react-dom/package.json"));
	return {
		react: [join(reactTypes, "index.d.ts")],
		"react/jsx-runtime": [join(reactTypes, "jsx-runtime.d.ts")],
		"react/jsx-dev-runtime": [join(reactTypes, "jsx-dev-runtime.d.ts")],
		"react-dom": [join(reactDomTypes, "index.d.ts")],
		"react-dom/client": [join(reactDomTypes, "client.d.ts")],
		spool: [spoolTypes],
	};
}

function trustedRoots(): string[] {
	const reactPackage = requireFromSpool.resolve("@types/react/package.json");
	const reactRequire = createRequire(reactPackage);
	const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}`;
	return [
		dirname(requireFromSpool.resolve("typescript/package.json")),
		dirname(requireFromTypeScript.resolve(`${platformPackage}/package.json`)),
		dirname(reactPackage),
		dirname(requireFromSpool.resolve("@types/react-dom/package.json")),
		dirname(reactRequire.resolve("csstype/package.json")),
		dirname(spoolTypes),
	];
}

function permittedFile(designDir: string, file: string, trusted: string[]): string | undefined {
	if (isWithin(designDir, file)) {
		if (isDesignPackagePath(designDir, file)) return undefined;
		if (!isDesignSource(file)) return undefined;
		try {
			const canonical = resolveDesignPath(designDir, file, designPath(designDir, file));
			return isDesignPackagePath(designDir, canonical) ? undefined : canonical;
		} catch {
			return undefined;
		}
	}
	return isTrusted(file, trusted) ? file : undefined;
}

function isDesignPackagePath(designDir: string, target: string): boolean {
	if (!isWithin(designDir, target)) return false;
	const segments = relative(designDir, resolve(target)).split(sep);
	return segments.includes("node_modules") || segments.at(-1) === "package.json";
}

function entryBoundaries(designDir: string, entries: string[]): CheckDiagnostic[] {
	const diagnostics: CheckDiagnostic[] = [];
	for (const entry of entries) {
		try {
			resolveDesignPath(designDir, entry, designPath(designDir, entry));
		} catch {
			diagnostics.push(boundaryDiagnostic(designDir, entry, 1, 1, "Frame entry resolves outside design/"));
		}
	}
	return diagnostics;
}

function inspectBoundaryDependencies(
	designDir: string,
	sources: Map<string, string>,
	inspections: Map<string, SourceInspection>,
): BoundaryDependencies {
	const usesByFile = new Map<string, ModuleUse[]>();
	const directivesByFile = new Map<string, ReferenceDirectiveUse[]>();
	const diagnostics: CheckDiagnostic[] = [];
	for (const [file, source] of sources) {
		const inspection = inspections.get(file);
		if (inspection === undefined) continue;
		for (const use of inspection.moduleUses) {
			const message = moduleBoundaryMessage(designDir, file, use.specifier);
			if (message === undefined) continue;
			addModuleUse(usesByFile, file, use);
			const position = lineAndColumn(source, use.start);
			diagnostics.push(boundaryDiagnostic(designDir, file, position.line, position.column, message));
		}
		for (const directive of inspection.referenceDirectives) {
			const message = referenceDirectiveBoundaryMessage(designDir, file, directive);
			if (message === undefined) continue;
			const directives = directivesByFile.get(file) ?? [];
			directives.push(directive);
			directivesByFile.set(file, directives);
			const position = lineAndColumn(source, directive.start);
			diagnostics.push(boundaryDiagnostic(designDir, file, position.line, position.column, message));
		}
	}
	return { moduleUses: usesByFile, referenceDirectives: directivesByFile, diagnostics };
}

function inspectAuthoredModules(
	designDir: string,
	sources: Map<string, string>,
	inspections: Map<string, SourceInspection>,
	mappings: Set<string>,
	pinnedModules: Set<string>,
	checkerAliases: CheckerAliasAllocator,
): AuthoredModulePolicy {
	const permissiveUses = new Map<string, ModuleUse[]>();
	const rejectedUses = new Map<string, ModuleUse[]>();
	const ambientDeclarations = new Map<string, AmbientModuleDeclaration[]>();
	const jsxImportSources = new Map<string, JsxImportSourceUse[]>();
	const permissiveJsxRuntimes = new Set<string>();
	const diagnostics: CheckDiagnostic[] = [];
	for (const [file, source] of sources) {
		const inspection = inspections.get(file);
		if (inspection === undefined) continue;
		const declarations = ambientModuleDeclarations(source, inspection.ambientModules, (length) =>
			checkerAliases.allocate("ambient", file, Math.max(1, length), length === 0 ? "identifier" : "module"),
		).filter((declaration) => {
			if (!isRelativeLocalSpecifier(declaration.specifier)) return true;
			const message = moduleBoundaryMessage(designDir, file, declaration.specifier);
			if (message === undefined) return false;
			const position = lineAndColumn(source, declaration.diagnosticStart);
			diagnostics.push(boundaryDiagnostic(designDir, file, position.line, position.column, message));
			return true;
		});
		if (declarations.length > 0) ambientDeclarations.set(file, declarations);
		for (const use of inspection.jsxImportSources) {
			let message: string | undefined;
			if (isAbsoluteLocalSpecifier(use.source)) {
				message = "Absolute local imports are outside design/";
			} else if (hasInvalidPathCharacter(use.source)) {
				message = `Cannot find module '${use.runtimeSpecifier}' or its corresponding type declarations.`;
			} else if (isRelativeLocalSpecifier(use.runtimeSpecifier)) {
				message = moduleBoundaryMessage(designDir, file, use.runtimeSpecifier);
				if (message === undefined) continue;
			} else if (pinnedModules.has(use.runtimeSpecifier)) {
				continue;
			} else if (matchingImportMapKey(use.runtimeSpecifier, mappings) !== undefined) {
				permissiveJsxRuntimes.add(use.runtimeSpecifier);
				continue;
			} else {
				message = `Cannot find module '${use.runtimeSpecifier}' or its corresponding type declarations.`;
			}
			const uses = jsxImportSources.get(file) ?? [];
			uses.push(use);
			jsxImportSources.set(file, uses);
			if (message === undefined) continue;
			const position = lineAndColumn(source, use.start);
			diagnostics.push(boundaryDiagnostic(designDir, file, position.line, position.column, message));
		}
		for (const use of inspection.moduleUses) {
			if (isAbsoluteLocalSpecifier(use.specifier)) continue;
			if (hasInvalidPathCharacter(use.specifier)) {
				addModuleUse(rejectedUses, file, use);
			} else if (isRelativeLocalSpecifier(use.specifier)) {
				continue;
			} else if (pinnedModules.has(use.specifier)) {
				continue;
			} else if (matchingImportMapKey(use.specifier, mappings) !== undefined) {
				addModuleUse(permissiveUses, file, use);
				continue;
			} else {
				addModuleUse(rejectedUses, file, use);
			}
			const position = lineAndColumn(source, use.start);
			diagnostics.push(
				boundaryDiagnostic(
					designDir,
					file,
					position.line,
					position.column,
					`Cannot find module '${use.specifier}' or its corresponding type declarations.`,
				),
			);
		}
	}
	return {
		permissiveUses,
		rejectedUses,
		ambientDeclarations,
		jsxImportSources,
		permissiveJsxRuntimes,
		diagnostics,
	};
}

function moduleBoundaryMessage(designDir: string, file: string, specifier: string): string | undefined {
	if (isAbsoluteLocalSpecifier(specifier)) return "Absolute local imports are outside design/";
	if (hasInvalidPathCharacter(specifier)) return undefined;
	if (!isRelativeLocalSpecifier(specifier)) return undefined;
	const target = resolveAuthoredLocalPath(designDir, dirname(file), specifier);
	const selection = selectLocalCandidate(designDir, target, extname(target), isDirectoryOnlySpecifier(specifier));
	if (selection.failure !== undefined) return selection.failure;
	return selection.boundary ? "Relative imports outside design/" : undefined;
}

function referenceDirectiveBoundaryMessage(
	designDir: string,
	file: string,
	directive: ReferenceDirectiveUse,
): string | undefined {
	const authoredPath = directive.value;
	const boundaryMessage = `Reference ${directive.kind}${directive.kind === "path" ? "s" : ""} outside design/`;
	if (isAbsoluteLocalSpecifier(authoredPath) || hasInvalidPathCharacter(authoredPath)) return boundaryMessage;
	if (directive.kind !== "path" && !isRelativeLocalSpecifier(authoredPath)) return undefined;
	const target = resolveAuthoredLocalPath(designDir, dirname(file), authoredPath);
	if (!isWithin(designDir, target)) return boundaryMessage;
	if (directive.kind === "types") {
		const selection = selectTypeReferenceCandidate(designDir, target);
		if (selection.failure !== undefined) return selection.failure;
		return selection.boundary ? boundaryMessage : undefined;
	}
	const selection = selectCandidate(designDir, [target]);
	if (selection.failure !== undefined) return selection.failure;
	return selection.boundary ? boundaryMessage : undefined;
}

function formatDiagnostic(
	designDir: string,
	diagnostic: Diagnostic,
	sources: Map<string, string>,
	trusted: string[],
	sourceBudget: CheckSourceBudget,
	inspections: Map<string, SourceInspection>,
	localModuleResolutions: Map<string, LocalModuleResolution[]>,
	localJsxResolutions: Map<string, LocalJsxResolution[]>,
	fallbackFile?: string,
): CheckDiagnostic {
	const reportedFile = diagnostic.fileName ?? fallbackFile;
	if (reportedFile === undefined) throw new Error("diagnostic has no display file");
	const file = canonicalDesignFile(designDir, reportedFile);
	const source =
		sources.get(file) ??
		sources.get(reportedFile) ??
		(isWithin(designDir, file) ? readRegularDesignFile(designDir, file, sourceBudget) : readFileSync(file, "utf8"));
	const point = lineAndColumn(source, diagnostic.pos);
	return identifyDiagnostic(
		{
			path: designPath(designDir, file),
			line: point.line,
			column: point.column,
			code: diagnostic.code,
			message: diagnosticMessage(
				designDir,
				trusted,
				diagnostic,
				sources,
				inspections,
				localModuleResolutions,
				localJsxResolutions,
			),
		},
		relative(designDir, file).split(sep).join("/"),
		flattenDiagnostic(diagnostic),
	);
}

function diagnosticMessage(
	designDir: string,
	trusted: string[],
	diagnostic: Diagnostic,
	sources: Map<string, string>,
	inspections: Map<string, SourceInspection>,
	localModuleResolutions: Map<string, LocalModuleResolution[]>,
	localJsxResolutions: Map<string, LocalJsxResolution[]>,
): string {
	let message = displayDiagnostic(
		designDir,
		diagnostic,
		sources,
		inspections,
		localModuleResolutions,
		localJsxResolutions,
	);
	const replacements = [
		...trusted.map((path) => [path, "spool"] as const),
		[dirname(designDir), "."] as const,
		[designDir, "design"] as const,
	].sort((a, b) => b[0].length - a[0].length);
	for (const [path, replacement] of replacements) message = message.replaceAll(path, replacement);
	return sanitize(message);
}

interface DiagnosticModuleName {
	generated: string;
	authored: string;
	mode: "exact" | "cascade" | "jsx";
}

function displayDiagnostic(
	designDir: string,
	diagnostic: Diagnostic,
	sources: Map<string, string>,
	inspections: Map<string, SourceInspection>,
	localModuleResolutions: Map<string, LocalModuleResolution[]>,
	localJsxResolutions: Map<string, LocalJsxResolution[]>,
	inheritedNames: DiagnosticModuleName[] = [],
): string {
	const ownNames = diagnosticModuleNames(
		designDir,
		diagnostic,
		sources,
		inspections,
		localModuleResolutions,
		localJsxResolutions,
	);
	const names = ownNames.length > 0 ? ownNames : inheritedNames;
	const message = restoreDiagnosticModuleNames(diagnostic.text, names);
	const messageChain = (diagnostic.messageChain ?? []).map((child) =>
		displayDiagnostic(designDir, child, sources, inspections, localModuleResolutions, localJsxResolutions, names),
	);
	const relatedInformation = (diagnostic.relatedInformation ?? []).map((child) =>
		displayDiagnostic(
			designDir,
			child,
			sources,
			inspections,
			localModuleResolutions,
			localJsxResolutions,
			child.fileName === undefined ? names : [],
		),
	);
	return [message, ...messageChain, ...relatedInformation].join(" ");
}

function diagnosticModuleNames(
	designDir: string,
	diagnostic: Diagnostic,
	sources: Map<string, string>,
	inspections: Map<string, SourceInspection>,
	localModuleResolutions: Map<string, LocalModuleResolution[]>,
	localJsxResolutions: Map<string, LocalJsxResolution[]>,
): DiagnosticModuleName[] {
	if (diagnostic.fileName === undefined) return [];
	const file = canonicalDesignFile(designDir, diagnostic.fileName);
	const source = sources.get(file) ?? sources.get(diagnostic.fileName);
	const resolutions = localModuleResolutions.get(file) ?? [];
	const exact = resolutions.filter(
		(resolution) => diagnostic.pos >= resolution.use.statementStart && diagnostic.pos < resolution.use.statementEnd,
	);
	if (exact.length > 0) return exact.flatMap((resolution) => localDiagnosticModuleNames(resolution, "exact"));

	const binding =
		bindingReceiverAt(inspections.get(file)?.bindingReceivers ?? [], diagnostic.pos) ??
		(source === undefined ? undefined : namespaceBindingBefore(source, diagnostic.pos));
	const bound = resolutions.filter((resolution) => resolution.use.namespaceBinding === binding);
	if (bound.length === 1) return localDiagnosticModuleNames(bound[0] as LocalModuleResolution, "cascade");

	const cascading = resolutions.filter((resolution) =>
		checkerTargetSpellings(resolution.target).some((target) => diagnostic.text.includes(`import("${target}")`)),
	);
	if (cascading.length === 1) {
		return localDiagnosticModuleNames(cascading[0] as LocalModuleResolution, "cascade");
	}

	return (localJsxResolutions.get(file) ?? []).flatMap((resolution) => [
		{
			generated: `${resolution.alias}/jsx-dev-runtime`,
			authored: resolution.use.runtimeSpecifier,
			mode: "jsx" as const,
		},
		{ generated: resolution.alias, authored: resolution.use.source, mode: "jsx" as const },
		...checkerTargetSpellings(resolution.target).map((target) => ({
			generated: target,
			authored: resolution.use.runtimeSpecifier,
			mode: "jsx" as const,
		})),
	]);
}

function localDiagnosticModuleNames(
	resolution: LocalModuleResolution,
	mode: "exact" | "cascade",
): DiagnosticModuleName[] {
	return [
		{ generated: resolution.alias, authored: resolution.use.specifier, mode },
		...checkerTargetSpellings(resolution.target).map((target) => ({
			generated: target,
			authored: resolution.use.specifier,
			mode,
		})),
	];
}

function checkerTargetSpellings(target: string): string[] {
	const spellings = [target];
	for (const suffix of [".d.ts", ".d.mts", ".d.cts", ".tsx", ".ts", ".mts", ".cts"] as const) {
		if (!target.endsWith(suffix)) continue;
		spellings.push(target.slice(0, -suffix.length));
		break;
	}
	return spellings;
}

function bindingReceiverAt(uses: BindingReceiverUse[], position: number): string | undefined {
	let selected: BindingReceiverUse | undefined;
	for (const use of uses) {
		if (position < use.start || position >= use.end) continue;
		if (selected === undefined || use.end - use.start < selected.end - selected.start) selected = use;
	}
	return selected?.binding;
}

function namespaceBindingBefore(source: string, position: number): string | undefined {
	let cursor = position;
	while (cursor > 0 && /\s/u.test(source[cursor - 1] ?? "")) cursor -= 1;
	if (source[cursor - 1] !== ".") return undefined;
	cursor -= 1;
	if (source[cursor - 1] === "?") cursor -= 1;
	while (cursor > 0 && /\s/u.test(source[cursor - 1] ?? "")) cursor -= 1;
	const end = cursor;
	while (cursor > 0 && /^[$_\p{ID_Continue}]$/u.test(source[cursor - 1] ?? "")) cursor -= 1;
	return cursor === end ? undefined : source.slice(cursor, end);
}

function restoreDiagnosticModuleNames(message: string, names: DiagnosticModuleName[]): string {
	let restored = message;
	for (const { generated, authored, mode } of [...names].sort(
		(left, right) => right.generated.length - left.generated.length,
	)) {
		for (const spelling of checkerAliasSpellings(generated)) {
			if (mode === "exact") {
				restored = restored.replaceAll(spelling, authored);
				continue;
			}
			restored = restored.replaceAll(`import("${spelling}")`, `import(${JSON.stringify(authored)})`);
			if (mode !== "jsx") continue;
			for (const prefix of ["Cannot find module '", "module path '", "module '"] as const) {
				restored = restored.replaceAll(`${prefix}${spelling}'`, `${prefix}${authored}'`);
			}
		}
	}
	return restored;
}

function checkerAliasSpellings(alias: string): string[] {
	const escaped = [...alias]
		.map((character) => {
			const code = character.charCodeAt(0);
			return code >= 0xe000 && code <= 0xf8ff ? `\\u${code.toString(16).padStart(4, "0").toUpperCase()}` : character;
		})
		.join("");
	return escaped === alias ? [alias] : [alias, escaped];
}

function boundaryDiagnostic(
	designDir: string,
	file: string,
	line: number,
	column: number,
	message: string,
): CheckDiagnostic {
	return checkerDiagnostic(designDir, file, line, column, 2307, message);
}

function checkerDiagnostic(
	designDir: string,
	file: string,
	line: number,
	column: number,
	code: number,
	message: string,
): CheckDiagnostic {
	return identifyDiagnostic(
		{ path: designPath(designDir, file), line, column, code, message: sanitize(message) },
		relative(designDir, file).split(sep).join("/"),
		message,
	);
}

function lineAndColumn(source: string, position: number): { line: number; column: number } {
	const before = source.slice(0, position);
	const line = before.split(/\r\n|[\n\r\u2028\u2029]/u);
	return { line: line.length, column: (line.at(-1)?.length ?? 0) + 1 };
}

function isTrusted(file: string, roots: string[]): boolean {
	return roots.some((root) => isWithin(root, file));
}

function isWithin(base: string, target: string): boolean {
	const rel = relative(base, resolve(target));
	return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function isAncestor(candidate: string, target: string): boolean {
	return isWithin(candidate, target);
}

function fileExists(file: string): boolean {
	try {
		return lstatSync(file).isFile();
	} catch (error) {
		if (isMissing(error)) return false;
		throw error;
	}
}

function directoryExistsOnDisk(directory: string): boolean {
	try {
		return lstatSync(directory).isDirectory();
	} catch (error) {
		if (isMissing(error)) return false;
		throw error;
	}
}

function isSafeName(name: string): boolean {
	return name.length > 0 && !name.startsWith(".") && !name.includes("/") && !name.includes("\\");
}

function designPath(designDir: string, file: string): string {
	return `design/${sanitize(relative(designDir, file).split(sep).join("/"))}`;
}

function dedupe(diagnostics: CheckDiagnostic[]): CheckDiagnostic[] {
	const unique = new Map<string, CheckDiagnostic>();
	for (const diagnostic of diagnostics) {
		const key =
			(diagnostic as IdentifiedDiagnostic)[diagnosticIdentity] ??
			`${diagnostic.path}\u0000${diagnostic.line}\u0000${diagnostic.column}\u0000${diagnostic.code}\u0000${diagnostic.message}`;
		unique.set(key, diagnostic);
	}
	return [...unique.values()].sort(
		(a, b) =>
			compareCodeUnits(a.path, b.path) ||
			a.line - b.line ||
			a.column - b.column ||
			a.code - b.code ||
			compareCodeUnits(a.message, b.message),
	);
}

function identifyDiagnostic(diagnostic: CheckDiagnostic, rawPath: string, rawMessage: string): CheckDiagnostic {
	Object.defineProperty(diagnostic, diagnosticIdentity, {
		value: JSON.stringify([rawPath, diagnostic.line, diagnostic.column, diagnostic.code, rawMessage]),
	});
	return diagnostic;
}

function isMissing(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException).code;
	return code === "ENOENT" || code === "ENOTDIR";
}

function isFilesystemError(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException).code;
	return (
		code === "EACCES" ||
		code === "EPERM" ||
		code === "EIO" ||
		code === "EISDIR" ||
		code === "ENOENT" ||
		code === "ENOTDIR" ||
		code === "ELOOP" ||
		code === "ENAMETOOLONG" ||
		code === "EMFILE" ||
		code === "ENFILE"
	);
}

function authoredPathReadFailure(error: unknown): string | undefined {
	const code = (error as NodeJS.ErrnoException).code;
	return typeof code === "string" && !isMissing(error) ? `Filesystem read failed (${sanitize(code)})` : undefined;
}

/**
 * The asset kinds whose module is a string (#101) — an image's data URI, a text
 * file's contents. Spool ships their declaration the way it ships React's,
 * because design/ never gets a package.json, and the checker resolves modules
 * independently of the bundler: without this, an import the daemon serves
 * happily reads here as a missing module.
 */
function isAssetSource(file: string): boolean {
	const extension = extname(file).toLowerCase();
	return ASSET_EXTENSIONS.has(extension) || TEXT_EXTENSIONS.has(extension);
}

function isDesignSource(file: string): boolean {
	const extension = extname(file).toLowerCase();
	return (
		extension === ".ts" ||
		extension === ".tsx" ||
		extension === ".mts" ||
		extension === ".cts" ||
		extension === ".json"
	);
}

function isTypeScriptSource(file: string): boolean {
	const extension = extname(file).toLowerCase();
	return extension === ".ts" || extension === ".tsx" || extension === ".mts" || extension === ".cts";
}

function isJavaScriptSource(file: string): boolean {
	const extension = extname(file).toLowerCase();
	return (
		extension === "" || extension === ".js" || extension === ".jsx" || extension === ".mjs" || extension === ".cjs"
	);
}

function isDesignClosureSource(file: string): boolean {
	return isDesignSource(file) || isJavaScriptSource(file);
}

function sanitize(message: string): string {
	return [...message]
		.map((character) => {
			const code = character.codePointAt(0) ?? 0;
			if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) {
				return `\\u${code.toString(16).padStart(4, "0")}`;
			}
			return character;
		})
		.join("");
}

function flattenDiagnostic(diagnostic: Diagnostic): string {
	const children = [...(diagnostic.messageChain ?? []), ...(diagnostic.relatedInformation ?? [])];
	return [diagnostic.text, ...children.map(flattenDiagnostic)].join(" ");
}

function readClosure(designDir: string, entries: string[], sourceBudget: CheckSourceBudget): SourceClosure {
	const sources = new Map<string, string>();
	const inspections = new Map<string, SourceInspection>();
	const queue = [...entries];
	for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
		const canonical = resolveDesignPath(designDir, file, designPath(designDir, file));
		if (isDesignPackagePath(designDir, canonical)) {
			throw new DesignBoundaryError(designPath(designDir, file));
		}
		if (sources.has(canonical)) continue;
		const text = readRegularDesignFile(designDir, canonical, sourceBudget);
		const inspection = inspectSource(canonical, text);
		sources.set(canonical, text);
		inspections.set(canonical, inspection);
		for (const { specifier } of inspection.moduleUses) {
			if (!isRelativeLocalSpecifier(specifier) || hasInvalidPathCharacter(specifier)) continue;
			const cssDeclaration = resolveLocalCssDeclaration(designDir, dirname(canonical), specifier);
			if (cssDeclaration !== undefined) queue.push(cssDeclaration);
			const resolved = resolveLocalClosureSource(designDir, dirname(canonical), specifier);
			if (resolved !== undefined) queue.push(resolved);
		}
		for (const reference of inspection.referenceDirectives) {
			if (reference.kind !== "path" && reference.kind !== "types") continue;
			if (isAbsoluteLocalSpecifier(reference.value) || hasInvalidPathCharacter(reference.value)) continue;
			const resolved = resolveReferenceSource(designDir, dirname(canonical), reference);
			if (resolved !== undefined) queue.push(resolved);
		}
		for (const jsxImportSource of inspection.jsxImportSources) {
			if (
				!isRelativeLocalSpecifier(jsxImportSource.runtimeSpecifier) ||
				hasInvalidPathCharacter(jsxImportSource.runtimeSpecifier)
			)
				continue;
			const resolved = resolveLocalClosureSource(designDir, dirname(canonical), jsxImportSource.runtimeSpecifier);
			if (resolved !== undefined) queue.push(resolved);
		}
	}
	return { sources, inspections };
}

function reserveAuthoredCheckerNames(
	checkerAliases: CheckerAliasAllocator,
	sources: Map<string, string>,
	inspections: Map<string, SourceInspection>,
): void {
	const reserve = (value: string): void => {
		checkerAliases.reserve("module", value);
		checkerAliases.reserve("identifier", value);
	};
	for (const [file, source] of sources) {
		reserve(source);
		const inspection = inspections.get(file);
		if (inspection === undefined) continue;
		for (const use of inspection.moduleUses) reserve(use.specifier);
		for (const use of inspection.jsxImportSources) {
			reserve(use.source);
			reserve(use.runtimeSpecifier);
		}
		for (const declaration of inspection.ambientModules) reserve(declaration.specifier);
		for (const directive of inspection.referenceDirectives) reserve(directive.value);
		for (const binding of inspection.bindings) reserve(binding);
	}
}

function resolveLocalModuleUses(
	designDir: string,
	inspections: Map<string, SourceInspection>,
	checkerAliases: CheckerAliasAllocator,
): Map<string, LocalModuleResolution[]> {
	const resolutions = new Map<string, LocalModuleResolution[]>();
	for (const [file, inspection] of inspections) {
		for (const use of inspection.moduleUses) {
			if (!isRelativeLocalSpecifier(use.specifier) || hasInvalidPathCharacter(use.specifier)) continue;
			const target = resolveLocalSource(designDir, dirname(file), use.specifier);
			if (target === undefined) continue;
			const length = Math.max(1, use.end - use.start - 2);
			const alias = checkerAliases.allocate("module", file, length);
			const fileResolutions = resolutions.get(file) ?? [];
			fileResolutions.push({ use, alias, target });
			resolutions.set(file, fileResolutions);
		}
	}
	return resolutions;
}

function resolveLocalJsxUses(
	designDir: string,
	inspections: Map<string, SourceInspection>,
	checkerAliases: CheckerAliasAllocator,
): Map<string, LocalJsxResolution[]> {
	const resolutions = new Map<string, LocalJsxResolution[]>();
	for (const [file, inspection] of inspections) {
		for (const use of inspection.jsxImportSources) {
			if (!isRelativeLocalSpecifier(use.runtimeSpecifier) || hasInvalidPathCharacter(use.runtimeSpecifier)) continue;
			const target = resolveLocalSource(designDir, dirname(file), use.runtimeSpecifier);
			if (target === undefined) continue;
			const length = Math.max(1, use.source.length);
			const alias = checkerAliases.allocate("jsx", file, length);
			const fileResolutions = resolutions.get(file) ?? [];
			fileResolutions.push({ use, alias, target });
			resolutions.set(file, fileResolutions);
		}
	}
	return resolutions;
}

function resolveLocalSource(designDir: string, base: string, specifier: string): string | undefined {
	if (hasInvalidPathCharacter(specifier)) return undefined;
	const target = resolveAuthoredLocalPath(designDir, base, specifier);
	const extension = extname(target);
	if (extension === ".css") return undefined;
	const selection = selectLocalCandidate(designDir, target, extension, isDirectoryOnlySpecifier(specifier));
	return selection.selected !== undefined && isDesignSource(selection.selected) ? selection.selected : undefined;
}

function resolveLocalClosureSource(designDir: string, base: string, specifier: string): string | undefined {
	if (hasInvalidPathCharacter(specifier)) return undefined;
	const target = resolveAuthoredLocalPath(designDir, base, specifier);
	const extension = extname(target);
	if (extension === ".css") return undefined;
	const selection = selectLocalCandidate(designDir, target, extension, isDirectoryOnlySpecifier(specifier));
	return selection.selected !== undefined && isDesignClosureSource(selection.selected)
		? selection.selected
		: undefined;
}

function resolveLocalCssDeclaration(designDir: string, base: string, specifier: string): string | undefined {
	const target = resolveAuthoredLocalPath(designDir, base, specifier);
	if (!isWithin(designDir, target) || isDesignPackagePath(designDir, target)) return undefined;
	const css = selectLocalCandidate(designDir, target, extname(target), isDirectoryOnlySpecifier(specifier)).selected;
	if (css === undefined || !css.endsWith(".css")) return undefined;
	return selectCandidate(designDir, [css.replace(/\.css$/, ".d.css.ts")]).selected;
}

function selectLocalCandidate(
	designDir: string,
	target: string,
	extension = extname(target),
	directoryOnly = false,
): LocalCandidateSelection {
	return selectCandidate(designDir, localSourceCandidates(target, extension, directoryOnly));
}

function selectTypeReferenceCandidate(designDir: string, target: string): LocalCandidateSelection {
	const candidates = extname(target) === "" ? [`${target}.d.ts`, join(target, "index.d.ts")] : [target];
	return selectCandidate(designDir, candidates);
}

function selectCandidate(designDir: string, candidates: string[]): LocalCandidateSelection {
	for (const candidate of candidates) {
		if (!isWithin(designDir, candidate)) return { boundary: true };
		if (isDesignPackagePath(designDir, candidate)) continue;
		try {
			const canonical = resolveDesignPath(designDir, candidate, designPath(designDir, candidate));
			if (isDesignPackagePath(designDir, canonical)) continue;
			const stat = lstatSync(canonical);
			if (stat.isFile()) return { selected: canonical, boundary: false };
			if (!stat.isDirectory()) return { boundary: false, failure: nonRegularFileMessage };
		} catch (error) {
			if (error instanceof DesignBoundaryError) return { boundary: true };
			if (isMissing(error)) continue;
			const failure = authoredPathReadFailure(error);
			if (failure !== undefined) return { boundary: false, failure };
			throw error;
		}
	}
	return { boundary: false };
}

function readRegularDesignFile(
	designDir: string,
	file: string,
	sourceBudget: CheckSourceBudget,
	displayPath = designPath(designDir, file),
): string {
	try {
		return readBoundedRegularFile(file, sourceBudget, undefined, () => {
			try {
				if (resolveDesignPath(designDir, file, displayPath) !== file) throw new UnsafeFileReadError();
			} catch {
				throw new UnsafeFileReadError();
			}
		}).toString("utf8");
	} catch (error) {
		if (error instanceof UnsafeFileReadError) throw new NonRegularDesignFileError(displayPath);
		if (error instanceof BoundedFileTooLargeError) throw new CheckSourceLimitError(file);
		throw error;
	}
}

function localSourceCandidates(target: string, extension = extname(target), directoryOnly = false): string[] {
	const stem = extension === "" ? target : target.slice(0, -extension.length);
	return directoryOnly
		? [
				join(target, "index.tsx"),
				join(target, "index.ts"),
				join(target, "index.jsx"),
				join(target, "index.js"),
				join(target, "index.css"),
				join(target, "index.json"),
				join(target, "index.d.ts"),
			]
		: extension === ".js"
			? [target, `${stem}.ts`, `${stem}.tsx`]
			: extension === ".jsx"
				? [target, `${stem}.tsx`]
				: extension === ".mjs"
					? [target, `${stem}.mts`]
					: extension === ".cjs"
						? [target, `${stem}.cts`]
						: extension === ""
							? [
									target,
									`${target}.tsx`,
									`${target}.ts`,
									`${target}.jsx`,
									`${target}.js`,
									`${target}.css`,
									`${target}.json`,
									join(target, "index.tsx"),
									join(target, "index.ts"),
									join(target, "index.jsx"),
									join(target, "index.js"),
									join(target, "index.css"),
									join(target, "index.json"),
									`${target}.d.ts`,
									join(target, "index.d.ts"),
								]
							: [target];
}

function isDirectoryOnlySpecifier(specifier: string): boolean {
	const normalized = localPathSpecifier(specifier).replaceAll("\\", "/");
	const finalSegment = normalized.split("/").at(-1);
	return normalized.endsWith("/") || finalSegment === "." || finalSegment === "..";
}

function resolveReferenceSource(designDir: string, base: string, reference: ReferenceDirectiveUse): string | undefined {
	if (hasInvalidPathCharacter(reference.value)) return undefined;
	const target = resolveAuthoredLocalPath(designDir, base, reference.value);
	if (!isWithin(designDir, target) || isDesignPackagePath(designDir, target)) return undefined;
	if (reference.kind === "types") {
		return selectTypeReferenceCandidate(designDir, target).selected;
	}
	try {
		const canonical = resolveDesignPath(designDir, target, designPath(designDir, target));
		if (isDesignPackagePath(designDir, canonical)) return undefined;
		return fileExists(canonical) && isDesignSource(canonical) ? canonical : undefined;
	} catch (error) {
		if (error instanceof DesignBoundaryError || isMissing(error)) return undefined;
		if (authoredPathReadFailure(error) !== undefined) return undefined;
		throw error;
	}
}

function matchingImportMapKey(specifier: string, mappings: Set<string>): string | undefined {
	if (mappings.has(specifier)) return specifier;
	return [...mappings]
		.filter((key) => key.endsWith("/") && specifier.startsWith(key))
		.sort((a, b) => b.length - a.length || compareCodeUnits(a, b))[0];
}

function isBoundaryDependencyDiagnostic(
	designDir: string,
	diagnostic: Diagnostic,
	usesByFile: Map<string, ModuleUse[]>,
): boolean {
	if (diagnostic.fileName === undefined) return false;
	const uses = usesByFile.get(canonicalDesignFile(designDir, diagnostic.fileName)) ?? [];
	if (diagnostic.code !== 2307 && diagnostic.code !== 2882) return false;
	return uses.some((use) => diagnostic.pos >= use.start && diagnostic.pos < use.end);
}

function isTrackedModuleDiagnostic(
	designDir: string,
	diagnostic: Diagnostic,
	...useMaps: Map<string, ModuleUse[]>[]
): boolean {
	if (diagnostic.fileName === undefined) return false;
	const file = canonicalDesignFile(designDir, diagnostic.fileName);
	const uses = useMaps.flatMap((usesByFile) => usesByFile.get(file) ?? []);
	if (diagnostic.code !== 2307 && diagnostic.code !== 2882) return false;
	return uses.some((use) => diagnostic.pos >= use.start && diagnostic.pos < use.end);
}

function isNeutralizedAmbientDiagnostic(
	designDir: string,
	diagnostic: Diagnostic,
	declarationsByFile: Map<string, AmbientModuleDeclaration[]>,
): boolean {
	if (diagnostic.fileName === undefined) return false;
	const declarations = declarationsByFile.get(canonicalDesignFile(designDir, diagnostic.fileName)) ?? [];
	return declarations.some((declaration) => {
		if (
			diagnostic.code === 2664 &&
			diagnostic.pos >= declaration.diagnosticStart &&
			diagnostic.pos < declaration.diagnosticEnd
		)
			return true;
		if (!declaration.namespaceFallback) return false;
		if (
			diagnostic.code === 1540 &&
			diagnostic.pos >= declaration.diagnosticStart &&
			diagnostic.pos < declaration.diagnosticEnd
		)
			return true;
		return (
			namespaceFallbackDiagnostics.has(diagnostic.code) &&
			diagnostic.pos >= declaration.statementStart &&
			diagnostic.pos < declaration.statementEnd
		);
	});
}

function isAbsoluteLocalSpecifier(specifier: string): boolean {
	return (
		specifier.startsWith("/") ||
		specifier.startsWith("\\") ||
		/^[a-z]:[\\/]/i.test(specifier) ||
		/^file:/i.test(specifier)
	);
}

function isRelativeLocalSpecifier(specifier: string): boolean {
	const normalized = localPathSpecifier(specifier).replaceAll("\\", "/");
	return (
		normalized === "." ||
		normalized === ".." ||
		normalized.startsWith("./") ||
		normalized.startsWith("../") ||
		// shared/ by its design-relative name (#273): local to design/, never a package
		normalized.startsWith("shared/")
	);
}

function resolveAuthoredLocalPath(designDir: string, base: string, specifier: string): string {
	const path = localPathSpecifier(specifier).replaceAll("\\", sep).replaceAll("/", sep);
	// a shared/ specifier counts from design/, not from its importer (#273) — the
	// same rule the compile's resolve plugin applies
	const from = localPathSpecifier(specifier).replaceAll("\\", "/").startsWith("shared/") ? designDir : base;
	return resolve(from, path);
}

function localPathSpecifier(specifier: string): string {
	const suffixes = [specifier.indexOf("?"), specifier.indexOf("#")].filter((index) => index >= 0);
	const end = suffixes.length === 0 ? specifier.length : Math.min(...suffixes);
	return specifier.slice(0, end);
}

function hasInvalidPathCharacter(value: string): boolean {
	return value.includes("\0");
}

function canonicalDesignFile(designDir: string, file: string): string {
	return isWithin(designDir, file) ? resolveDesignPath(designDir, file, designPath(designDir, file)) : file;
}

function inspectLocalAssets(
	designDir: string,
	sources: Map<string, string>,
	inspections: Map<string, SourceInspection>,
	boundaryUsesByFile: Map<string, ModuleUse[]>,
	checkerAliases: CheckerAliasAllocator,
): LocalAssets {
	const cssResolutions = new Map<string, LocalCssResolution[]>();
	const assetResolutions = new Map<string, LocalAssetResolution[]>();
	const javaScriptUses = new Map<string, ModuleUse[]>();
	const missingUses = new Map<string, ModuleUse[]>();
	const missingDiagnostics: CheckDiagnostic[] = [];
	for (const [file, source] of sources) {
		const inspection = inspections.get(file);
		if (inspection === undefined) continue;
		const boundaryUses = boundaryUsesByFile.get(file) ?? [];
		for (const use of inspection.moduleUses) {
			if (!isRelativeLocalSpecifier(use.specifier) || hasInvalidPathCharacter(use.specifier)) continue;
			if (boundaryUses.some((boundary) => boundary.start === use.start && boundary.end === use.end)) continue;
			const target = resolveAuthoredLocalPath(designDir, dirname(file), use.specifier);
			if (!isWithin(designDir, target) || isDesignPackagePath(designDir, target)) continue;
			const explicitAsset =
				/\.(?:(?:c|m)?js|jsx|css)$/.test(localPathSpecifier(use.specifier)) ||
				isAssetSource(localPathSpecifier(use.specifier));
			const selection = selectLocalCandidate(
				designDir,
				target,
				extname(target),
				isDirectoryOnlySpecifier(use.specifier),
			);
			const selected = selection.selected;
			const selectedIsAsset =
				selected !== undefined &&
				(isJavaScriptSource(selected) || selected.endsWith(".css") || isAssetSource(selected));
			if (selected !== undefined && !selectedIsAsset) continue;
			const missingStaticRequire = use.kind === "require" && selected === undefined;
			if (!explicitAsset && !selectedIsAsset && !missingStaticRequire) continue;
			let regular = false;
			if (selected !== undefined) {
				try {
					regular = lstatSync(selected).isFile();
				} catch (error) {
					if (!isMissing(error)) throw error;
				}
			}
			if (!regular) {
				if (!explicitAsset && !missingStaticRequire) continue;
				addModuleUse(missingUses, file, use);
				const position = lineAndColumn(source, use.start);
				missingDiagnostics.push(
					boundaryDiagnostic(
						designDir,
						file,
						position.line,
						position.column,
						`Cannot find module '${use.specifier}' or its corresponding type declarations.`,
					),
				);
				continue;
			}
			if (selected?.endsWith(".css")) {
				const declaration = selected.replace(/\.css$/, ".d.css.ts");
				const authoredDeclaration = selectCandidate(designDir, [declaration]).selected;
				const length = Math.max(1, use.end - use.start - 2);
				const alias = checkerAliases.allocate("css", file, length);
				const resolutions = cssResolutions.get(file) ?? [];
				resolutions.push({
					use,
					alias,
					...(authoredDeclaration === undefined ? {} : { declaration: authoredDeclaration }),
				});
				cssResolutions.set(file, resolutions);
			} else if (selected !== undefined && isAssetSource(selected)) {
				const length = Math.max(1, use.end - use.start - 2);
				const resolutions = assetResolutions.get(file) ?? [];
				resolutions.push({ use, alias: checkerAliases.allocate("asset", file, length) });
				assetResolutions.set(file, resolutions);
			} else {
				addModuleUse(javaScriptUses, file, use);
			}
		}
	}
	return { cssResolutions, assetResolutions, javaScriptUses, missingUses, missingDiagnostics };
}

function addModuleUse(usesByFile: Map<string, ModuleUse[]>, file: string, use: ModuleUse): void {
	const uses = usesByFile.get(file) ?? [];
	uses.push(use);
	usesByFile.set(file, uses);
}

function findPermissiveStarExports(
	designDir: string,
	sources: Map<string, string>,
	inspections: Map<string, SourceInspection>,
	localAssets: LocalAssets,
	boundaryUsesByFile: Map<string, ModuleUse[]>,
	authoredModules: AuthoredModulePolicy,
): Set<string> {
	const files = new Set<string>();
	const reverseEdges = new Map<string, Set<string>>();
	const queue: string[] = [];
	for (const file of sources.keys()) {
		const trackedUses = [
			...(localAssets.javaScriptUses.get(file) ?? []),
			...(localAssets.missingUses.get(file) ?? []),
			...(boundaryUsesByFile.get(file) ?? []),
			...(authoredModules.permissiveUses.get(file) ?? []),
			...(authoredModules.rejectedUses.get(file) ?? []),
		];
		for (const use of inspections.get(file)?.moduleUses ?? []) {
			if (use.kind !== "star-export") continue;
			if (trackedUses.some((tracked) => tracked.start === use.start && tracked.end === use.end)) {
				if (!files.has(file)) {
					files.add(file);
					queue.push(file);
				}
				continue;
			}
			if (!isRelativeLocalSpecifier(use.specifier)) continue;
			const target = resolveLocalSource(designDir, dirname(file), use.specifier);
			if (target === undefined) continue;
			const exporters = reverseEdges.get(target) ?? new Set<string>();
			exporters.add(file);
			reverseEdges.set(target, exporters);
		}
	}
	for (let index = 0; index < queue.length; index += 1) {
		for (const exporter of reverseEdges.get(queue[index] as string) ?? []) {
			if (files.has(exporter)) continue;
			files.add(exporter);
			queue.push(exporter);
		}
	}
	return files;
}

function isPermissiveExportDiagnostic(
	designDir: string,
	diagnostic: Diagnostic,
	inspections: Map<string, SourceInspection>,
	permissiveStarExports: Set<string>,
): boolean {
	if (
		(diagnostic.code !== 2305 && diagnostic.code !== 2614 && diagnostic.code !== 2724) ||
		diagnostic.fileName === undefined
	)
		return false;
	const file = canonicalDesignFile(designDir, diagnostic.fileName);
	return (inspections.get(file)?.moduleUses ?? []).some((use) => {
		if (use.kind !== "import" && use.kind !== "named-export") return false;
		if (diagnostic.pos < use.statementStart || diagnostic.pos >= use.statementEnd) return false;
		const target = isRelativeLocalSpecifier(use.specifier)
			? resolveLocalSource(designDir, dirname(file), use.specifier)
			: undefined;
		return target !== undefined && permissiveStarExports.has(target);
	});
}

function isLocalAssetResolutionDiagnostic(
	designDir: string,
	diagnostic: Diagnostic,
	...useMaps: Map<string, ModuleUse[]>[]
): boolean {
	if ((diagnostic.code !== 2307 && diagnostic.code !== 2882) || diagnostic.fileName === undefined) return false;
	const file = canonicalDesignFile(designDir, diagnostic.fileName);
	const uses = useMaps.flatMap((usesByFile) => usesByFile.get(file) ?? []);
	return uses.some((use) => diagnostic.pos >= use.start && diagnostic.pos < use.end);
}

function rewriteCheckerSources(
	sources: Map<string, string>,
	inspections: Map<string, SourceInspection>,
	javaScriptUsesByFile: Map<string, ModuleUse[]>,
	missingUsesByFile: Map<string, ModuleUse[]>,
	boundaryDependencies: BoundaryDependencies,
	authoredModules: AuthoredModulePolicy,
	localModuleResolutions: Map<string, LocalModuleResolution[]>,
	localJsxResolutions: Map<string, LocalJsxResolution[]>,
	requireIdentifier: string | undefined,
	uninspectableSources: Set<string>,
): Map<string, string> {
	const rewritten = new Map<string, string>();
	for (const [file, original] of sources) {
		if (uninspectableSources.has(file)) {
			rewritten.set(file, neutralizeSource(original));
			continue;
		}
		let source = original;
		const uses = [
			...(javaScriptUsesByFile.get(file) ?? []),
			...(missingUsesByFile.get(file) ?? []),
			...(boundaryDependencies.moduleUses.get(file) ?? []),
			...(authoredModules.permissiveUses.get(file) ?? []),
			...(authoredModules.rejectedUses.get(file) ?? []),
		];
		const references = boundaryDependencies.referenceDirectives.get(file) ?? [];
		const declarations = authoredModules.ambientDeclarations.get(file) ?? [];
		const jsxImportSources = authoredModules.jsxImportSources.get(file) ?? [];
		const resolutions = localModuleResolutions.get(file) ?? [];
		const jsxResolutions = localJsxResolutions.get(file) ?? [];
		const staticRequires = (inspections.get(file)?.moduleUses ?? []).filter((use) => use.kind === "require");
		if (
			uses.length === 0 &&
			references.length === 0 &&
			declarations.length === 0 &&
			jsxImportSources.length === 0 &&
			resolutions.length === 0 &&
			jsxResolutions.length === 0 &&
			staticRequires.length === 0
		)
			continue;
		if (requireIdentifier !== undefined) {
			for (const use of [...staticRequires].sort(
				(left, right) => (right.calleeStart ?? 0) - (left.calleeStart ?? 0),
			)) {
				if (use.calleeStart === undefined || use.calleeEnd === undefined) continue;
				source = `${source.slice(0, use.calleeStart)}${requireIdentifier}${source.slice(use.calleeEnd)}`;
			}
		}
		for (const resolution of [...resolutions].sort((a, b) => b.use.start - a.use.start)) {
			source = replaceStringContents(source, resolution.use.start, resolution.use.end, resolution.alias);
		}
		for (const resolution of jsxResolutions) {
			source = `${source.slice(0, resolution.use.start)}${resolution.alias}${source.slice(resolution.use.start + resolution.use.source.length)}`;
		}
		for (const use of [...uses].sort((a, b) => b.start - a.start)) {
			source = neutralizeStringContents(source, use.start, use.end, "\ue000");
		}
		for (const declaration of [...declarations].sort((a, b) => b.rewriteStart - a.rewriteStart)) {
			source = `${source.slice(0, declaration.rewriteStart)}${declaration.replacement}${source.slice(declaration.rewriteEnd)}`;
		}
		for (const reference of [...references].sort((a, b) => b.directiveStart - a.directiveStart)) {
			const neutralize = reference.directiveStart + 2;
			source = `${source.slice(0, neutralize)} ${source.slice(neutralize + 1)}`;
		}
		for (const jsxImportSource of jsxImportSources) {
			source = `${source.slice(0, jsxImportSource.pragmaStart)} ${source.slice(jsxImportSource.pragmaStart + 1)}`;
		}
		rewritten.set(file, source);
	}
	return rewritten;
}

function neutralizeSource(source: string): string {
	return source.replace(/[^\n\r\u2028\u2029]/g, " ");
}

function neutralizeStringContents(source: string, start: number, end: number, replacement: string): string {
	const length = Math.max(0, end - start - 2);
	return replaceStringContents(source, start, end, replacement.repeat(length));
}

function replaceStringContents(source: string, start: number, end: number, contents: string): string {
	return `${source.slice(0, start + 1)}${contents}${source.slice(end - 1)}`;
}

function inspectSource(file: string, source: string): SourceInspection {
	const referenceDirectives = referenceDirectiveUses(source);
	const jsxImportSources = jsxImportSourceUses(source);
	if (extname(file).toLowerCase() === ".json") {
		return {
			moduleUses: [],
			referenceDirectives,
			ambientModules: [],
			jsxImportSources,
			bindings: [],
			bindingReceivers: [],
			inspectable: true,
		};
	}
	const tree = parseSource(file, source);
	if (tree === undefined) {
		return {
			moduleUses: [],
			referenceDirectives,
			ambientModules: [],
			jsxImportSources,
			bindings: [],
			bindingReceivers: [],
			inspectable: false,
		};
	}
	const scopeAnalysis = analyzeAstScopes(tree);
	const moduleUses: ModuleUse[] = [];
	const ambientModules: AmbientModuleUse[] = [];
	const bindingReceivers: BindingReceiverUse[] = [];
	const inspectable = walkAst(tree, (node) => {
		const moduleUse = moduleUseFromNode(node, scopeAnalysis.shadowedRequireStarts);
		if (moduleUse !== undefined) moduleUses.push(moduleUse);
		const ambientModule = ambientModuleFromNode(node);
		if (ambientModule !== undefined) ambientModules.push(ambientModule);
		const bindingReceiver = bindingReceiverFromNode(node);
		if (bindingReceiver !== undefined) bindingReceivers.push(bindingReceiver);
	});
	return {
		moduleUses: inspectable ? moduleUses : [],
		referenceDirectives,
		ambientModules: inspectable ? ambientModules : [],
		jsxImportSources,
		bindings: inspectable && scopeAnalysis.inspectable ? [...scopeAnalysis.bindings] : [],
		bindingReceivers: inspectable ? bindingReceivers : [],
		inspectable: inspectable && scopeAnalysis.inspectable,
	};
}

function bindingReceiverFromNode(node: Record<string, unknown>): BindingReceiverUse | undefined {
	const type = stringField(node, "type");
	let receiver: Record<string, unknown> | undefined;
	let diagnosticSpan = node;
	if (type === "MemberExpression" || type === "OptionalMemberExpression") {
		receiver = objectField(node, "object");
	} else if (type === "CallExpression" || type === "OptionalCallExpression" || type === "NewExpression") {
		receiver = objectField(node, "callee");
	} else if (type === "TaggedTemplateExpression") {
		receiver = objectField(node, "tag");
	} else if (type === "VariableDeclarator") {
		const pattern = objectField(node, "id");
		if (!isDestructuringPattern(pattern)) return undefined;
		receiver = objectField(node, "init");
		diagnosticSpan = pattern as Record<string, unknown>;
	} else if (type === "AssignmentExpression") {
		const pattern = objectField(node, "left");
		if (!isDestructuringPattern(pattern)) return undefined;
		receiver = objectField(node, "right");
		diagnosticSpan = pattern as Record<string, unknown>;
	} else {
		return undefined;
	}
	const binding = transparentBindingName(receiver);
	if (binding === undefined) return undefined;
	return {
		binding,
		start: numberField(diagnosticSpan, "start"),
		end: numberField(diagnosticSpan, "end"),
	};
}

function isDestructuringPattern(node: Record<string, unknown> | undefined): boolean {
	const type = node === undefined ? undefined : stringField(node, "type");
	return type === "ObjectPattern" || type === "ArrayPattern";
}

function transparentBindingName(node: Record<string, unknown> | undefined): string | undefined {
	let current = node;
	for (let depth = 0; current !== undefined && depth <= maxPolicyAstDepth; depth += 1) {
		const type = stringField(current, "type");
		if (type === "Identifier") return stringField(current, "name");
		if (
			type !== "TSNonNullExpression" &&
			type !== "TSAsExpression" &&
			type !== "TSTypeAssertion" &&
			type !== "TypeCastExpression" &&
			type !== "ParenthesizedExpression" &&
			type !== "TSInstantiationExpression" &&
			type !== "TSSatisfiesExpression" &&
			type !== "ChainExpression"
		)
			return undefined;
		current = objectField(current, "expression");
	}
	return undefined;
}

interface AstScope {
	kind: "program" | "function" | "block" | "var-block";
	parent?: AstScope;
	bindings: Set<string>;
}

function analyzeAstScopes(value: unknown): {
	shadowedRequireStarts: Set<number>;
	bindings: Set<string>;
	inspectable: boolean;
} {
	const bindings = new Set<string>();
	const calls: Array<{ start: number; scope?: AstScope }> = [];
	const stack: Array<{ value: unknown; depth: number; scope?: AstScope }> = [{ value, depth: 0 }];
	let inspectable = true;
	for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
		if (current.depth > maxPolicyAstDepth) {
			inspectable = false;
			break;
		}
		if (Array.isArray(current.value)) {
			for (let index = current.value.length - 1; index >= 0; index -= 1) {
				stack.push({
					value: current.value[index],
					depth: current.depth + 1,
					...(current.scope === undefined ? {} : { scope: current.scope }),
				});
			}
			continue;
		}
		if (typeof current.value !== "object" || current.value === null) continue;
		const node = current.value as Record<string, unknown>;
		const type = stringField(node, "type");
		let scope = current.scope;

		if (type === "Program") {
			scope = { kind: "program", bindings: new Set(), ...(scope === undefined ? {} : { parent: scope }) };
		} else if (type === "ClassExpression") {
			scope = {
				kind: "block",
				bindings: new Set(),
				...(current.scope === undefined ? {} : { parent: current.scope }),
			};
			addPatternBindings(objectField(node, "id"), scope, bindings);
		} else if (isFunctionNode(type)) {
			if (type === "FunctionDeclaration" && node.declare !== true) {
				addPatternBindings(objectField(node, "id"), current.scope, bindings);
			}
			scope = {
				kind: "function",
				bindings: new Set(),
				...(current.scope === undefined ? {} : { parent: current.scope }),
			};
			if (type === "FunctionExpression") addPatternBindings(objectField(node, "id"), scope, bindings);
			for (const parameter of rawObjectArray(node.params)) addPatternBindings(parameter, scope, bindings);
		} else if (type === "TSModuleBlock" || type === "StaticBlock") {
			scope = {
				kind: "var-block",
				bindings: new Set(),
				...(scope === undefined ? {} : { parent: scope }),
			};
		} else if (
			type === "BlockStatement" ||
			type === "CatchClause" ||
			type === "ForStatement" ||
			type === "ForInStatement" ||
			type === "ForOfStatement" ||
			type === "SwitchStatement"
		) {
			scope = { kind: "block", bindings: new Set(), ...(scope === undefined ? {} : { parent: scope }) };
			if (type === "CatchClause") addPatternBindings(objectField(node, "param"), scope, bindings);
		}

		if (type === "VariableDeclaration" && node.declare !== true) {
			const target = stringField(node, "kind") === "var" ? nearestVarScope(scope) : scope;
			for (const declaration of rawObjectArray(node.declarations)) {
				addPatternBindings(objectField(declaration, "id"), target, bindings);
			}
		} else if (type === "ImportDeclaration" && stringField(node, "importKind") !== "type") {
			for (const specifier of rawObjectArray(node.specifiers)) {
				if (stringField(specifier, "importKind") === "type") continue;
				addPatternBindings(objectField(specifier, "local"), scope, bindings);
			}
		} else if (type === "TSImportEqualsDeclaration" && stringField(node, "importKind") !== "type") {
			addPatternBindings(objectField(node, "id"), scope, bindings);
		} else if ((type === "ClassDeclaration" || type === "TSEnumDeclaration") && node.declare !== true) {
			addPatternBindings(objectField(node, "id"), scope, bindings);
		} else if (type === "TSModuleDeclaration" && node.declare !== true) {
			addPatternBindings(objectField(node, "id"), scope, bindings);
		}

		if (staticRequireSource(node) !== undefined) {
			calls.push({ start: numberField(node, "start"), ...(scope === undefined ? {} : { scope }) });
		}

		const entries = Object.entries(node);
		for (let index = entries.length - 1; index >= 0; index -= 1) {
			const entry = entries[index];
			if (entry === undefined) continue;
			const [key, child] = entry;
			if (key === "loc" || key === "extra" || key === "comments" || key === "tokens") continue;
			const childScope = isMethodNode(type) && (key === "key" || key === "decorators") ? current.scope : scope;
			stack.push({
				value: child,
				depth: current.depth + 1,
				...(childScope === undefined ? {} : { scope: childScope }),
			});
		}
	}

	const shadowedRequireStarts = new Set<number>();
	for (const call of calls) {
		for (let scope = call.scope; scope !== undefined; scope = scope.parent) {
			if (!scope.bindings.has("require")) continue;
			shadowedRequireStarts.add(call.start);
			break;
		}
	}
	return { shadowedRequireStarts, bindings, inspectable };
}

function isFunctionNode(type: string | undefined): boolean {
	return (
		type === "FunctionDeclaration" ||
		type === "FunctionExpression" ||
		type === "ArrowFunctionExpression" ||
		type === "ObjectMethod" ||
		type === "ClassMethod" ||
		type === "ClassPrivateMethod" ||
		type === "TSDeclareFunction"
	);
}

function isMethodNode(type: string | undefined): boolean {
	return type === "ObjectMethod" || type === "ClassMethod" || type === "ClassPrivateMethod";
}

function nearestVarScope(scope: AstScope | undefined): AstScope | undefined {
	for (let current = scope; current !== undefined; current = current.parent) {
		if (current.kind === "function" || current.kind === "program" || current.kind === "var-block") return current;
	}
	return undefined;
}

function addPatternBindings(
	pattern: Record<string, unknown> | undefined,
	scope: AstScope | undefined,
	all: Set<string>,
): void {
	if (pattern === undefined || scope === undefined) return;
	const stack: unknown[] = [pattern];
	for (let value = stack.pop(); value !== undefined; value = stack.pop()) {
		if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
		const node = value as Record<string, unknown>;
		const type = stringField(node, "type");
		if (type === "Identifier") {
			const name = stringField(node, "name");
			if (name !== undefined) {
				scope.bindings.add(name);
				all.add(name);
			}
		} else if (type === "RestElement") {
			stack.push(node.argument);
		} else if (type === "AssignmentPattern") {
			stack.push(node.left);
		} else if (type === "ArrayPattern") {
			for (const element of Array.isArray(node.elements) ? node.elements : []) stack.push(element);
		} else if (type === "ObjectPattern") {
			for (const property of Array.isArray(node.properties) ? node.properties : []) {
				if (typeof property !== "object" || property === null) continue;
				const propertyNode = property as Record<string, unknown>;
				stack.push(
					stringField(propertyNode, "type") === "RestElement" ? propertyNode.argument : propertyNode.value,
				);
			}
		} else if (type === "TSParameterProperty") {
			stack.push(node.parameter);
		}
	}
}

function rawObjectArray(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item),
	);
}

function moduleUseFromNode(node: Record<string, unknown>, shadowedRequireStarts: Set<number>): ModuleUse | undefined {
	const type = stringField(node, "type");
	const requireSource = shadowedRequireStarts.has(numberField(node, "start")) ? undefined : staticRequireSource(node);
	const kind =
		type === "ImportDeclaration"
			? "import"
			: type === "TSImportEqualsDeclaration"
				? "import-assignment"
				: type === "ExportNamedDeclaration"
					? "named-export"
					: type === "ExportAllDeclaration"
						? "star-export"
						: type === "ImportExpression"
							? "dynamic-import"
							: type === "TSImportType"
								? "type-import"
								: requireSource === undefined
									? undefined
									: "require";
	const moduleReference = kind === "import-assignment" ? objectField(node, "moduleReference") : undefined;
	const sourceNode =
		kind === "require"
			? requireSource
			: kind === "import" || kind === "named-export" || kind === "star-export" || kind === "dynamic-import"
				? objectField(node, "source")
				: kind === "import-assignment" && stringField(moduleReference ?? {}, "type") === "TSExternalModuleReference"
					? objectField(moduleReference ?? {}, "expression")
					: kind === "type-import"
						? (objectField(node, "source") ?? objectField(node, "argument"))
						: undefined;
	const specifier = sourceNode === undefined ? undefined : staticModuleSpecifier(sourceNode);
	if (sourceNode === undefined || specifier === undefined || kind === undefined) return undefined;
	const namespaceBinding =
		kind === "import"
			? namespaceImportBinding(node)
			: kind === "import-assignment"
				? stringField(objectField(node, "id") ?? {}, "name")
				: undefined;
	return {
		specifier,
		start: numberField(sourceNode, "start"),
		end: numberField(sourceNode, "end"),
		statementStart: numberField(node, "start"),
		statementEnd: numberField(node, "end"),
		kind,
		...(namespaceBinding === undefined ? {} : { namespaceBinding }),
		...(kind === "require"
			? {
					calleeStart: numberField(objectField(node, "callee") ?? {}, "start"),
					calleeEnd: numberField(objectField(node, "callee") ?? {}, "end"),
				}
			: {}),
	};
}

function staticRequireSource(node: Record<string, unknown>): Record<string, unknown> | undefined {
	if (stringField(node, "type") !== "CallExpression") return undefined;
	const callee = objectField(node, "callee");
	if (
		callee === undefined ||
		stringField(callee, "type") !== "Identifier" ||
		stringField(callee, "name") !== "require"
	)
		return undefined;
	const arguments_ = arrayField(node, "arguments");
	if (arguments_?.length !== 1) return undefined;
	const source = arguments_[0];
	return source !== undefined && staticModuleSpecifier(source) !== undefined ? source : undefined;
}

function namespaceImportBinding(node: Record<string, unknown>): string | undefined {
	for (const specifier of arrayField(node, "specifiers") ?? []) {
		if (stringField(specifier, "type") !== "ImportNamespaceSpecifier") continue;
		const local = objectField(specifier, "local");
		if (local !== undefined) return stringField(local, "name");
	}
	return undefined;
}

function ambientModuleFromNode(node: Record<string, unknown>): AmbientModuleUse | undefined {
	if (stringField(node, "type") !== "TSModuleDeclaration") return undefined;
	const id = objectField(node, "id");
	if (id === undefined || stringField(id, "type") !== "StringLiteral") return undefined;
	const specifier = stringField(id, "value");
	if (specifier === undefined) return undefined;
	return {
		specifier,
		nameStart: numberField(id, "start"),
		nameEnd: numberField(id, "end"),
		statementStart: numberField(node, "start"),
		statementEnd: numberField(node, "end"),
	};
}

function ambientModuleDeclarations(
	source: string,
	ambientModules: AmbientModuleUse[],
	replacement: (length: number) => string,
): AmbientModuleDeclaration[] {
	const declarations: AmbientModuleDeclaration[] = [];
	for (const { specifier, nameStart, nameEnd, statementStart, statementEnd } of ambientModules) {
		const nameLength = Math.max(0, nameEnd - nameStart - 2);
		const nameReplacement = replacement(nameLength);
		if (nameLength === 0) {
			const keywordEnd = ambientModuleKeywordEnd(source, statementStart, nameStart);
			let rewriteEnd = nameEnd;
			if (keywordEnd !== undefined && nameEnd - keywordEnd === 2 && /\s/u.test(source[nameEnd] ?? "")) {
				rewriteEnd += 1;
			}
			if (keywordEnd !== undefined && rewriteEnd - keywordEnd >= 3) {
				const literal = `"${nameReplacement}"`;
				declarations.push({
					specifier,
					rewriteStart: keywordEnd,
					rewriteEnd,
					replacement: `${literal}${" ".repeat(rewriteEnd - keywordEnd - literal.length)}`,
					diagnosticStart: keywordEnd,
					diagnosticEnd: keywordEnd + literal.length,
					statementStart,
					statementEnd,
					namespaceFallback: false,
				});
				continue;
			}
			if (keywordEnd !== undefined) {
				const identifier = emptyAmbientIdentifier(nameReplacement);
				declarations.push({
					specifier,
					rewriteStart: keywordEnd - "module".length,
					rewriteEnd: nameEnd,
					replacement: `module ${identifier}`,
					diagnosticStart: keywordEnd + 1,
					diagnosticEnd: keywordEnd + 2,
					statementStart,
					statementEnd,
					namespaceFallback: true,
				});
			}
			continue;
		}
		declarations.push({
			specifier,
			rewriteStart: nameStart + 1,
			rewriteEnd: nameEnd - 1,
			replacement: nameReplacement,
			diagnosticStart: nameStart,
			diagnosticEnd: nameEnd,
			statementStart,
			statementEnd,
			namespaceFallback: false,
		});
	}
	return declarations;
}

function emptyAmbientIdentifier(replacement: string): string {
	return replacement;
}

function ambientModuleKeywordEnd(source: string, statementStart: number, nameStart: number): number | undefined {
	let cursor = nameStart;
	while (cursor > statementStart) {
		while (cursor > statementStart && /\s/u.test(source[cursor - 1] ?? "")) cursor -= 1;
		if (source.slice(cursor - 2, cursor) === "*/") {
			const commentStart = source.lastIndexOf("/*", cursor - 2);
			if (commentStart < statementStart) return undefined;
			cursor = commentStart;
			continue;
		}
		const lineStart = previousLineBreak(source, cursor - 1) + 1;
		const commentStart = source.lastIndexOf("//", cursor - 1);
		if (commentStart >= Math.max(statementStart, lineStart)) {
			cursor = commentStart;
			continue;
		}
		break;
	}
	return source.slice(cursor - 6, cursor) === "module" ? cursor : undefined;
}

function previousLineBreak(source: string, start: number): number {
	for (let index = start; index >= 0; index -= 1) {
		if (/[\n\r\u2028\u2029]/u.test(source[index] ?? "")) return index;
	}
	return -1;
}

function parseSource(file: string, source: string): unknown | undefined {
	try {
		const plugins: ParserPlugin[] = ["decorators", "decoratorAutoAccessors", "deprecatedImportAssert"];
		const extension = extname(file).toLowerCase();
		if (isTypeScriptSource(file)) plugins.unshift("typescript");
		if (extension === ".jsx" || extension === ".tsx") plugins.unshift("jsx");
		const options = {
			sourceType: "module",
			plugins,
			createImportExpressions: true,
			errorRecovery: true,
			allowUndeclaredExports: isTypeScriptSource(file),
		} as const;
		let inspectionSource = source;
		let tree: ReturnType<typeof parse>;
		const decoratedClassSites: DecoratedClassSite[] = [];
		for (;;) {
			try {
				tree = parse(inspectionSource, options);
				break;
			} catch (error) {
				if (decoratedClassSites.length >= maxDecoratedDeclareRetries) return undefined;
				const site = decoratedClassSite(file, source, error);
				if (site === undefined || decoratedClassSites.some((candidate) => candidate.classStart === site.classStart))
					return undefined;
				decoratedClassSites.push(site);
				inspectionSource = normalizeDecoratedClassSite(inspectionSource, site);
				if (inspectionSource.length !== source.length) return undefined;
			}
		}
		if ((tree.errors?.length ?? 0) > 0) return undefined;
		if (!restoreDecoratedClasses(tree, source, decoratedClassSites)) return undefined;
		if (!isTypeScriptSource(file)) {
			let defaultExports = 0;
			for (const statement of tree.program.body) {
				if (statement.type === "ExportDefaultDeclaration") {
					defaultExports += 1;
				} else if (statement.type === "ExportNamedDeclaration" && statement.exportKind !== "type") {
					defaultExports += statement.specifiers.filter((specifier) => {
						if (specifier.type === "ExportSpecifier" && specifier.exportKind === "type") return false;
						const exported = specifier.exported;
						return (
							(exported.type === "Identifier" && exported.name === "default") ||
							(exported.type === "StringLiteral" && exported.value === "default")
						);
					}).length;
				}
				if (defaultExports > 1) return undefined;
			}
		}
		return tree;
	} catch {
		return undefined;
	}
}

interface DecoratedClassSite {
	declareStart?: number;
	abstractStart?: number;
	classStart: number;
	defaultOnly: boolean;
}

function decoratedClassSite(file: string, source: string, error: unknown): DecoratedClassSite | undefined {
	if (!isTypeScriptSource(file) || typeof error !== "object" || error === null) return undefined;
	const parseError = error as { reasonCode?: unknown; pos?: unknown };
	if (typeof parseError.pos !== "number" || !Number.isSafeInteger(parseError.pos) || parseError.pos < 0)
		return undefined;
	if (parseError.reasonCode === "UnexpectedLeadingDecorator") {
		return decoratedDeclareClassSite(source, parseError.pos);
	}
	if (parseError.reasonCode === "UnexpectedToken") {
		return decoratedDefaultAbstractClassSite(source, parseError.pos);
	}
	return undefined;
}

function decoratedDeclareClassSite(source: string, declareStart: number): DecoratedClassSite | undefined {
	if (!sourceKeywordAt(source, declareStart, "declare")) return undefined;
	const modifierStart = skipDecoratedDeclareGap(source, declareStart + "declare".length);
	if (modifierStart === undefined) return undefined;
	const hasAbstract = sourceKeywordAt(source, modifierStart, "abstract");
	const classStart = hasAbstract ? skipDecoratedDeclareGap(source, modifierStart + "abstract".length) : modifierStart;
	if (classStart === undefined || !sourceKeywordAt(source, classStart, "class")) return undefined;
	return {
		declareStart,
		...(hasAbstract ? { abstractStart: modifierStart } : {}),
		classStart,
		defaultOnly: false,
	};
}

function decoratedDefaultAbstractClassSite(source: string, classStart: number): DecoratedClassSite | undefined {
	if (!sourceKeywordAt(source, classStart, "class")) return undefined;
	const lineStart = previousLineBreak(source, classStart - 1) + 1;
	const candidates: number[] = [];
	for (
		let abstractStart = source.indexOf("abstract", lineStart);
		abstractStart >= 0 && abstractStart < classStart;
		abstractStart = source.indexOf("abstract", abstractStart + 1)
	) {
		if (
			!sourceKeywordAt(source, abstractStart, "abstract") ||
			skipDecoratedDeclareGap(source, abstractStart + "abstract".length) !== classStart
		)
			continue;
		candidates.push(abstractStart);
	}
	if (candidates.length !== 1) return undefined;
	const abstractStart = candidates[0];
	if (abstractStart === undefined) return undefined;
	return { abstractStart, classStart, defaultOnly: true };
}

function normalizeDecoratedClassSite(source: string, site: DecoratedClassSite): string {
	let normalized = source;
	if (site.declareStart !== undefined) {
		normalized = `${normalized.slice(0, site.declareStart)}${" ".repeat("declare".length)}${normalized.slice(
			site.declareStart + "declare".length,
		)}`;
	}
	if (site.abstractStart !== undefined) {
		normalized = `${normalized.slice(0, site.abstractStart)}${" ".repeat("abstract".length)}${normalized.slice(
			site.abstractStart + "abstract".length,
		)}`;
	}
	return normalized;
}

function restoreDecoratedClasses(tree: unknown, source: string, sites: DecoratedClassSite[]): boolean {
	if (sites.length === 0) return true;
	const classes: Record<string, unknown>[] = [];
	if (
		!walkAst(tree, (node) => {
			if (stringField(node, "type") === "ClassDeclaration") classes.push(node);
		})
	)
		return false;
	const defaultClasses = new Set<Record<string, unknown>>();
	const program = objectField(tree as Record<string, unknown>, "program");
	for (const statement of rawObjectArray(program?.body)) {
		if (stringField(statement, "type") !== "ExportDefaultDeclaration") continue;
		const declaration = objectField(statement, "declaration");
		if (stringField(declaration ?? {}, "type") === "ClassDeclaration") {
			defaultClasses.add(declaration as Record<string, unknown>);
		}
	}
	const restored = new Set<Record<string, unknown>>();
	for (const site of sites) {
		const matches = classes.filter((node) => {
			if (restored.has(node)) return false;
			const decorators = arrayField(node, "decorators");
			const rawId = node.id;
			const id = objectField(node, "id");
			const body = objectField(node, "body");
			const isDefault = defaultClasses.has(node);
			if (
				decorators === undefined ||
				decorators.length === 0 ||
				body === undefined ||
				(site.defaultOnly && !isDefault) ||
				(id === undefined && (rawId !== null || !isDefault)) ||
				node.declare === true ||
				node.abstract === true
			)
				return false;
			const decoratorEnds = decorators.map((decorator) => decorator.end);
			if (decoratorEnds.some((end): boolean => typeof end !== "number" || !Number.isSafeInteger(end) || end < 0))
				return false;
			const lastDecoratorEnd = Math.max(...(decoratorEnds as number[]));
			const nodeStart = node.start;
			const nodeEnd = node.end;
			const bodyStart = body.start;
			if (
				typeof nodeStart !== "number" ||
				!Number.isSafeInteger(nodeStart) ||
				nodeStart < 0 ||
				typeof nodeEnd !== "number" ||
				!Number.isSafeInteger(nodeEnd) ||
				nodeEnd > source.length ||
				typeof bodyStart !== "number" ||
				!Number.isSafeInteger(bodyStart) ||
				bodyStart < 0
			)
				return false;
			const firstModifierStart = site.declareStart ?? site.abstractStart;
			if (firstModifierStart === undefined) return false;
			const idStart = id?.start;
			const idEnd = id?.end;
			const hasValidId =
				id === undefined
					? site.classStart + "class".length <= bodyStart
					: stringField(id, "type") === "Identifier" &&
						typeof idStart === "number" &&
						Number.isSafeInteger(idStart) &&
						typeof idEnd === "number" &&
						Number.isSafeInteger(idEnd) &&
						site.classStart + "class".length <= idStart &&
						idStart < idEnd &&
						idEnd <= bodyStart;
			return (
				hasValidId &&
				nodeStart <= lastDecoratorEnd &&
				lastDecoratorEnd <= firstModifierStart &&
				firstModifierStart < site.classStart &&
				skipSourceTrivia(source, lastDecoratorEnd) === firstModifierStart &&
				isDecoratedClassSiteGrammar(source, site) &&
				bodyStart < nodeEnd
			);
		});
		if (matches.length !== 1) return false;
		const match = matches[0] as Record<string, unknown>;
		if (site.declareStart !== undefined) match.declare = true;
		if (site.abstractStart !== undefined) match.abstract = true;
		restored.add(match);
	}
	return true;
}

function isDecoratedClassSiteGrammar(source: string, site: DecoratedClassSite): boolean {
	let cursor: number;
	if (site.declareStart !== undefined) {
		if (!sourceKeywordAt(source, site.declareStart, "declare")) return false;
		cursor = skipDecoratedDeclareGap(source, site.declareStart + "declare".length) ?? -1;
		if (site.abstractStart !== undefined) {
			if (cursor !== site.abstractStart || !sourceKeywordAt(source, site.abstractStart, "abstract")) return false;
			cursor = skipDecoratedDeclareGap(source, cursor + "abstract".length) ?? -1;
		}
	} else {
		if (site.abstractStart === undefined || !sourceKeywordAt(source, site.abstractStart, "abstract")) return false;
		cursor = skipDecoratedDeclareGap(source, site.abstractStart + "abstract".length) ?? -1;
	}
	return cursor === site.classStart && sourceKeywordAt(source, site.classStart, "class");
}

function skipSourceTrivia(source: string, start: number): number | undefined {
	let cursor = start;
	for (;;) {
		while (cursor < source.length && /\s/u.test(source[cursor] ?? "")) cursor += 1;
		if (source.startsWith("//", cursor)) {
			cursor = lineEnd(source, cursor);
			continue;
		}
		if (source.startsWith("/*", cursor)) {
			const end = source.indexOf("*/", cursor + 2);
			if (end < 0) return undefined;
			cursor = end + 2;
			continue;
		}
		return cursor;
	}
}

function skipDecoratedDeclareGap(source: string, start: number): number | undefined {
	let cursor = start;
	for (;;) {
		while (cursor < source.length && isSameLineWhitespace(source[cursor])) cursor += 1;
		if (!source.startsWith("/*", cursor)) return cursor > start ? cursor : undefined;
		const end = source.indexOf("*/", cursor + 2);
		if (end < 0 || /[\n\r\u2028\u2029]/u.test(source.slice(cursor, end + 2))) return undefined;
		cursor = end + 2;
	}
}

function isSameLineWhitespace(value: string | undefined): boolean {
	return value !== undefined && /\s/u.test(value) && !/[\n\r\u2028\u2029]/u.test(value);
}

function isIdentifierCharacter(value: string | undefined): boolean {
	return value !== undefined && /(?:[$_]|\p{ID_Continue}|\u200c|\u200d)/u.test(value);
}

function sourceKeywordAt(source: string, start: number, keyword: string): boolean {
	return (
		source.slice(start, start + keyword.length) === keyword &&
		!isIdentifierCharacter(source[start - 1]) &&
		!isIdentifierCharacter(source[start + keyword.length])
	);
}

function staticModuleSpecifier(node: Record<string, unknown>): string | undefined {
	if (stringField(node, "type") === "StringLiteral") return stringField(node, "value");
	if (stringField(node, "type") !== "TemplateLiteral") return undefined;
	const expressions = arrayField(node, "expressions");
	const quasis = arrayField(node, "quasis");
	if (expressions?.length !== 0 || quasis?.length !== 1) return undefined;
	const value = objectField(quasis[0] ?? {}, "value");
	return value === undefined ? undefined : stringField(value, "cooked");
}

function jsxImportSourceUses(source: string): JsxImportSourceUse[] {
	const uses: JsxImportSourceUse[] = [];
	let cursor = 0;
	while (cursor < source.length) {
		while (cursor < source.length && /\s/u.test(source[cursor] ?? "")) cursor += 1;
		if (cursor === 0 && source.startsWith("#!", cursor)) {
			cursor = lineEnd(source, cursor);
			continue;
		}
		let commentEnd: number;
		if (source.startsWith("//", cursor)) {
			commentEnd = lineEnd(source, cursor);
		} else if (source.startsWith("/*", cursor)) {
			const closing = source.indexOf("*/", cursor + 2);
			if (closing === -1) break;
			commentEnd = closing + 2;
		} else {
			break;
		}
		const comment = source.slice(cursor, commentEnd);
		for (const match of comment.matchAll(/@jsxImportSource[\t ]+(\S+?)(?=[\t \r\n]|\*\/|$)/gu)) {
			const imported = match[1];
			if (imported === undefined) continue;
			const pragmaStart = cursor + (match.index ?? 0);
			const start = pragmaStart + match[0].length - imported.length;
			const runtimeSpecifier = imported.endsWith("/") ? `${imported}jsx-dev-runtime` : `${imported}/jsx-dev-runtime`;
			uses.push({ source: imported, runtimeSpecifier, start, pragmaStart });
		}
		cursor = commentEnd;
	}
	return uses.slice(-1);
}

function referenceDirectiveUses(source: string): ReferenceDirectiveUse[] {
	const uses: ReferenceDirectiveUse[] = [];
	let cursor = 0;
	while (cursor < source.length) {
		while (cursor < source.length && /\s/u.test(source[cursor] ?? "")) cursor += 1;
		if (cursor === 0 && source.startsWith("#!", cursor)) {
			cursor = lineEnd(source, cursor);
			continue;
		}
		if (source.startsWith("/*", cursor)) {
			const end = source.indexOf("*/", cursor + 2);
			if (end === -1) break;
			cursor = end + 2;
			continue;
		}
		if (!source.startsWith("//", cursor)) break;
		const end = lineEnd(source, cursor);
		const directive = source.slice(cursor, end);
		cursor = end;
		if (!/^\/\/\/[\t ]*<reference\b/u.test(directive)) continue;
		const attribute = /\b(path|types|lib)[\t ]*=[\t ]*(["'])(.*?)\2/u.exec(directive);
		const kind = attribute?.[1];
		const quote = attribute?.[2];
		const value = attribute?.[3];
		if (
			attribute === null ||
			(kind !== "path" && kind !== "types" && kind !== "lib") ||
			quote === undefined ||
			value === undefined
		)
			continue;
		const directiveStart = cursor - directive.length;
		const attributeStart = directiveStart + (attribute.index ?? 0);
		const start = attributeStart + attribute[0].indexOf(quote);
		uses.push({ kind, value, start, directiveStart });
	}
	return uses;
}

function lineEnd(source: string, start: number): number {
	let end = start;
	while (end < source.length && !/[\n\r\u2028\u2029]/u.test(source[end] ?? "")) end += 1;
	return end;
}

function walkAst(value: unknown, visit: (node: Record<string, unknown>) => void): boolean {
	const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
	for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
		if (current.depth > maxPolicyAstDepth) return false;
		if (Array.isArray(current.value)) {
			for (let index = current.value.length - 1; index >= 0; index -= 1) {
				stack.push({ value: current.value[index], depth: current.depth + 1 });
			}
			continue;
		}
		if (typeof current.value !== "object" || current.value === null) continue;
		const node = current.value as Record<string, unknown>;
		if (typeof node.type === "string") visit(node);
		const entries = Object.entries(node);
		for (let index = entries.length - 1; index >= 0; index -= 1) {
			const entry = entries[index];
			if (entry === undefined) continue;
			const [key, child] = entry;
			if (key === "loc" || key === "extra" || key === "comments" || key === "tokens") continue;
			stack.push({ value: child, depth: current.depth + 1 });
		}
	}
	return true;
}

function objectField(node: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
	const value = node[key];
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function arrayField(node: Record<string, unknown>, key: string): Record<string, unknown>[] | undefined {
	const value = node[key];
	if (!Array.isArray(value)) return undefined;
	return value.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))
		? (value as Record<string, unknown>[])
		: undefined;
}

function stringField(node: Record<string, unknown>, key: string): string | undefined {
	const value = node[key];
	return typeof value === "string" ? value : undefined;
}

function numberField(node: Record<string, unknown>, key: string): number {
	const value = node[key];
	return typeof value === "number" ? value : 0;
}
