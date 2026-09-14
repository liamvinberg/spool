import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	linkSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { writeAtomic } from "../atomic-write";
import { SpoolError } from "../errors";
import type { WebsiteArtifact } from "./build";
import { type ArtifactManifest, canonicalJson, sha256, validateManifest } from "./manifest";

export interface PublicationAssociationIdentity {
	authority: string;
	publisherId: string;
	instance: string;
	root: string;
	entry: string;
	scenario: string;
}

export interface PublicationAssociation {
	key: string;
	identity: PublicationAssociationIdentity;
	projectId: string;
	title: string;
	intent:
		| { kind: "create"; operationId: string; contentIdentity: string; inputIdentity: string; invitedEmails: string[] }
		| {
				kind: "update";
				operationId: string;
				contentIdentity: string;
				inputIdentity: string;
				invitedEmails: string[];
				expectedRevision: number;
				expectedAccessGeneration: number;
				targetPublicationId: string;
		  };
	supersededBy?: string;
	binding?: { operationId: string; contentIdentity: string; inputIdentity: string };
	publicationId?: string;
	hostname?: string;
	url?: string;
}

const identitySchema = z.strictObject({
	authority: z.string().url(),
	publisherId: z.string().min(1),
	instance: z.string().min(1),
	root: z.string().min(1),
	entry: z.string().min(1),
	scenario: z.string().min(1),
});
const associationSchema = z.strictObject({
	key: z.string().regex(/^[a-f0-9]{64}$/u),
	identity: identitySchema,
	projectId: z.string().uuid(),
	title: z.string().min(1).max(200),
	intent: z.discriminatedUnion("kind", [
		z.strictObject({
			kind: z.literal("create"),
			operationId: z.string().uuid(),
			contentIdentity: z.string().regex(/^[a-f0-9]{64}$/u),
			inputIdentity: z.string().min(1),
			invitedEmails: z.array(z.string().email()).min(1).max(100),
		}),
		z.strictObject({
			kind: z.literal("update"),
			operationId: z.string().uuid(),
			contentIdentity: z.string().regex(/^[a-f0-9]{64}$/u),
			inputIdentity: z.string().min(1),
			invitedEmails: z.array(z.string().email()).max(100),
			expectedRevision: z.number().int().nonnegative(),
			expectedAccessGeneration: z.number().int().positive(),
			targetPublicationId: z.string().min(1),
		}),
	]),
	binding: z
		.strictObject({
			operationId: z.string().uuid(),
			contentIdentity: z.string().regex(/^[a-f0-9]{64}$/u),
			inputIdentity: z.string().min(1),
		})
		.optional(),
	supersededBy: z
		.string()
		.regex(/^[a-f0-9]{64}$/u)
		.optional(),
	publicationId: z.string().optional(),
	hostname: z.string().optional(),
	url: z.string().url().optional(),
});

export function associationIdentity(
	spoolDir: string,
	authority: string,
	publisherId: string,
	root: string,
	entry: string,
	scenario: string,
): PublicationAssociationIdentity {
	return {
		authority: new URL(authority).origin,
		publisherId,
		instance: realpathSync(resolve(spoolDir)),
		root: realpathSync(resolve(root)),
		entry,
		scenario,
	};
}

export function readAssociation(
	spoolDir: string,
	identity: PublicationAssociationIdentity,
): PublicationAssociation | undefined {
	const file = associationPath(spoolDir, identityKey(identity));
	if (!existsSync(file)) return undefined;
	const record = readRecord(file);
	if (record.key !== identityKey(record.identity) || canonicalJson(record.identity) !== canonicalJson(identity))
		throw new SpoolError("the local publication association is invalid");
	return record;
}

export function findPublicationAssociation(
	spoolDir: string,
	authority: string,
	publisherId: string,
	publicationId: string,
): PublicationAssociation | undefined {
	const directory = dirname(associationPath(spoolDir, "placeholder"));
	if (!existsSync(directory)) return undefined;
	let found: PublicationAssociation | undefined;
	for (const name of readdirSync(directory)) {
		if (!/^[a-f0-9]{64}\.json$/u.test(name)) continue;
		const record = readRecord(join(directory, name));
		if (
			record.key !== identityKey(record.identity) ||
			record.supersededBy !== undefined ||
			record.identity.authority !== new URL(authority).origin ||
			record.identity.publisherId !== publisherId ||
			record.publicationId !== publicationId
		)
			continue;
		if (found) throw new SpoolError("multiple local associations target this publication; rebind deliberately");
		found = record;
	}
	return found;
}

