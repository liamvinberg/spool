export interface PlayerPublication {
	id: string;
	url: string;
	invitedEmails: string[];
}

export type PlayerPublicationJob =
	| { id: string; state: "running"; phase: "capturing" | "uploading" | "sealing" | "activating"; email: string }
	| { id: string; state: "succeeded"; publication: PlayerPublication }
	| { id: string; state: "failed"; message: string; retryable: boolean; email: string };

export interface PlayerPublicationModel {
	available: boolean;
	title: string;
	entry: string;
	scenario: string;
	included: string[];
	ready: boolean;
	diagnostics: { code: string; frame: string; message: string; remedy: string; path?: string; line?: number }[];
	publication?: PlayerPublication;
	job?: PlayerPublicationJob;
}

export interface PlayerPublicationClient {
	model(): Promise<PlayerPublicationModel>;
	start(email: string): Promise<PlayerPublicationJob>;
	job(id: string): Promise<PlayerPublicationJob>;
}

export function createPlayerPublicationClient(config: {
	path: string;
	entry: string;
	scenario: string;
	controlToken: string;
}): PlayerPublicationClient {
	const headers = { "x-spool-control": config.controlToken };
	const params = new URLSearchParams({ entry: config.entry, scenario: config.scenario });
	return {
		model: async () => readModel(await fetch(`${config.path}?${params}`, { headers })),
		start: async (email) =>
			readJob(
				await fetch(`${config.path}/jobs`, {
					method: "POST",
					headers: { ...headers, "content-type": "application/json" },
					body: JSON.stringify({ entry: config.entry, scenario: config.scenario, email }),
				}),
			),
		job: async (id) => readJob(await fetch(`${config.path}/jobs/${encodeURIComponent(id)}`, { headers })),
	};
}

async function readModel(response: Response): Promise<PlayerPublicationModel> {
	const value = await responseJson(response);
	if (!response.ok || !isRecord(value)) throw new Error("Sharing could not be checked. Try again.");
	const included = strings(value.included);
	const diagnostics = Array.isArray(value.diagnostics) ? value.diagnostics.filter(isDiagnostic) : undefined;
	if (
		typeof value.available !== "boolean" ||
		typeof value.title !== "string" ||
		typeof value.entry !== "string" ||
		typeof value.scenario !== "string" ||
		typeof value.ready !== "boolean" ||
		included === undefined ||
		diagnostics === undefined
	)
		throw new Error("Sharing could not be checked. Try again.");
	const publication = value.publication === undefined ? undefined : publicationOf(value.publication);
	const job = value.job === undefined ? undefined : jobOf(value.job);
	if ((value.publication !== undefined && publication === undefined) || (value.job !== undefined && job === undefined))
		throw new Error("Sharing could not be checked. Try again.");
	return {
		available: value.available,
		title: value.title,
		entry: value.entry,
		scenario: value.scenario,
		included,
		ready: value.ready,
		diagnostics,
		...(publication === undefined ? {} : { publication }),
		...(job === undefined ? {} : { job }),
	};
}

async function readJob(response: Response): Promise<PlayerPublicationJob> {
	const value = await responseJson(response);
	const job = jobOf(value);
	if (!response.ok || job === undefined) throw new Error("Sharing could not be completed. Try again.");
	return job;
}

async function responseJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
}

function jobOf(value: unknown): PlayerPublicationJob | undefined {
	if (!isRecord(value) || typeof value.id !== "string") return;
	if (
		value.state === "running" &&
		typeof value.email === "string" &&
		(value.phase === "capturing" ||
			value.phase === "uploading" ||
			value.phase === "sealing" ||
			value.phase === "activating")
	)
		return { id: value.id, state: value.state, phase: value.phase, email: value.email };
	if (value.state === "succeeded") {
		const publication = publicationOf(value.publication);
		return publication === undefined ? undefined : { id: value.id, state: value.state, publication };
	}
	if (
		value.state === "failed" &&
		typeof value.message === "string" &&
		typeof value.retryable === "boolean" &&
		typeof value.email === "string"
	)
		return {
			id: value.id,
			state: value.state,
			message: value.message,
			retryable: value.retryable,
			email: value.email,
		};
}

function publicationOf(value: unknown): PlayerPublication | undefined {
	if (!isRecord(value) || typeof value.id !== "string" || typeof value.url !== "string") return;
	const invitedEmails = strings(value.invitedEmails);
	return invitedEmails === undefined ? undefined : { id: value.id, url: value.url, invitedEmails };
}

function isDiagnostic(value: unknown): value is PlayerPublicationModel["diagnostics"][number] {
	return (
		isRecord(value) &&
		typeof value.code === "string" &&
		typeof value.frame === "string" &&
		typeof value.message === "string" &&
		typeof value.remedy === "string" &&
		(value.path === undefined || typeof value.path === "string") &&
		(value.line === undefined || typeof value.line === "number")
	);
}

function strings(value: unknown): string[] | undefined {
	return Array.isArray(value) && value.every((item): item is string => typeof item === "string") ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
