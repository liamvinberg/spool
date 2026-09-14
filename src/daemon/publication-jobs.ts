import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { cloudOrigin, session } from "../cloud-auth";
import {
	type CloudPublication,
	CloudPublicationFailure,
	mutatePublicationGrant,
	publicationStatus,
	publishWebsite,
	stopPublication,
} from "../cloud-publication";
import { SpoolError } from "../errors";
import {
	associationIdentity,
	type PublicationAssociation,
	readAssociation,
	readUpdateIntent,
} from "../publication/associations";
import { createFlowGraph } from "./flows";
import { type PublicationReadiness, publicationReadiness } from "./publication-readiness";

const TERMINAL_RETENTION_MS = 30 * 60_000;
const MAX_RETAINED_JOBS = 64;

export type PublicationAssociationState = "missing" | "incomplete" | "current" | "superseded" | "mismatched";
export type PublicationSourceState = "current" | "changed" | "unavailable";
export type PlayerPublication = Pick<
	CloudPublication,
	"id" | "url" | "invitedEmails" | "state" | "revision" | "accessGeneration"
>;

export interface PublicationShareModel {
	available: boolean;
	title: string;
	entry: string;
	scenario: string;
	included: string[];
	ready: boolean;
	diagnostics: PublicationReadiness["diagnostics"];
	association: PublicationAssociationState;
	source: PublicationSourceState;
	recipients: string[];
	publication?: PlayerPublication;
	problem?: string;
	job?: PublicationJobView;
}

export type PublicationJobKind = "create" | "update";
export type PublicationJobPhase = "capturing" | "uploading" | "sealing" | "activating";
export type PublicationJobView =
	| { id: string; kind: PublicationJobKind; state: "running"; phase: PublicationJobPhase; email?: string }
	| {
			id: string;
			kind: PublicationJobKind;
			state: "succeeded";
			publication: PlayerPublication;
			source: PublicationSourceState;
	  }
	| { id: string; kind: PublicationJobKind; state: "failed"; message: string; retryable: boolean; email?: string };

export interface PublicationJobRequest {
	root: string;
	project: string;
	entry: string;
	scenario: string;
	email?: string;
}

type PublicationStatus = Awaited<ReturnType<typeof publicationStatus>>;
export interface PublicationJobServices {
	account(spoolDir: string): Promise<{ publisherId: string }>;
	readiness(root: string, entry: string): Promise<PublicationReadiness>;
	status(spoolDir: string, publicationId: string): Promise<PublicationStatus>;
	publish(options: {
		spoolDir: string;
		expectedPublisherId: string;
		root: string;
		entry: string;
		scenario: string;
		invitedEmails?: string[];
		title: string;
		version: string;
		publicationId?: string;
		progress(message: string): void;
	}): Promise<Awaited<ReturnType<typeof publishWebsite>>>;
	grant(
		spoolDir: string,
		publicationId: string,
		email: string,
		kind: "invite" | "revoke",
		expectedPublisherId: string,
	): Promise<unknown>;
	stop(spoolDir: string, publicationId: string, expectedPublisherId: string): Promise<unknown>;
	origin(): string;
}

interface RetainedJob {
	key: string;
	root: string;
	publisherId: string;
	publicationId?: string;
	view: PublicationJobView;
	updatedAt: number;
	running?: Promise<void>;
}
interface Inspection {
	account: { publisherId: string };
	readiness: PublicationReadiness;
	identity: ReturnType<typeof associationIdentity>;
	association?: PublicationAssociation;
	status?: PublicationStatus;
	associationState: PublicationAssociationState;
	problem?: string;
}