export function claimAssociation(
	spoolDir: string,
	identity: PublicationAssociationIdentity,
	artifact: WebsiteArtifact,
	title: string,
	invitedEmails: string[],
	stable?: Pick<PublicationAssociation, "projectId" | "publicationId" | "hostname" | "url">,
): PublicationAssociation {
	const key = identityKey(identity);
	const file = associationPath(spoolDir, key);
	if (existsSync(file)) return requiredAssociation(spoolDir, identity);
	const record: PublicationAssociation = {
		key,
		identity,
		projectId: stable?.projectId ?? randomUUID(),
		title,
		intent: {
			kind: "create",
			operationId: randomUUID(),
			contentIdentity: artifact.manifest.contentIdentity,
			inputIdentity: artifact.inputIdentity,
			invitedEmails,
		},
		...(stable?.publicationId === undefined ? {} : { publicationId: stable.publicationId }),
		...(stable?.hostname === undefined ? {} : { hostname: stable.hostname }),
		...(stable?.url === undefined ? {} : { url: stable.url }),
	};
	writeCapture(spoolDir, record.intent.operationId, artifact);
	mkdirSync(dirname(file), { recursive: true });
	const candidate = `${file}.${record.intent.operationId}.candidate`;
	writeFileSync(candidate, `${JSON.stringify(record, null, "\t")}\n`, { flag: "wx" });
	try {
		linkSync(candidate, file);
		return record;
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
		rmSync(captureDirectory(spoolDir, record.intent.operationId), { recursive: true, force: true });
		return requiredAssociation(spoolDir, identity);
	} finally {
		unlinkSync(candidate);
	}
}

export function updateAssociation(
	spoolDir: string,
	key: string,
	patch: Pick<PublicationAssociation, "publicationId" | "hostname" | "url">,
): PublicationAssociation {
	if (!/^[a-f0-9]{64}$/u.test(key)) throw new SpoolError("the local publication association is invalid");
	const file = associationPath(spoolDir, key);
	if (!existsSync(file)) throw new SpoolError("the local publication association is missing");
	const held = readRecord(file);
	if (held.key !== key || identityKey(held.identity) !== key)
		throw new SpoolError("the local publication association is invalid");
	const next = { ...held, ...patch };
	writeAtomic(file, `${JSON.stringify(next, null, "\t")}\n`);
	return next;
}

/** Claim one persisted update intent per exact association and captured input. */
export function claimAssociationUpdate(
	spoolDir: string,
	association: PublicationAssociation,
	artifact: WebsiteArtifact,
	expectedRevision: number,
	expectedAccessGeneration: number,
	invitedEmails: string[],
): PublicationAssociation {
	const targetPublicationId = association.publicationId;
	if (targetPublicationId === undefined) throw new SpoolError("the publication update target is missing");
	const intentKey = association.key;
	const directory = join(resolve(spoolDir), "publications", "intents");
	const file = join(directory, `${intentKey}.json`);
	mkdirSync(directory, { recursive: true });
	if (!existsSync(file)) {
		const operationId = randomUUID();
		const next: PublicationAssociation = {
			...association,
			intent: {
				kind: "update",
				operationId,
				contentIdentity: artifact.manifest.contentIdentity,
				inputIdentity: artifact.inputIdentity,
				invitedEmails,
				expectedRevision,
				expectedAccessGeneration,
				targetPublicationId,
			},
		};
		writeCapture(spoolDir, operationId, artifact);
		const candidate = `${file}.${operationId}.candidate`;
		writeFileSync(candidate, `${JSON.stringify(next, null, "\t")}\n`, { flag: "wx" });
		try {
			linkSync(candidate, file);
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
			rmSync(captureDirectory(spoolDir, operationId), { recursive: true, force: true });
		} finally {
			unlinkSync(candidate);
		}
	}
	const claimed = readRecord(file);
	if (
		claimed.key !== association.key ||
		claimed.intent.inputIdentity !== artifact.inputIdentity ||
		claimed.intent.contentIdentity !== artifact.manifest.contentIdentity ||
		claimed.intent.kind !== "update" ||
		claimed.intent.targetPublicationId !== targetPublicationId ||
		claimed.intent.expectedRevision !== expectedRevision ||
		claimed.intent.expectedAccessGeneration !== expectedAccessGeneration ||
		canonicalJson(claimed.intent.invitedEmails) !== canonicalJson(invitedEmails)
	)
		throw new SpoolError("another publication update intent is already in progress for this association");
	return claimed;
}

