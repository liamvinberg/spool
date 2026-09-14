import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
	type AuthOptions,
	authorizedCloudRequest,
	CloudRequestFailure,
	cloudOrigin,
	keychainVault,
	session,
} from "./cloud-auth";
import { SpoolError } from "./errors";
import {
	associationIdentity,
	bindAssociation,
	claimAssociation,
	claimAssociationUpdate,
	claimExplicitAssociationUpdate,
	claimStopIntent,
	clearStopIntent,
	discardAssociationUpdateIntent,
	findPublicationAssociation,
	readAssociation,
	readCapture,
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
	kind: z.enum(["create", "update"]),
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
const stopOperation = z.strictObject({
	id: z.string().uuid(),
	publicationId: z.string(),
	kind: z.literal("stop"),
	state: z.literal("succeeded"),
	createdAt: z.number(),
	result: z.strictObject({ publication, changed: z.boolean() }),
	error: z.null(),
});
const stopResponse = z.strictObject({ publication, operation: stopOperation });
const operationSummary = z.strictObject({
	id: z.string().uuid(),
	publicationId: z.string(),
	kind: z.enum(["create", "update", "stop"]),
	state: z.enum(["uploading", "sealed", "succeeded", "failed", "conflict", "expired"]),
	contentIdentity: z.string().nullable(),
	expectedRevision: z.number().int().nonnegative().nullable(),
	expectedAccessGeneration: z.number().int().positive().nullable(),
	createdAt: z.number(),
	expiresAt: z.number().nullable(),
	result: z
		.strictObject({
			versionId: z.string().nullable(),
			revision: z.number().int().nonnegative(),
			accessGeneration: z.number().int().positive(),
			state: z.enum(["staging", "active", "stopped", "suspended"]),
		})
		.nullable(),
	error: z.strictObject({ code: z.string(), message: z.string() }).nullable(),
});
const operationPage = z.strictObject({ operations: z.array(operationSummary), nextCursor: z.string().nullable() });
const publicationOperationSummaries = z.strictObject({
	publicationId: z.string(),
	pending: z.array(operationSummary),
	latest: operationSummary.nullable(),
	latestUnsuccessful: operationSummary.nullable(),
});
export type CloudPublication = z.infer<typeof publication>;
export type CloudOperation = z.infer<typeof operation>;
export type CloudOperationResponse = z.infer<typeof operationResponse>;
export type CloudStopResponse = z.infer<typeof stopResponse>;
export type CloudOperationSummary = z.infer<typeof operationSummary>;
export type CloudOperationPage = z.infer<typeof operationPage>;
export type PublishResult = CloudOperationResponse & {
	publisherId: string;
	localSource: "current" | "changed" | "unavailable";
};

const grant = z.strictObject({ email: z.string(), active: z.boolean(), generation: z.number().int().positive() });
const grantMutation = z.strictObject({
	operation: z.strictObject({
		id: z.string().uuid(),
		kind: z.enum(["invite", "revoke"]),
		state: z.literal("succeeded"),
		result: z.strictObject({
			publicationId: z.string(),
			grant,
			changed: z.boolean(),
		}),
	}),
	currentGrant: grant,
});
export type GrantMutation = z.infer<typeof grantMutation>;

export class CloudPublicationFailure extends SpoolError {
	constructor(
		message: string,
		readonly detail: {
			operation?: CloudOperation;
			publication?: CloudPublication;
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
	publicationId?: string;
	progress?: (message: string) => void;
}

export async function publishWebsite(options: PublishOptions): Promise<PublishResult> {
	const origin = options.origin ?? cloudOrigin(process.env);
	const sourceVault = options.vault ?? keychainVault(options.spoolDir, origin);
	const token = await sourceVault.read();
	if (token === undefined) throw new SpoolError("not signed in; run `spool login`");
	const cloudOptions: AuthOptions = {
		...options,
		origin,
		vault: { read: async () => token, write: async () => {}, delete: async () => {} },
	};
	const account = await session(options.spoolDir, cloudOptions);
	let remote: CloudPublication | undefined;
	if (options.publicationId !== undefined)
		remote = await readCurrentPublication(options.spoolDir, options.publicationId, cloudOptions);
	const scenario = options.scenario ?? remote?.scenario ?? "default";
	const identity = associationIdentity(
		options.spoolDir,
		origin,
		account.publisherId,
		options.root,
		options.entry,
		scenario,
	);
	let association = readAssociation(options.spoolDir, identity);
	if (
		association !== undefined &&
		options.publicationId !== undefined &&
		association.publicationId !== options.publicationId
	)
		association = undefined;
	if (remote === undefined && association?.publicationId !== undefined)
		remote = await readCurrentPublication(options.spoolDir, association.publicationId, cloudOptions);
	if (
		options.publicationId === undefined &&
		remote !== undefined &&
		(remote.entry !== association?.identity.entry || remote.scenario !== association.identity.scenario)
	)
		throw new SpoolError(
			"this local publication association no longer matches the remote entry or scenario; use --publication to rebind deliberately",
		);
	let recovered: CloudOperationResponse | undefined;
	if (association !== undefined)
		recovered = await operationStatusOrMissing(options.spoolDir, association.intent.operationId, cloudOptions);

	options.progress?.("capturing website");
	let artifact: WebsiteArtifact;
	try {
		artifact = await buildWebsite({
			root: realpathSync(resolve(options.root)),
			entry: options.entry,
			version: options.version,
			...(options.scenario === undefined && remote === undefined ? {} : { scenario }),
		});
	} catch (error) {
		if (recovered?.operation.state === "succeeded") {
			if (association !== undefined)
				rememberPublication(
					options.spoolDir,
					association,
					recovered.operation.result?.publication ?? recovered.publication,
					true,
					true,
				);
			return { ...recovered, publisherId: account.publisherId, localSource: "unavailable" };
		}
		throw error;
	}
	if (association !== undefined) {
		const changed =
			artifact.manifest.contentIdentity !== association.intent.contentIdentity ||
			artifact.inputIdentity !== association.intent.inputIdentity;
		if (
			recovered?.operation.state === "succeeded" &&
			!changed &&
			options.invitedEmails === undefined &&
			remote?.state === "active" &&
			remote.currentVersion?.contentIdentity === artifact.manifest.contentIdentity
		)
			return { ...recovered, publisherId: account.publisherId, localSource: changed ? "changed" : "current" };
		if (recovered !== undefined && !terminal(recovered.operation)) {
			if (changed) throw new SpoolError("local work changed while a publication update is still in progress");
		} else {
			if (remote === undefined) throw new SpoolError("the publication could not be read before updating");
			if (recovered !== undefined && terminal(recovered.operation))
				discardAssociationUpdateIntent(options.spoolDir, association);
			association = claimAssociationUpdate(
				options.spoolDir,
				association,
				artifact,
				remote.revision,
				remote.accessGeneration,
				normalizeOptionalInvitations(options.invitedEmails),
			);
			recovered = await operationStatusOrMissing(options.spoolDir, association.intent.operationId, cloudOptions);
		}
	} else {
		const invitedEmails =
			remote === undefined
				? normalizeInvitations(options.invitedEmails ?? [])
				: normalizeOptionalInvitations(options.invitedEmails);
		const title = (options.title ?? remote?.title ?? options.entry).trim();
		if (title.length < 1 || title.length > 200) throw new SpoolError("publication title must be 1 to 200 characters");
		association =
			remote === undefined
				? claimAssociation(options.spoolDir, identity, artifact, title, invitedEmails)
				: claimExplicitAssociationUpdate(
						options.spoolDir,
						identity,
						{
							projectId: remote.projectId,
							publicationId: remote.id,
							hostname: remote.hostname,
							url: remote.url,
							title,
						},
						artifact,
						remote.revision,
						remote.accessGeneration,
						invitedEmails,
					);
		if (association.intent.contentIdentity !== artifact.manifest.contentIdentity)
			throw new SpoolError("local work changed while another publish command claimed this project");
		if (remote !== undefined) {
			recovered = await operationStatusOrMissing(options.spoolDir, association.intent.operationId, cloudOptions);
			if (recovered !== undefined && ["failed", "conflict", "expired"].includes(recovered.operation.state)) {
				discardAssociationUpdateIntent(options.spoolDir, association);
				association = claimExplicitAssociationUpdate(
					options.spoolDir,
					identity,
					{
						projectId: remote.projectId,
						publicationId: remote.id,
						hostname: remote.hostname,
						url: remote.url,
						title,
					},
					artifact,
					remote.revision,
					remote.accessGeneration,
					invitedEmails,
				);
				recovered = undefined;
			}
		}
	}

	const captured = readCapture(options.spoolDir, association.intent.operationId);
	let current = recovered ?? (await createOrRecover(options.spoolDir, association, captured, cloudOptions));
	association = rememberPublication(
		options.spoolDir,
		association,
		current.publication,
		options.publicationId === undefined,
	);
	if (terminal(current.operation)) {
		const finished = finish(current);
		association = rememberPublication(
			options.spoolDir,
			association,
			finished.operation.result?.publication ?? finished.publication,
			true,
			true,
		);
		return resultWithLocalSource(finished, association, options);
	}
	if (current.operation.state === "uploading") {
		for (const index of current.operation.missingObjectIndices) {
			const metadata = captured.manifest.objects[index];
			const object = metadata === undefined ? undefined : captured.objects.get(metadata.path);
			if (metadata === undefined || object === undefined)
				throw new SpoolError("the captured publication object is missing");
			options.progress?.(`uploading ${index + 1}/${captured.manifest.objects.length}`);
			await uploadObject(
				options.spoolDir,
				association.intent.operationId,
				index,
				`/api/publication-operations/${encodeURIComponent(association.intent.operationId)}/objects/${index}`,
				{ method: "PUT", headers: { "content-type": "application/octet-stream" }, body: Buffer.from(object.bytes) },
				cloudOptions,
			);
		}
		current =
			(await operationStatusOrMissing(options.spoolDir, association.intent.operationId, cloudOptions)) ?? current;
		options.progress?.("sealing website");
		current = await mutateAndRecover(
			options.spoolDir,
			association.intent.operationId,
			`/api/publication-operations/${encodeURIComponent(association.intent.operationId)}/seal`,
			{ method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
			cloudOptions,
		);
	}
	if (current.operation.state === "sealed") {
		options.progress?.("activating website");
		current = await mutateAndRecover(
			options.spoolDir,
			association.intent.operationId,
			`/api/publication-operations/${encodeURIComponent(association.intent.operationId)}/activate`,
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
	const finished = finish(current);
	association = rememberPublication(
		options.spoolDir,
		association,
		finished.operation.result?.publication ?? finished.publication,
		true,
		true,
	);
	return resultWithLocalSource(finished, association, options);
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
		const recovered = await recoverAfterFailure(spoolDir, operationId, options, error);
		if (error instanceof CloudApiError)
			throw withOperationId(error, operationId, recovered?.operation, recovered?.publication);
		if (recovered !== undefined && !recovered.operation.missingObjectIndices.includes(index)) return;
		await requestJson(spoolDir, path, init, options);
	}
}

export async function listPublications(
	spoolDir: string,
	options: AuthOptions = {},
): Promise<{
	publications: CloudPublication[];
	operationSummaries: z.infer<typeof publicationOperationSummaries>[];
	nextCursor: string | null;
}> {
	const cloudOptions = { ...options, origin: options.origin ?? cloudOrigin(process.env) };
	await session(spoolDir, cloudOptions);
	const response = await requestJson(spoolDir, "/api/publications", {}, cloudOptions);
	return z
		.strictObject({
			publications: z.array(publication),
			operationSummaries: z.array(publicationOperationSummaries),
			nextCursor: z.string().nullable(),
		})
		.parse(response);
}

export async function publicationStatus(
	spoolDir: string,
	id: string,
	options: AuthOptions = {},
): Promise<{
	publication: CloudPublication;
	operation?: CloudOperation;
	operations: CloudOperationSummary[];
	nextCursor: string | null;
	localSource: "current" | "changed" | "unavailable";
}> {
	const cloudOptions = { ...options, origin: options.origin ?? cloudOrigin(process.env) };
	const account = await session(spoolDir, cloudOptions);
	const response = await requestJson(spoolDir, `/api/publications/${encodeURIComponent(id)}`, {}, cloudOptions);
	const current = z.strictObject({ publication }).parse(response);
	const history = await publicationOperations(spoolDir, id, { ...cloudOptions, limit: 50 });
	const association = findPublicationAssociation(
		spoolDir,
		cloudOptions.origin,
		account.publisherId,
		current.publication.id,
	);
	if (association === undefined) return { ...current, ...history, localSource: "unavailable" };
	const operation = await operationStatusOrMissing(spoolDir, association.intent.operationId, cloudOptions);
	const localSource = await readLocalSource(association, undefined, current.publication);
	return {
		...current,
		...history,
		...(operation === undefined ? {} : { operation: operation.operation }),
		localSource,
	};
}

export async function publicationOperations(
	spoolDir: string,
	id: string,
	options: AuthOptions & { cursor?: string; limit?: number } = {},
): Promise<CloudOperationPage> {
	const cloudOptions = { ...options, origin: options.origin ?? cloudOrigin(process.env) };
	await session(spoolDir, cloudOptions);
	const query = new URLSearchParams();
	if (options.cursor !== undefined) query.set("cursor", options.cursor);
	if (options.limit !== undefined) query.set("limit", String(options.limit));
	const suffix = query.size === 0 ? "" : `?${query}`;
	return operationPage.parse(
		await requestJson(spoolDir, `/api/publications/${encodeURIComponent(id)}/operations${suffix}`, {}, cloudOptions),
	);
}

export async function stopPublication(
	spoolDir: string,
	id: string,
	options: AuthOptions = {},
): Promise<CloudStopResponse> {
	const cloudOptions = { ...options, origin: options.origin ?? cloudOrigin(process.env) };
	const account = await session(spoolDir, cloudOptions);
	const operationId = claimStopIntent(spoolDir, cloudOptions.origin, account.publisherId, id);
	const clearIntent = () => clearStopIntent(spoolDir, cloudOptions.origin, account.publisherId, id, operationId);
	const path = `/api/publications/${encodeURIComponent(id)}/stop`;
	const init: RequestInit = {
		method: "POST",
		headers: { "content-type": "application/json", "idempotency-key": operationId },
		body: "{}",
	};
	let last: unknown;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const result = readStop(await requestJson(spoolDir, path, init, cloudOptions, 1), operationId, id);
			clearIntent();
			return result;
		} catch (error) {
			last = error;
		}
		if (++attempt > 3) break;
		try {
			const result = readStop(
				await requestJson(
					spoolDir,
					`/api/publication-operations/${encodeURIComponent(operationId)}`,
					{},
					cloudOptions,
					1,
				),
				operationId,
				id,
			);
			clearIntent();
			return result;
		} catch (error) {
			last = error;
			if (!(error instanceof CloudApiError && error.status === 404) && attempt >= 3) break;
		}
	}
	if (last instanceof CloudPublicationFailure)
		throw new CloudPublicationFailure(last.message, { ...last.detail, operationId });
	if (last instanceof CloudRequestFailure)
		throw new CloudPublicationFailure(last.message, { code: last.code, retryable: true, operationId });
	throw last;
}

export async function mutatePublicationGrant(
	spoolDir: string,
	publicationId: string,
	email: string,
	kind: "invite" | "revoke",
	options: AuthOptions = {},
): Promise<GrantMutation> {
	const cloudOptions = { ...options, origin: options.origin ?? cloudOrigin(process.env) };
	await session(spoolDir, cloudOptions);
	const normalized = normalizeGrantMailbox(email);
	const operationId = crypto.randomUUID();
	const path = `/api/publications/${encodeURIComponent(publicationId)}/${kind}`;
	const init: RequestInit = {
		method: "POST",
		headers: { "content-type": "application/json", "idempotency-key": operationId },
		body: JSON.stringify({ email: normalized }),
	};
	try {
		let response: unknown;
		for (let attempt = 1; ; attempt++) {
			try {
				response = await requestJson(spoolDir, path, init, cloudOptions, 1);
				break;
			} catch (error) {
				const retryableTransport = error instanceof CloudRequestFailure;
				const retryableService =
					error instanceof CloudPublicationFailure &&
					error.detail.retryable &&
					error.detail.retryAfter === undefined;
				if (attempt >= 3 || (!retryableTransport && !retryableService)) throw error;
			}
		}
		const result = grantMutation.parse(response);
		if (
			result.operation.id !== operationId ||
			result.operation.kind !== kind ||
			result.operation.result.publicationId !== publicationId ||
			result.operation.result.grant.email !== normalized
		)
			throw new SpoolError("spool.page returned a different invitation operation");
		return result;
	} catch (error) {
		if (error instanceof CloudRequestFailure) {
			throw new CloudPublicationFailure(error.message, {
				code: error.code,
				retryable: error.retryable,
				operationId,
			});
		}
		if (error instanceof CloudPublicationFailure) {
			throw new CloudPublicationFailure(error.message, { ...error.detail, operationId });
		}
		throw error;
	}
}

async function createOrRecover(
	spoolDir: string,
	association: ReturnType<typeof claimAssociation>,
	artifact: WebsiteArtifact,
	options: AuthOptions,
): Promise<CloudOperationResponse> {
	const intent = association.intent;
	const update = intent.kind === "update";
	if (update && association.publicationId === undefined)
		throw new SpoolError("the local publication update intent is incomplete");
	const body = JSON.stringify(
		update
			? {
					manifest: artifact.manifest,
					expectedRevision: intent.expectedRevision,
					expectedAccessGeneration: intent.expectedAccessGeneration,
					...(intent.invitedEmails.length === 0 ? {} : { invitedEmails: intent.invitedEmails }),
				}
			: {
					projectId: association.projectId,
					title: association.title,
					invitedEmails: intent.invitedEmails,
					manifest: artifact.manifest,
				},
	);
	const path = update
		? `/api/publications/${encodeURIComponent(association.publicationId ?? "")}/operations`
		: "/api/publications";
	try {
		return readOperation(
			await requestJson(
				spoolDir,
				path,
				{
					method: "POST",
					headers: { "content-type": "application/json", "idempotency-key": association.intent.operationId },
					body,
				},
				options,
			),
			association.intent.operationId,
			artifact.manifest.contentIdentity,
		);
	} catch (error) {
		const recovered = await recoverAfterFailure(spoolDir, association.intent.operationId, options, error);
		if (recovered !== undefined) return recovered;
		if (error instanceof CloudApiError) throw withOperationId(error, association.intent.operationId);
		return readOperation(
			await requestJson(
				spoolDir,
				path,
				{
					method: "POST",
					headers: { "content-type": "application/json", "idempotency-key": association.intent.operationId },
					body,
				},
				options,
			),
			association.intent.operationId,
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
		const recovered = await recoverAfterFailure(spoolDir, operationId, options, error);
		if (error instanceof CloudApiError)
			throw withOperationId(error, operationId, recovered?.operation, recovered?.publication);
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
async function requestJson(
	spoolDir: string,
	path: string,
	init: RequestInit,
	options: AuthOptions,
	maxAttempts = 3,
): Promise<unknown> {
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
			attempt < maxAttempts &&
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
function normalizeOptionalInvitations(values: string[] | undefined): string[] {
	if (values === undefined || values.length === 0) return [];
	return normalizeInvitations(values);
}
function normalizeMailbox(value: string): string {
	const trimmed = value.trim();
	const at = trimmed.lastIndexOf("@");
	return at < 1 ? trimmed : `${trimmed.slice(0, at)}@${trimmed.slice(at + 1).toLowerCase()}`;
}
function normalizeGrantMailbox(value: string): string {
	const normalized = normalizeMailbox(value);
	if (normalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized))
		throw new SpoolError("recipient must be a valid email address");
	return normalized;
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
function readStop(value: unknown, operationId: string, publicationId: string): CloudStopResponse {
	const parsed = stopResponse.parse(value);
	if (
		parsed.operation.id !== operationId ||
		parsed.operation.publicationId !== publicationId ||
		parsed.publication.id !== publicationId ||
		parsed.operation.result.publication.id !== publicationId
	)
		throw new SpoolError("spool.page returned a different stop operation");
	return parsed;
}
async function readCurrentPublication(spoolDir: string, id: string, options: AuthOptions): Promise<CloudPublication> {
	return z
		.strictObject({ publication })
		.parse(await requestJson(spoolDir, `/api/publications/${encodeURIComponent(id)}`, {}, options)).publication;
}
function rememberPublication(
	spoolDir: string,
	association: ReturnType<typeof claimAssociation>,
	value: CloudPublication,
	persist = true,
	successful = false,
) {
	if (value.ownerId !== association.identity.publisherId || value.projectId !== association.projectId)
		throw new SpoolError("spool.page returned a publication for a different owner or project");
	const next = {
		...association,
		publicationId: value.id,
		hostname: value.hostname,
		url: value.url,
		...(successful
			? {
					binding: {
						operationId: association.intent.operationId,
						contentIdentity: association.intent.contentIdentity,
						inputIdentity: association.intent.inputIdentity,
					},
				}
			: {}),
	};
	return persist ? bindAssociation(spoolDir, next) : next;
}
async function resultWithLocalSource(
	result: CloudOperationResponse,
	association: ReturnType<typeof claimAssociation>,
	options: PublishOptions,
): Promise<PublishResult> {
	return {
		...result,
		publisherId: association.identity.publisherId,
		localSource: await readLocalSource(association, options.version),
	};
}
async function readLocalSource(
	association: ReturnType<typeof claimAssociation>,
	version?: string,
	current?: CloudPublication,
): Promise<"current" | "changed" | "unavailable"> {
	const binding = association.binding;
	if (binding === undefined) return "unavailable";
	try {
		const producerVersion =
			version ?? readCapture(association.identity.instance, binding.operationId).manifest.producer.version;
		const artifact = await buildWebsite({
			root: association.identity.root,
			entry: association.identity.entry,
			version: producerVersion,
			...(association.identity.scenario === "default" ? {} : { scenario: association.identity.scenario }),
		});
		return current?.currentVersion !== undefined
			? artifact.manifest.contentIdentity === current.currentVersion?.contentIdentity
				? "current"
				: "changed"
			: artifact.inputIdentity === binding.inputIdentity
				? "current"
				: "changed";
	} catch {
		return "unavailable";
	}
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
	publicationValue?: CloudPublication,
): CloudPublicationFailure {
	return new CloudPublicationFailure(error.message, {
		...error.detail,
		operationId,
		...(operation === undefined ? {} : { operation }),
		...(publicationValue === undefined ? {} : { publication: publicationValue }),
	});
}
async function recoverAfterFailure(
	spoolDir: string,
	operationId: string,
	options: AuthOptions,
	original: unknown,
): Promise<CloudOperationResponse | undefined> {
	try {
		return await operationStatusOrMissing(spoolDir, operationId, options);
	} catch {
		if (original instanceof CloudRequestFailure)
			throw new CloudPublicationFailure(original.message, {
				operationId,
				code: original.code,
				retryable: original.retryable,
			});
		throw original;
	}
}
function retrySeconds(body: unknown, header: string | null): number | undefined {
	if (typeof body === "number" && Number.isFinite(body) && body >= 0) return body;
	if (header === null) return undefined;
	if (/^\d+$/u.test(header)) return Number(header);
	const at = Date.parse(header);
	return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}
