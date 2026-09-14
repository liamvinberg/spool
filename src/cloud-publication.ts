import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { type AuthOptions, authorizedCloudRequest, cloudOrigin, session } from "./cloud-auth";
import { SpoolError } from "./errors";
import {
	associationIdentity,
	claimAssociation,
	readAssociation,
	readCapture,
	updateAssociation,
} from "./publication/associations";
import { buildWebsite, type WebsiteArtifact } from "./publication/build";

const publication = z.strictObject({
	id: z.string(),
	projectId: z.string(),
	ownerId: z.string(),
	title: z.string(),
	hostname: z.string(),
	url: z.string().url(),
	entry: z.string(),
	scenario: z.string(),
	state: z.enum(["staging", "active", "stopped", "suspended"]),
	revision: z.number().int().nonnegative(),
	accessGeneration: z.number().int().positive(),
	currentVersion: z.nullable(z.strictObject({ id: z.string(), contentIdentity: z.string() })),
	invitedEmails: z.array(z.string()),
	createdAt: z.number(),
	updatedAt: z.number(),
});
const operation = z.strictObject({
	id: z.string(),
	publicationId: z.string(),
	kind: z.literal("create"),
	state: z.enum(["uploading", "sealed", "succeeded", "failed", "conflict", "expired"]),
	contentIdentity: z.string(),
	expectedRevision: z.number().int().nonnegative(),
	expectedAccessGeneration: z.number().int().positive(),
	createdAt: z.number(),
	expiresAt: z.number(),
	missingObjectIndices: z.array(z.number().int().nonnegative()),
	result: z.nullable(z.strictObject({ publication, versionId: z.string() })),
	error: z.nullable(z.strictObject({ code: z.string(), message: z.string() })),
});
const operationResponse = z.strictObject({ publication, operation });
export type CloudPublication = z.infer<typeof publication>;
export type CloudOperation = z.infer<typeof operation>;
export type CloudOperationResponse = z.infer<typeof operationResponse>;
export type PublishResult = CloudOperationResponse & { localSource: "current" | "changed" | "unavailable" };

export class CloudPublicationFailure extends SpoolError {
	constructor(
		message: string,
		readonly detail: {
			operation?: CloudOperation;
			operationId?: string;
			code: string;
			retryable: boolean;
			retryAfter?: number;
		},
	) {
		super(message);
	}
}

export interface PublishOptions extends AuthOptions {
	spoolDir: string;
	root: string;
	entry: string;
	scenario?: string;
	invitedEmails?: string[];
	version: string;
	title?: string;
	progress?: (message: string) => void;
}

export async function publishWebsite(options: PublishOptions): Promise<PublishResult> {
	const origin = options.origin ?? cloudOrigin(process.env);
	const cloudOptions: AuthOptions = { ...options, origin };
	const account = await session(options.spoolDir, cloudOptions);
	const scenario = options.scenario ?? "default";
	const identity = associationIdentity(
		options.spoolDir,
		origin,
		account.publisherId,
		options.root,
		options.entry,
		scenario,
	);
	let association = readAssociation(options.spoolDir, identity);
	let recovered: CloudOperationResponse | undefined;
	if (association !== undefined)
		recovered = await operationStatusOrMissing(options.spoolDir, association.operationId, cloudOptions);
	if (recovered !== undefined && ["failed", "conflict", "expired"].includes(recovered.operation.state))
		finish(recovered);

	options.progress?.("capturing website");
	let artifact: WebsiteArtifact;
	try {
		artifact = await buildWebsite({
			root: realpathSync(resolve(options.root)),
			entry: options.entry,
			version: options.version,
			...(options.scenario === undefined ? {} : { scenario: options.scenario }),
		});
	} catch (error) {
		if (recovered?.operation.state === "succeeded") return { ...recovered, localSource: "unavailable" };
		throw error;
	}
	if (association !== undefined) {
		if (
			options.invitedEmails !== undefined &&
			options.invitedEmails.length > 0 &&
			canonicalInvitations(options.invitedEmails) !== canonicalInvitations(association.invitedEmails)
		)
			throw new SpoolError(
				"this publication was created with a different invitation set; access changes are not available yet",
			);
		const changed =
			artifact.manifest.contentIdentity !== association.contentIdentity ||
			artifact.inputIdentity !== association.inputIdentity;
		if (recovered?.operation.state === "succeeded")
			return { ...recovered, localSource: changed ? "changed" : "current" };
		if (changed)
			throw new SpoolError(
				"local work changed after this publication was captured; updating an existing link is not available yet",
			);
		const captured = readCapture(options.spoolDir, association.operationId);
		if (
			captured.manifest.contentIdentity !== association.contentIdentity ||
			captured.inputIdentity !== association.inputIdentity
		)
			throw new SpoolError("the captured publication bytes no longer match the existing operation");
	} else {
		const invitedEmails = normalizeInvitations(options.invitedEmails ?? []);
		const title = (options.title ?? options.entry).trim();
		if (title.length < 1 || title.length > 200) throw new SpoolError("publication title must be 1 to 200 characters");
		association = claimAssociation(options.spoolDir, identity, artifact, title, invitedEmails);
		if (association.contentIdentity !== artifact.manifest.contentIdentity)
			throw new SpoolError("local work changed while another publish command claimed this project");
	}

	const captured = readCapture(options.spoolDir, association.operationId);
	let current = recovered ?? (await createOrRecover(options.spoolDir, association, captured, cloudOptions));
	association = rememberPublication(options.spoolDir, association, current.publication);
	if (terminal(current.operation)) return { ...finish(current), localSource: "current" };
	if (current.operation.state === "uploading") {
		for (const index of current.operation.missingObjectIndices) {
			const metadata = captured.manifest.objects[index];
			const object = metadata === undefined ? undefined : captured.objects.get(metadata.path);
			if (metadata === undefined || object === undefined)
				throw new SpoolError("the captured publication object is missing");
			options.progress?.(`uploading ${index + 1}/${captured.manifest.objects.length}`);
			await uploadObject(
				options.spoolDir,
				association.operationId,
				index,
				`/api/publication-operations/${encodeURIComponent(association.operationId)}/objects/${index}`,
				{ method: "PUT", headers: { "content-type": "application/octet-stream" }, body: Buffer.from(object.bytes) },
				cloudOptions,
			);
		}
		current = (await operationStatusOrMissing(options.spoolDir, association.operationId, cloudOptions)) ?? current;
		options.progress?.("sealing website");
		current = await mutateAndRecover(
			options.spoolDir,
			association.operationId,
			`/api/publication-operations/${encodeURIComponent(association.operationId)}/seal`,
			{ method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
			cloudOptions,
		);
	}
	if (current.operation.state === "sealed") {
		options.progress?.("activating website");
		current = await mutateAndRecover(
			options.spoolDir,
			association.operationId,
			`/api/publication-operations/${encodeURIComponent(association.operationId)}/activate`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					expectedRevision: current.operation.expectedRevision,
					expectedAccessGeneration: current.operation.expectedAccessGeneration,
				}),
			},
			cloudOptions,
		);
	}
	return { ...finish(current), localSource: "current" };
}