export function claimExplicitAssociationUpdate(
	spoolDir: string,
	identity: PublicationAssociationIdentity,
	stable: { projectId: string; publicationId: string; hostname: string; url: string; title: string },
	artifact: WebsiteArtifact,
	expectedRevision: number,
	expectedAccessGeneration: number,
	invitedEmails: string[],
): PublicationAssociation {
	const base: PublicationAssociation = {
		key: identityKey(identity),
		identity,
		projectId: stable.projectId,
		title: stable.title,
		publicationId: stable.publicationId,
		hostname: stable.hostname,
		url: stable.url,
		intent: {
			kind: "update",
			operationId: randomUUID(),
			contentIdentity: artifact.manifest.contentIdentity,
			inputIdentity: artifact.inputIdentity,
			invitedEmails,
			expectedRevision,
			expectedAccessGeneration,
			targetPublicationId: stable.publicationId,
		},
	};
	return claimAssociationUpdate(spoolDir, base, artifact, expectedRevision, expectedAccessGeneration, invitedEmails);
}

export function bindAssociation(spoolDir: string, association: PublicationAssociation): PublicationAssociation {
	const file = associationPath(spoolDir, association.key);
	mkdirSync(dirname(file), { recursive: true });
	const { supersededBy: _, ...next } = association;
	writeAtomic(file, `${JSON.stringify(next, null, "\t")}\n`);
	if (next.binding !== undefined && next.publicationId !== undefined) {
		for (const name of readdirSync(dirname(file))) {
			if (!/^[a-f0-9]{64}\.json$/u.test(name) || name === `${next.key}.json`) continue;
			const otherFile = join(dirname(file), name);
			const other = readRecord(otherFile);
			if (
				other.publicationId === next.publicationId &&
				other.identity.authority === next.identity.authority &&
				other.identity.publisherId === next.identity.publisherId
			)
				writeAtomic(otherFile, `${JSON.stringify({ ...other, supersededBy: next.key }, null, "\t")}\n`);
		}
	}
	return next;
}

export function discardAssociationUpdateIntent(spoolDir: string, association: PublicationAssociation): void {
	if (association.intent.kind !== "update") return;
	const intentKey = association.key;
	const file = join(resolve(spoolDir), "publications", "intents", `${intentKey}.json`);
	if (existsSync(file) && readRecord(file).intent.operationId === association.intent.operationId) unlinkSync(file);
}

export function claimStopIntent(
	spoolDir: string,
	authority: string,
	publisherId: string,
	publicationId: string,
): string {
	if (publicationId.length < 1) throw new SpoolError("publication id is required");
	const identity = {
		authority: new URL(authority).origin,
		publisherId,
		instance: realpathSync(resolve(spoolDir)),
		publicationId,
	};
	const key = createHash("sha256").update(canonicalJson(identity)).digest("hex");
	const file = join(resolve(spoolDir), "publications", "stop-intents", `${key}.json`);
	if (existsSync(file)) {
		const held = parseObject(readFileSync(file, "utf8"));
		if (held.identity !== canonicalJson(identity) || typeof held.operationId !== "string")
			throw new SpoolError("the local stop intent is invalid");
		return z.string().uuid().parse(held.operationId);
	}
	const operationId = randomUUID();
	mkdirSync(dirname(file), { recursive: true });
	const candidate = `${file}.${operationId}.candidate`;
	writeFileSync(candidate, `${JSON.stringify({ identity: canonicalJson(identity), operationId })}\n`, { flag: "wx" });
	try {
		linkSync(candidate, file);
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
	} finally {
		unlinkSync(candidate);
	}
	const held = parseObject(readFileSync(file, "utf8"));
	if (held.identity !== canonicalJson(identity) || typeof held.operationId !== "string")
		throw new SpoolError("the local stop intent is invalid");
	return z.string().uuid().parse(held.operationId);
}

export function clearStopIntent(
	spoolDir: string,
	authority: string,
	publisherId: string,
	publicationId: string,
	operationId: string,
): void {
	const identity = {
		authority: new URL(authority).origin,
		publisherId,
		instance: realpathSync(resolve(spoolDir)),
		publicationId,
	};
	const key = createHash("sha256").update(canonicalJson(identity)).digest("hex");
	const file = join(resolve(spoolDir), "publications", "stop-intents", `${key}.json`);
	if (!existsSync(file)) return;
	const held = parseObject(readFileSync(file, "utf8"));
	if (held.identity === canonicalJson(identity) && held.operationId === operationId) unlinkSync(file);
}