export function createPublicationJobs({
	spoolDir,
	version,
	services = defaultServices(),
	now = Date.now,
}: {
	spoolDir: string;
	version: string;
	services?: PublicationJobServices;
	now?: () => number;
}) {
	const jobs = new Map<string, RetainedJob>();
	const latest = new Map<string, string>();
	const statusReads = new Map<string, Promise<PublicationStatus>>();
	const key = (root: string, entry: string, scenario: string, publisherId: string) =>
		`${services.origin()}\0${publisherId}\0${realpathSync(resolve(root))}\0${entry}\0${scenario}`;

	function remove(id: string, job: RetainedJob): void {
		jobs.delete(id);
		if (latest.get(job.key) === id) latest.delete(job.key);
	}
	function prune(): void {
		const cutoff = now() - TERMINAL_RETENTION_MS;
		for (const [id, job] of jobs) if (job.view.state !== "running" && job.updatedAt < cutoff) remove(id, job);
		if (jobs.size <= MAX_RETAINED_JOBS) return;
		const terminal = [...jobs.entries()]
			.filter(([, job]) => job.view.state !== "running")
			.sort((left, right) => left[1].updatedAt - right[1].updatedAt);
		for (const [id, job] of terminal) {
			if (jobs.size <= MAX_RETAINED_JOBS) break;
			remove(id, job);
		}
	}
	function reserveSlot(): void {
		if (jobs.size < MAX_RETAINED_JOBS) return;
		const terminal = [...jobs.entries()]
			.filter(([, job]) => job.view.state !== "running")
			.sort((left, right) => left[1].updatedAt - right[1].updatedAt);
		for (const [id, job] of terminal) {
			remove(id, job);
			if (jobs.size < MAX_RETAINED_JOBS) return;
		}
		throw new SpoolError("Too many links are being published. Try again when one finishes.");
	}
	function recent(root: string, entry: string, scenario: string, publisherId: string): RetainedJob | undefined {
		prune();
		const id = latest.get(key(root, entry, scenario, publisherId));
		return id === undefined ? undefined : jobs.get(id);
	}
	function readStatus(identityKey: string, publicationId: string): Promise<PublicationStatus> {
		const statusKey = `${identityKey}\0${publicationId}`;
		const current = statusReads.get(statusKey);
		if (current !== undefined) return current;
		const pending = services.status(spoolDir, publicationId);
		statusReads.set(statusKey, pending);
		void pending.then(
			() => {
				if (statusReads.get(statusKey) === pending) statusReads.delete(statusKey);
			},
			() => {
				if (statusReads.get(statusKey) === pending) statusReads.delete(statusKey);
			},
		);
		return pending;
	}
	async function readFreshStatus(identityKey: string, publicationId: string): Promise<PublicationStatus> {
		const statusKey = `${identityKey}\0${publicationId}`;
		for (;;) {
			const earlier = statusReads.get(statusKey);
			if (earlier === undefined) break;
			try {
				await earlier;
			} catch {}
		}
		return readStatus(identityKey, publicationId);
	}
	function unavailable(request: Omit<PublicationJobRequest, "email">): PublicationShareModel {
		return {
			available: false,
			title: request.project,
			entry: request.entry,
			scenario: request.scenario,
			included: [],
			ready: false,
			diagnostics: [],
			association: "missing",
			source: "unavailable",
			recipients: [],
		};
	}
	async function isCurrentPublisher(expected: string): Promise<boolean> {
		try {
			return (await services.account(spoolDir)).publisherId === expected;
		} catch {
			return false;
		}
	}
	async function inspect(
		request: Omit<PublicationJobRequest, "email">,
		account?: { publisherId: string },
	): Promise<Inspection | undefined> {
		let current = account;
		try {
			current ??= await services.account(spoolDir);
		} catch {
			return;
		}
		const readiness = await services.readiness(request.root, request.entry);
		if (!(await isCurrentPublisher(current.publisherId))) return;
		const identity = associationIdentity(
			spoolDir,
			services.origin(),
			current.publisherId,
			request.root,
			request.entry,
			request.scenario,
		);
		let association = readAssociation(spoolDir, identity);
		if (association === undefined) return { account: current, readiness, identity, associationState: "missing" };
		if (association.supersededBy !== undefined)
			return {
				account: current,
				readiness,
				identity,
				association,
				associationState: "superseded",
				problem: "This local publication association was rebound elsewhere. Use the CLI to target it deliberately.",
			};
		if (association.publicationId === undefined)
			return { account: current, readiness, identity, association, associationState: "incomplete" };
		let status: PublicationStatus;
		try {
			status = await readStatus(
				key(request.root, request.entry, request.scenario, current.publisherId),
				association.publicationId,
			);
		} catch {
			if (!(await isCurrentPublisher(current.publisherId))) return;
			return {
				account: current,
				readiness,
				identity,
				association,
				associationState: association.binding === undefined ? "incomplete" : "current",
				problem: "Sharing could not be checked. Try again.",
			};
		}
		if (!(await isCurrentPublisher(current.publisherId))) return;
		const latest = readAssociation(spoolDir, identity);
		if (latest === undefined) return { account: current, readiness, identity, associationState: "missing" };
		if (latest.supersededBy !== undefined)
			return {
				account: current,
				readiness,
				identity,
				association: latest,
				associationState: "superseded",
				problem: "This local publication association was rebound elsewhere. Use the CLI to target it deliberately.",
			};
		if (latest.publicationId !== association.publicationId)
			return {
				account: current,
				readiness,
				identity,
				association: latest,
				associationState: "mismatched",
				problem: "This local publication association changed while sharing was checked. Try again.",
			};
		if (!sameAssociationVersion(association, latest))
			return {
				account: current,
				readiness,
				identity,
				association: latest,
				associationState: latest.binding === undefined ? "incomplete" : "current",
				problem: "Sharing changed while it was checked. Try again.",
			};
		association = latest;
		if (
			status.publication.id !== association.publicationId ||
			status.publication.ownerId !== current.publisherId ||
			status.publication.entry !== identity.entry ||
			status.publication.scenario !== identity.scenario
		)
			return {
				account: current,
				readiness,
				identity,
				association,
				status,
				associationState: "mismatched",
				problem:
					"This local publication association no longer matches the remote entry or scenario. Use the CLI to rebind it deliberately.",
			};
		return {
			account: current,
			readiness,
			identity,
			association,
			status,
			associationState: association.binding === undefined ? "incomplete" : "current",
		};
	}

	async function model(request: Omit<PublicationJobRequest, "email">): Promise<PublicationShareModel> {
		const checked = await inspect(request);
		if (checked === undefined) return unavailable(request);
		const observed = recent(request.root, request.entry, request.scenario, checked.account.publisherId);
		const remote = checked.status?.publication;
		const source =
			checked.associationState === "current" ? (checked.status?.localSource ?? "unavailable") : "unavailable";
		const recipients = remote?.invitedEmails ?? checked.association?.intent.invitedEmails ?? [];
		const relevant = relevantJob(checked, observed, source);
		return {
			available: true,
			title: request.project,
			entry: request.entry,
			scenario: request.scenario,
			included: checked.readiness.included,
			ready: checked.readiness.ok,
			diagnostics: checked.readiness.diagnostics,
			association: checked.associationState,
			source,
			recipients,
			...(remote === undefined ? {} : { publication: pickPublication(remote) }),
			...(checked.problem === undefined ? {} : { problem: checked.problem }),
			...(relevant === undefined ? {} : { job: relevant }),
		};
	}
	function relevantJob(
		checked: Inspection,
		observed: RetainedJob | undefined,
		source: PublicationSourceState,
	): PublicationJobView | undefined {
		const view = observed?.view;
		if (view?.state === "running") return view;
		if (
			view?.state === "failed" &&
			((view.kind === "create" && checked.status === undefined && checked.associationState !== "current") ||
				(view.kind === "update" &&
					checked.status?.publication.state === "active" &&
					source !== "current" &&
					observed?.publicationId === checked.association?.publicationId))
		)
			return view;
		const association = checked.association;
		const status = checked.status;
		if (association === undefined || status === undefined) return;
		const pending = readUpdateIntent(spoolDir, checked.identity, association.publicationId);
		const intent = pending ?? (association.binding === undefined ? association : undefined);
		if (intent === undefined || status.operation?.id !== intent.intent.operationId) return;
		const kind: PublicationJobKind = intent.intent.kind;
		const label = kind === "update" ? "update" : "link";
		const message =
			status.operation.error?.message ??
			(status.operation.state === "succeeded"
				? `The ${label} needs to be finished. Try again.`
				: `The ${label} was interrupted. Try again.`);
		return {
			id: status.operation.id,
			kind,
			state: "failed",
			message,
			retryable: true,
			...(intent.intent.invitedEmails[0] === undefined ? {} : { email: intent.intent.invitedEmails[0] }),
		};
	}

	async function start(request: PublicationJobRequest): Promise<PublicationJobView> {
		prune();
		const checked = await inspect(request);
		if (checked === undefined)
			throw new SpoolError("Cloud account changed before the link could be published. Try again.");
		if (!checked.readiness.ok) throw new SpoolError("This prototype is not ready to share.");
		if (checked.associationState === "superseded" || checked.associationState === "mismatched")
			throw new SpoolError(checked.problem ?? "This publication must be reconnected deliberately.");
		if (checked.association?.publicationId !== undefined && checked.status === undefined)
			throw new SpoolError(checked.problem ?? "Sharing could not be checked. Try again.");
		const remote = checked.status?.publication;
		const publicationId = remote?.id ?? checked.association?.publicationId;
		const kind: PublicationJobKind = publicationId === undefined ? "create" : "update";
		const email = request.email?.trim();
		const recipients = remote?.invitedEmails ?? checked.association?.intent.invitedEmails ?? [];
		if (kind === "create" && recipients.length === 0 && !validEmail(email))
			throw new SpoolError("Enter the person’s email address.");
		if (email !== undefined && email !== "" && !validEmail(email))
			throw new SpoolError("Enter the person’s email address.");
		const jobKey = key(request.root, request.entry, request.scenario, checked.account.publisherId);
		const existingId = latest.get(jobKey);
		const existing = existingId === undefined ? undefined : jobs.get(existingId);
		if (existing?.view.state === "running") return existing.view;
		reserveSlot();
		const id = crypto.randomUUID();
		const job: RetainedJob = {
			key: jobKey,
			root: realpathSync(resolve(request.root)),
			publisherId: checked.account.publisherId,
			...(publicationId === undefined ? {} : { publicationId }),
			view: {
				id,
				kind,
				state: "running",
				phase: "capturing",
				...(email === undefined || email === "" ? {} : { email }),
			},
			updatedAt: now(),
		};
		jobs.set(id, job);
		latest.set(jobKey, id);
		job.running = run(job, request, email);
		return job.view;
	}
	async function run(job: RetainedJob, request: PublicationJobRequest, email: string | undefined): Promise<void> {
		try {
			const result = await services.publish({
				spoolDir,
				expectedPublisherId: job.publisherId,
				root: request.root,
				entry: request.entry,
				scenario: request.scenario,
				...(email === undefined || email === "" ? {} : { invitedEmails: [email] }),
				title: request.project,
				version,
				...(job.publicationId === undefined ? {} : { publicationId: job.publicationId }),
				progress: (message) => {
					if (job.view.state !== "running") return;
					job.view = {
						id: job.view.id,
						kind: job.view.kind,
						state: "running",
						phase: phaseOf(message),
						...(job.view.email === undefined ? {} : { email: job.view.email }),
					};
					job.updatedAt = now();
				},
			});
			if (result.publisherId !== job.publisherId || result.publication.ownerId !== job.publisherId)
				throw new SpoolError("Cloud account changed while the link was being published. Try again.");
			if (job.publicationId !== undefined && result.publication.id !== job.publicationId)
				throw new SpoolError("The publication changed while the link was being published. Try again.");
			job.view = {
				id: job.view.id,
				kind: job.view.kind,
				state: "succeeded",
				publication: pickPublication(result.publication),
				source: result.localSource,
			};
		} catch (error) {
			const kind = job.view.kind;
			const heldEmail = "email" in job.view ? job.view.email : undefined;
			job.view = {
				id: job.view.id,
				kind,
				state: "failed",
				message: error instanceof Error ? error.message : "The link could not be published. Try again.",
				retryable: kind === "update" || !(error instanceof CloudPublicationFailure) || error.detail.retryable,
				...(heldEmail === undefined ? {} : { email: heldEmail }),
			};
		} finally {
			job.updatedAt = now();
			delete job.running;
			prune();
		}
	}

	async function mutablePublication(
		request: Omit<PublicationJobRequest, "email">,
		requireActive: boolean,
	): Promise<Inspection & { status: PublicationStatus }> {
		const checked = await inspect(request);
		if (checked === undefined) throw new SpoolError("Cloud account changed. Try again.");
		if (checked.associationState !== "current" || checked.status === undefined)
			throw new SpoolError(checked.problem ?? "This publication must be reconnected deliberately.");
		if (requireActive && checked.status.publication.state !== "active")
			throw new SpoolError("This link is not currently shared.");
		if (!(await isCurrentPublisher(checked.account.publisherId)))
			throw new SpoolError("Cloud account changed. Try again.");
		return { ...checked, status: checked.status };
	}
	async function freshPublication(
		request: Omit<PublicationJobRequest, "email">,
		publisherId: string,
		publicationId: string,
	): Promise<PlayerPublication> {
		const current = await readFreshStatus(
			key(request.root, request.entry, request.scenario, publisherId),
			publicationId,
		);
		if (!(await isCurrentPublisher(publisherId)) || current.publication.ownerId !== publisherId)
			throw new SpoolError("Cloud account changed. Try again.");
		if (current.publication.entry !== request.entry || current.publication.scenario !== request.scenario)
			throw new SpoolError("This publication must be reconnected deliberately.");
		return pickPublication(current.publication);
	}
	async function grant(
		request: Omit<PublicationJobRequest, "email"> & { email: string; kind: "invite" | "revoke" },
	): Promise<PlayerPublication> {
		const checked = await mutablePublication(request, request.kind === "invite");
		if (!validEmail(request.email)) throw new SpoolError("Enter the person’s email address.");
		await services.grant(
			spoolDir,
			checked.status.publication.id,
			request.email,
			request.kind,
			checked.account.publisherId,
		);
		return freshPublication(request, checked.account.publisherId, checked.status.publication.id);
	}
	async function stop(request: Omit<PublicationJobRequest, "email">): Promise<PlayerPublication> {
		const checked = await mutablePublication(request, true);
		await services.stop(spoolDir, checked.status.publication.id, checked.account.publisherId);
		return freshPublication(request, checked.account.publisherId, checked.status.publication.id);
	}
	async function read(root: string, id: string): Promise<PublicationJobView | undefined> {
		prune();
		let account: { publisherId: string };
		try {
			account = await services.account(spoolDir);
		} catch {
			return;
		}
		const job = jobs.get(id);
		return job !== undefined && job.root === realpathSync(resolve(root)) && job.publisherId === account.publisherId
			? job.view
			: undefined;
	}
	return { model, start, read, grant, stop };
}

