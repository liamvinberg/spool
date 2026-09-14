import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	linkSync,
	mkdirSync,
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
	operationId: string;
	contentIdentity: string;
	inputIdentity: string;
	title: string;
	invitedEmails: string[];
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
	operationId: z.string().uuid(),
	contentIdentity: z.string().regex(/^[a-f0-9]{64}$/u),
	inputIdentity: z.string().min(1),
	title: z.string().min(1).max(200),
	invitedEmails: z.array(z.string().email()).min(1).max(100),
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
	return readRecord(file);
}

export function claimAssociation(
	spoolDir: string,
	identity: PublicationAssociationIdentity,
	artifact: WebsiteArtifact,
	title: string,
	invitedEmails: string[],
): PublicationAssociation {
	const key = identityKey(identity);
	const file = associationPath(spoolDir, key);
	if (existsSync(file)) return readRecord(file);
	const record: PublicationAssociation = {
		key,
		identity,
		projectId: randomUUID(),
		operationId: randomUUID(),
		contentIdentity: artifact.manifest.contentIdentity,
		inputIdentity: artifact.inputIdentity,
		title,
		invitedEmails,
	};
	writeCapture(spoolDir, record.operationId, artifact);
	mkdirSync(dirname(file), { recursive: true });
	const candidate = `${file}.${record.operationId}.candidate`;
	writeFileSync(candidate, `${JSON.stringify(record, null, "\t")}\n`, { flag: "wx" });
	try {
		linkSync(candidate, file);
		return record;
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
		rmSync(captureDirectory(spoolDir, record.operationId), { recursive: true, force: true });
		return readRecord(file);
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
	const next = { ...readRecord(file), ...patch };
	writeAtomic(file, `${JSON.stringify(next, null, "\t")}\n`);
	return next;
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
function readRecord(file: string): PublicationAssociation {
	try {
		const value = associationSchema.parse(JSON.parse(readFileSync(file, "utf8")));
		const { publicationId, hostname, url, ...required } = value;
		return {
			...required,
			...(publicationId === undefined ? {} : { publicationId }),
			...(hostname === undefined ? {} : { hostname }),
			...(url === undefined ? {} : { url }),
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