export function readCapture(spoolDir: string, operationId: string): WebsiteArtifact {
	const directory = captureDirectory(spoolDir, operationId);
	let manifest: ArtifactManifest;
	try {
		manifest = validateManifest(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")));
	} catch {
		throw new SpoolError(
			"the captured publication bytes are missing or invalid; the existing operation was not changed",
		);
	}
	const objects = new Map<string, { bytes: Uint8Array; mediaType: string }>();
	for (const object of manifest.objects) {
		let bytes: Buffer;
		try {
			bytes = readFileSync(join(directory, "objects", object.path));
		} catch {
			throw new SpoolError(
				"the captured publication bytes are missing or invalid; the existing operation was not changed",
			);
		}
		if (bytes.byteLength !== object.byteLength || sha256(bytes) !== object.sha256)
			throw new SpoolError(
				"the captured publication bytes are missing or invalid; the existing operation was not changed",
			);
		objects.set(object.path, { bytes, mediaType: object.mediaType });
	}
	const metadata = parseObject(readFileSync(join(directory, "capture.json"), "utf8"));
	if (typeof metadata.inputIdentity !== "string") throw new SpoolError("the captured publication identity is invalid");
	return { manifest, inputIdentity: metadata.inputIdentity, objects };
}

function writeCapture(spoolDir: string, operationId: string, artifact: WebsiteArtifact): void {
	const directory = captureDirectory(spoolDir, operationId);
	if (existsSync(directory)) return;
	validateManifest(artifact.manifest);
	if (artifact.objects.size !== artifact.manifest.objects.length)
		throw new SpoolError("the captured publication inventory is incomplete");
	for (const object of artifact.manifest.objects) {
		const held = artifact.objects.get(object.path);
		if (
			held === undefined ||
			held.mediaType !== object.mediaType ||
			held.bytes.byteLength !== object.byteLength ||
			sha256(held.bytes) !== object.sha256
		)
			throw new SpoolError("the captured publication bytes do not match the manifest");
	}
	for (const [path, object] of artifact.objects) {
		const target = join(directory, "objects", path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, object.bytes);
	}
	writeFileSync(join(directory, "manifest.json"), canonicalJson(artifact.manifest));
	writeFileSync(join(directory, "capture.json"), JSON.stringify({ inputIdentity: artifact.inputIdentity }));
}

function captureDirectory(spoolDir: string, operationId: string): string {
	return join(resolve(spoolDir), "publications", "captures", operationId);
}
function identityKey(identity: PublicationAssociationIdentity): string {
	return createHash("sha256").update(canonicalJson(identity)).digest("hex");
}
function associationPath(spoolDir: string, key: string): string {
	return join(resolve(spoolDir), "publications", "associations", `${key}.json`);
}
function requiredAssociation(spoolDir: string, identity: PublicationAssociationIdentity): PublicationAssociation {
	const record = readAssociation(spoolDir, identity);
	if (record === undefined) throw new SpoolError("the local publication association disappeared during creation");
	return record;
}
function readRecord(file: string): PublicationAssociation {
	try {
		const value = associationSchema.parse(JSON.parse(readFileSync(file, "utf8")));
		const { publicationId, hostname, url, binding, supersededBy, ...required } = value;
		return {
			...required,
			...(publicationId === undefined ? {} : { publicationId }),
			...(hostname === undefined ? {} : { hostname }),
			...(url === undefined ? {} : { url }),
			...(binding === undefined ? {} : { binding }),
			...(supersededBy === undefined ? {} : { supersededBy }),
		};
	} catch {
		throw new SpoolError("the local publication association is invalid");
	}
}
function parseObject(raw: string): Record<string, unknown> {
	const value: unknown = JSON.parse(raw);
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
	return value as Record<string, unknown>;
}

export function readUpdateIntent(
	spoolDir: string,
	identity: PublicationAssociationIdentity,
	publicationId?: string,
	scenarioSpecified = true,
): PublicationAssociation | undefined {
	const directory = join(resolve(spoolDir), "publications", "intents");
	if (!existsSync(directory)) return undefined;
	let found: PublicationAssociation | undefined;
	for (const name of readdirSync(directory)) {
		if (!/^[a-f0-9]{64}\.json$/u.test(name)) continue;
		const record = readRecord(join(directory, name));
		if (
			record.intent.kind !== "update" ||
			name !== `${record.key}.json` ||
			record.key !== createHash("sha256").update(canonicalJson(record.identity)).digest("hex")
		)
			throw new SpoolError("the local publication update intent is invalid");
		const held = record.identity;
		if (
			held.authority !== identity.authority ||
			held.publisherId !== identity.publisherId ||
			held.instance !== identity.instance ||
			held.root !== identity.root ||
			held.entry !== identity.entry ||
			(scenarioSpecified && held.scenario !== identity.scenario)
		)
			continue;
		if (
			publicationId !== undefined &&
			record.intent.kind === "update" &&
			record.intent.targetPublicationId !== publicationId
		)
			continue;
		if (found) throw new SpoolError("multiple publication update intents need explicit recovery");
		found = record;
	}
	return found;
}
