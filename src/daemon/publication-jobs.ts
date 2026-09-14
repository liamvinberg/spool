import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { cloudOrigin, session } from "../cloud-auth";
import {
	type CloudPublication,
	CloudPublicationFailure,
	publicationStatus,
	publishWebsite,
} from "../cloud-publication";
import { SpoolError } from "../errors";
import { associationIdentity, readAssociation } from "../publication/associations";
import { createFlowGraph } from "./flows";
import { type PublicationReadiness, publicationReadiness } from "./publication-readiness";

const TERMINAL_RETENTION_MS = 30 * 60_000;
const MAX_RETAINED_JOBS = 64;

export interface PublicationShareModel {
	available: boolean;
	title: string;
	entry: string;
	scenario: string;
	included: string[];
	ready: boolean;
	diagnostics: PublicationReadiness["diagnostics"];
	publication?: Pick<CloudPublication, "id" | "url" | "invitedEmails">;
	job?: PublicationJobView;
}

export type PublicationJobPhase = "capturing" | "uploading" | "sealing" | "activating";

export type PublicationJobView =
	| { id: string; state: "running"; phase: PublicationJobPhase; email: string }
	| {
			id: string;
			state: "succeeded";
			publication: Pick<CloudPublication, "id" | "url" | "invitedEmails">;
	  }
	| { id: string; state: "failed"; message: string; retryable: boolean; email: string };

export interface PublicationJobRequest {
	root: string;
	project: string;
	entry: string;
	scenario: string;
	email: string;
}

export interface PublicationJobServices {
	account(spoolDir: string): Promise<{ publisherId: string }>;
	readiness(root: string, entry: string): Promise<PublicationReadiness>;
	status(spoolDir: string, publicationId: string): Promise<Awaited<ReturnType<typeof publicationStatus>>>;
	publish(options: {
		spoolDir: string;
		expectedPublisherId: string;
		root: string;
		entry: string;
		scenario: string;
		invitedEmails: string[];
		title: string;
		version: string;
		progress(message: string): void;
	}): Promise<Awaited<ReturnType<typeof publishWebsite>>>;
	origin(): string;
}

interface RetainedJob {
	key: string;
	root: string;
	publisherId: string;
	view: PublicationJobView;
	updatedAt: number;
	running?: Promise<void>;
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

	function key(root: string, entry: string, scenario: string, publisherId: string): string {
		return `${services.origin()}\0${publisherId}\0${realpathSync(resolve(root))}\0${entry}\0${scenario}`;
	}

	function prune(): void {
		const cutoff = now() - TERMINAL_RETENTION_MS;
		for (const [id, job] of jobs) {
			if (job.view.state !== "running" && job.updatedAt < cutoff) remove(id, job);
		}
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
		throw new SpoolError("Too many links are being created. Try again when one finishes.");
	}

	function remove(id: string, job: RetainedJob): void {
		jobs.delete(id);
		if (latest.get(job.key) === id) latest.delete(job.key);
	}

	function recent(root: string, entry: string, scenario: string, publisherId: string): PublicationJobView | undefined {
		prune();
		const id = latest.get(key(root, entry, scenario, publisherId));
		return id === undefined ? undefined : jobs.get(id)?.view;
	}

	async function model(request: Omit<PublicationJobRequest, "email">): Promise<PublicationShareModel> {
		const unavailable = {
			available: false,
			title: request.project,
			entry: request.entry,
			scenario: request.scenario,
			included: [],
			ready: false,
			diagnostics: [],
		};
		let account: { publisherId: string };
		try {
			account = await services.account(spoolDir);
		} catch {
			return unavailable;
		}
		const readiness = await services.readiness(request.root, request.entry);
		if (!(await isCurrentPublisher(account.publisherId))) return unavailable;
		const observed = recent(request.root, request.entry, request.scenario, account.publisherId);
		const base = {
			...unavailable,
			included: readiness.included,
			ready: readiness.ok,
			diagnostics: readiness.diagnostics,
			...(observed === undefined ? {} : { job: observed }),
		};
		const association = readAssociation(
			spoolDir,
			associationIdentity(
				spoolDir,
				services.origin(),
				account.publisherId,
				request.root,
				request.entry,
				request.scenario,
			),
		);
		if (association?.publicationId === undefined) return { ...base, available: true };
		try {
			const current = await services.status(spoolDir, association.publicationId);
			if (!(await isCurrentPublisher(account.publisherId))) return unavailable;
			return {
				...base,
				available: true,
				publication: pickPublication(current.publication),
			};
		} catch {
			return (await isCurrentPublisher(account.publisherId)) ? { ...base, available: true } : unavailable;
		}
	}