async function uploadObject(
	spoolDir: string,
	operationId: string,
	index: number,
	path: string,
	init: RequestInit,
	options: AuthOptions,
): Promise<void> {
	try {
		await requestJson(spoolDir, path, init, options);
	} catch (error) {
		const recovered = await operationStatusOrMissing(spoolDir, operationId, options);
		if (error instanceof CloudApiError) throw withOperationId(error, operationId, recovered?.operation);
		if (recovered !== undefined && !recovered.operation.missingObjectIndices.includes(index)) return;
		await requestJson(spoolDir, path, init, options);
	}
}

export async function listPublications(
	spoolDir: string,
	options: AuthOptions = {},
): Promise<{ publications: CloudPublication[]; nextCursor: string | null }> {
	const cloudOptions = { ...options, origin: options.origin ?? cloudOrigin(process.env) };
	await session(spoolDir, cloudOptions);
	const response = await requestJson(spoolDir, "/api/publications", {}, cloudOptions);
	return z.strictObject({ publications: z.array(publication), nextCursor: z.string().nullable() }).parse(response);
}

export async function publicationStatus(
	spoolDir: string,
	id: string,
	options: AuthOptions = {},
): Promise<{ publication: CloudPublication }> {
	const cloudOptions = { ...options, origin: options.origin ?? cloudOrigin(process.env) };
	await session(spoolDir, cloudOptions);
	const response = await requestJson(spoolDir, `/api/publications/${encodeURIComponent(id)}`, {}, cloudOptions);
	return z.strictObject({ publication }).parse(response);
}

async function createOrRecover(
	spoolDir: string,
	association: ReturnType<typeof claimAssociation>,
	artifact: WebsiteArtifact,
	options: AuthOptions,
): Promise<CloudOperationResponse> {
	const body = JSON.stringify({
		projectId: association.projectId,
		title: association.title,
		invitedEmails: association.invitedEmails,
		manifest: artifact.manifest,
	});
	try {
		return readOperation(
			await requestJson(
				spoolDir,
				"/api/publications",
				{
					method: "POST",
					headers: { "content-type": "application/json", "idempotency-key": association.operationId },
					body,
				},
				options,
			),
			association.operationId,
			artifact.manifest.contentIdentity,
		);
	} catch (error) {
		const recovered = await operationStatusOrMissing(spoolDir, association.operationId, options);
		if (recovered !== undefined) return recovered;
		if (error instanceof CloudApiError) throw withOperationId(error, association.operationId);
		return readOperation(
			await requestJson(
				spoolDir,
				"/api/publications",
				{
					method: "POST",
					headers: { "content-type": "application/json", "idempotency-key": association.operationId },
					body,
				},
				options,
			),
			association.operationId,
			artifact.manifest.contentIdentity,
		);
	}
}

