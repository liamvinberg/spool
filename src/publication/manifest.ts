import { createHash } from "node:crypto";
import { z } from "zod";
import { isSafeName } from "../page-path";

export const ARTIFACT_FORMAT = 1;
export const MAX_OBJECT_BYTES = 25 * 1024 * 1024;
export const MAX_VERSION_BYTES = 100 * 1024 * 1024;
export const MAX_OBJECTS = 2000;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const path = z
	.string()
	.max(512)
	.refine(
		(value) =>
			/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(value) &&
			value.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
	);
const name = z.string().max(200).refine(isSafeName);
const object = z.strictObject({
	path,
	mediaType: z
		.string()
		.max(100)
		.regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/),
	byteLength: z.number().int().nonnegative().max(MAX_OBJECT_BYTES),
	sha256: digest,
});
const frame = z.strictObject({
	name,
	width: z.number().positive().finite(),
	height: z.number().positive().finite(),
	outgoing: z.array(name).max(2000),
	module: path,
	dependencies: z.array(path).max(MAX_OBJECTS),
	stylesheet: path,
});

const body = z.strictObject({
	format: z.literal(ARTIFACT_FORMAT),
	producer: z.strictObject({
		name: z.literal("spool.page"),
		version: z.string().min(1).max(100),
		runtimeVersion: z.string().min(1).max(100),
	}),
	entry: name,
	scenario: name,
	document: z.literal("index.html"),
	bootstrap: path,
	seed: path,
	frames: z.array(frame).min(1).max(2000),
	objects: z.array(object).min(1).max(MAX_OBJECTS),
	externalServices: z.array(z.string().url().max(4096)).max(2000),
});
export type ArtifactBody = z.infer<typeof body>;
export type ArtifactManifest = ArtifactBody & { contentIdentity: string };
export type ArtifactObject = z.infer<typeof object>;

/** Canonical JSON: object key order is irrelevant; ordered arrays are part of the format. */
export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (typeof value === "object" && value !== null)
		return `{${Object.entries(value)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
			.join(",")}}`;
	const json = JSON.stringify(value);
	if (json === undefined) throw new Error("Artifact metadata must be JSON.");
	return json;
}
export function sha256(bytes: string | Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}
export function sealManifest(value: ArtifactBody): ArtifactManifest {
	const parsed = body.parse(value);
	return validateManifest({ ...parsed, contentIdentity: sha256(canonicalJson(parsed)) });
}

/** Cloud validates metadata and exact object membership before any version can activate. */
export function validateManifest(value: unknown): ArtifactManifest {
	const parsed = body.extend({ contentIdentity: digest }).parse(value);
	const { contentIdentity, ...unsigned } = parsed;
	if (sha256(canonicalJson(unsigned)) !== contentIdentity)
		throw new Error("Artifact content identity does not match its manifest.");
	const objects = new Map(parsed.objects.map((entry) => [entry.path, entry]));
	const frames = new Map(parsed.frames.map((entry) => [entry.name, entry]));
	if (objects.size !== parsed.objects.length || frames.size !== parsed.frames.length)
		throw new Error("Artifact names must be unique.");
	if (objects.has("manifest.json")) throw new Error("The manifest inventory must not include itself.");
	if (parsed.objects.reduce((sum, entry) => sum + entry.byteLength, 0) > MAX_VERSION_BYTES)
		throw new Error("Artifact exceeds the version size limit.");
	if (!frames.has(parsed.entry)) throw new Error("Artifact entry is not included.");
	for (const required of [
		parsed.document,
		parsed.bootstrap,
		parsed.seed,
		...parsed.frames.flatMap((entry) => [entry.module, entry.stylesheet, ...entry.dependencies]),
	])
		if (!objects.has(required)) throw new Error(`Artifact object "${required}" is missing.`);
	for (const entry of parsed.frames)
		for (const destination of entry.outgoing)
			if (!frames.has(destination)) throw new Error(`Artifact target "${destination}" is not included.`);
	return parsed;
}