	async function start(request: PublicationJobRequest): Promise<PublicationJobView> {
		prune();
		const account = await services.account(spoolDir);
		const readiness = await services.readiness(request.root, request.entry);
		if (!(await isCurrentPublisher(account.publisherId)))
			throw new SpoolError("Cloud account changed before the link could be created. Try again.");
		if (!readiness.ok) throw new SpoolError("This prototype is not ready to share.");
		const jobKey = key(request.root, request.entry, request.scenario, account.publisherId);
		const existingId = latest.get(jobKey);
		const existing = existingId === undefined ? undefined : jobs.get(existingId);
		if (existing?.view.state === "running") return existing.view;
		reserveSlot();

		const id = crypto.randomUUID();
		const job: RetainedJob = {
			key: jobKey,
			root: realpathSync(resolve(request.root)),
			publisherId: account.publisherId,
			view: { id, state: "running", phase: "capturing", email: request.email },
			updatedAt: now(),
		};
		jobs.set(id, job);
		latest.set(jobKey, id);
		job.running = run(job, request);
		return job.view;
	}

	async function isCurrentPublisher(expected: string): Promise<boolean> {
		try {
			return (await services.account(spoolDir)).publisherId === expected;
		} catch {
			return false;
		}
	}

	async function run(job: RetainedJob, request: PublicationJobRequest): Promise<void> {
		try {
			const result = await services.publish({
				spoolDir,
				expectedPublisherId: job.publisherId,
				root: request.root,
				entry: request.entry,
				scenario: request.scenario,
				invitedEmails: [request.email],
				title: request.project,
				version,
				progress: (message) => {
					if (job.view.state !== "running") return;
					job.view = { id: job.view.id, state: "running", phase: phaseOf(message), email: job.view.email };
					job.updatedAt = now();
				},
			});
			if (result.publication.ownerId !== job.publisherId)
				throw new SpoolError("Cloud account changed while the link was being created. Try again.");
			job.view = { id: job.view.id, state: "succeeded", publication: pickPublication(result.publication) };
		} catch (error) {
			job.view = {
				id: job.view.id,
				state: "failed",
				message: error instanceof Error ? error.message : "The link could not be created. Try again.",
				retryable: !(error instanceof CloudPublicationFailure) || error.detail.retryable,
				email: request.email,
			};
		} finally {
			job.updatedAt = now();
			delete job.running;
			prune();
		}
	}

	async function read(root: string, id: string): Promise<PublicationJobView | undefined> {
		prune();
		let account: { publisherId: string };
		try {
			account = await services.account(spoolDir);
		} catch {
			return undefined;
		}
		const job = jobs.get(id);
		return job !== undefined && job.root === realpathSync(resolve(root)) && job.publisherId === account.publisherId
			? job.view
			: undefined;
	}

	return { model, start, read };
}

function defaultServices(): PublicationJobServices {
	const origin = () => cloudOrigin(process.env);
	return {
		account: (spoolDir) => session(spoolDir, { origin: origin() }),
		readiness: (root, entry) => publicationReadiness(createFlowGraph(), root, entry),
		status: (spoolDir, publicationId) => publicationStatus(spoolDir, publicationId, { origin: origin() }),
		publish: (options) => publishWebsite({ ...options, origin: origin() }),
		origin,
	};
}

function pickPublication(publication: CloudPublication): Pick<CloudPublication, "id" | "url" | "invitedEmails"> {
	return { id: publication.id, url: publication.url, invitedEmails: publication.invitedEmails };
}

function phaseOf(message: string): PublicationJobPhase {
	if (message.startsWith("uploading")) return "uploading";
	if (message.startsWith("sealing")) return "sealing";
	if (message.startsWith("activating")) return "activating";
	return "capturing";
}