async function mutateAndRecover(
	spoolDir: string,
	operationId: string,
	path: string,
	init: RequestInit,
	options: AuthOptions,
): Promise<CloudOperationResponse> {
	try {
		return readOperation(await requestJson(spoolDir, path, init, options), operationId);
	} catch (error) {
		const recovered = await operationStatusOrMissing(spoolDir, operationId, options);
		if (error instanceof CloudApiError) throw withOperationId(error, operationId, recovered?.operation);
		if (recovered !== undefined) {
			const mustRepeat =
				(path.endsWith("/seal") && recovered.operation.state === "uploading") ||
				(path.endsWith("/activate") && recovered.operation.state === "sealed");
			if (mustRepeat) return readOperation(await requestJson(spoolDir, path, init, options), operationId);
			return recovered;
		}
		throw error;
	}
}

async function operationStatusOrMissing(
	spoolDir: string,
	operationId: string,
	options: AuthOptions,
): Promise<CloudOperationResponse | undefined> {
	try {
		return readOperation(
			await requestJson(spoolDir, `/api/publication-operations/${encodeURIComponent(operationId)}`, {}, options),
			operationId,
		);
	} catch (error) {
		if (error instanceof CloudApiError && error.status === 404) return undefined;
		throw error;
	}
}

class CloudApiError extends CloudPublicationFailure {
	constructor(
		readonly status: number,
		message: string,
		code: string,
		retryable: boolean,
		retryAfter?: number,
	) {
		super(message, { code, retryable, ...(retryAfter === undefined ? {} : { retryAfter }) });
	}
}
async function requestJson(spoolDir: string, path: string, init: RequestInit, options: AuthOptions): Promise<unknown> {
	for (let attempt = 1; attempt <= 3; attempt++) {
		const response = await authorizedCloudRequest(spoolDir, path, init, options);
		let value: unknown = {};
		try {
			value = await response.json();
		} catch {
			/* reported below */
		}
		if (response.ok) return value;
		const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
		const message =
			typeof body.message === "string" ? body.message : "spool.page could not complete the publication request";
		const retryAfter = retrySeconds(body.retryAfter, response.headers.get("retry-after"));
		if (
			(response.status === 429 || response.status === 503) &&
			attempt < 3 &&
			retryAfter !== undefined &&
			retryAfter <= 10
		) {
			if (retryAfter > 0) await new Promise((done) => setTimeout(done, retryAfter * 1000));
			continue;
		}
		throw new CloudApiError(
			response.status,
			message,
			typeof body.error === "string" ? body.error : "service_error",
			body.retryable === true,
			retryAfter,
		);
	}
	throw new SpoolError("spool.page could not complete the publication request");
}
function normalizeInvitations(values: string[]): string[] {
	const emails = [...new Set(values.map(normalizeMailbox))];
	if (emails.length < 1 || emails.length > 100 || emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)))
		throw new SpoolError("add between 1 and 100 valid recipient email addresses with --invite");
	return emails;
}
function canonicalInvitations(values: string[]): string {
	return normalizeInvitations(values).sort().join("\n");
}
function normalizeMailbox(value: string): string {
	const trimmed = value.trim();
	const at = trimmed.lastIndexOf("@");
	return at < 1 ? trimmed : `${trimmed.slice(0, at)}@${trimmed.slice(at + 1).toLowerCase()}`;
}
function readOperation(value: unknown, operationId: string, contentIdentity?: string): CloudOperationResponse {
	const parsed = operationResponse.parse(value);
	if (
		parsed.operation.id !== operationId ||
		(contentIdentity !== undefined && parsed.operation.contentIdentity !== contentIdentity)
	)
		throw new SpoolError("spool.page returned a different publication operation");
	if (parsed.operation.publicationId !== parsed.publication.id)
		throw new SpoolError("spool.page returned an inconsistent publication operation");
	return parsed;
}
function rememberPublication(
	spoolDir: string,
	association: ReturnType<typeof claimAssociation>,
	value: CloudPublication,
) {
	if (value.ownerId !== association.identity.publisherId || value.projectId !== association.projectId)
		throw new SpoolError("spool.page returned a publication for a different owner or project");
	return updateAssociation(spoolDir, association.key, {
		publicationId: value.id,
		hostname: value.hostname,
		url: value.url,
	});
}
function terminal(value: CloudOperation): boolean {
	return ["succeeded", "failed", "conflict", "expired"].includes(value.state);
}
function finish(value: CloudOperationResponse): CloudOperationResponse {
	if (value.operation.state === "succeeded") return value;
	const message = value.operation.error?.message ?? `publication operation is ${value.operation.state}`;
	throw new CloudPublicationFailure(message, {
		operation: value.operation,
		code: value.operation.error?.code ?? value.operation.state,
		retryable: false,
	});
}
function withOperationId(
	error: CloudApiError,
	operationId: string,
	operation?: CloudOperation,
): CloudPublicationFailure {
	return new CloudPublicationFailure(error.message, {
		...error.detail,
		operationId,
		...(operation === undefined ? {} : { operation }),
	});
}
function retrySeconds(body: unknown, header: string | null): number | undefined {
	if (typeof body === "number" && Number.isFinite(body) && body >= 0) return body;
	if (header === null) return undefined;
	if (/^\d+$/u.test(header)) return Number(header);
	const at = Date.parse(header);
	return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}