function defaultServices(): PublicationJobServices {
	const origin = () => cloudOrigin(process.env);
	return {
		account: (spoolDir) => session(spoolDir, { origin: origin() }),
		readiness: (root, entry) => publicationReadiness(createFlowGraph(), root, entry),
		status: (spoolDir, publicationId) => publicationStatus(spoolDir, publicationId, { origin: origin() }),
		publish: (options) => publishWebsite({ ...options, origin: origin() }),
		grant: (spoolDir, publicationId, email, kind, expectedPublisherId) =>
			mutatePublicationGrant(spoolDir, publicationId, email, kind, { origin: origin(), expectedPublisherId }),
		stop: (spoolDir, publicationId, expectedPublisherId) =>
			stopPublication(spoolDir, publicationId, { origin: origin(), expectedPublisherId }),
		origin,
	};
}
function pickPublication(publication: CloudPublication): PlayerPublication {
	return {
		id: publication.id,
		url: publication.url,
		invitedEmails: publication.invitedEmails,
		state: publication.state,
		revision: publication.revision,
		accessGeneration: publication.accessGeneration,
	};
}
function phaseOf(message: string): PublicationJobPhase {
	if (message.startsWith("uploading")) return "uploading";
	if (message.startsWith("sealing")) return "sealing";
	if (message.startsWith("activating")) return "activating";
	return "capturing";
}
function validEmail(value: string | undefined): value is string {
	return value !== undefined && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function sameAssociationVersion(left: PublicationAssociation, right: PublicationAssociation): boolean {
	return (
		left.key === right.key &&
		left.publicationId === right.publicationId &&
		left.supersededBy === right.supersededBy &&
		left.intent.operationId === right.intent.operationId &&
		left.intent.contentIdentity === right.intent.contentIdentity &&
		left.intent.inputIdentity === right.intent.inputIdentity &&
		left.binding?.operationId === right.binding?.operationId &&
		left.binding?.contentIdentity === right.binding?.contentIdentity &&
		left.binding?.inputIdentity === right.binding?.inputIdentity
	);
}
