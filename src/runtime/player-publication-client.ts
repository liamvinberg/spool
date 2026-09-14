export interface PlayerPublication {
	id: string;
	url: string;
	invitedEmails: string[];
	state: "staging" | "active" | "stopped" | "suspended";
	revision: number;
	accessGeneration: number;
}

export type PlayerPublicationJob =
	| {
			id: string;
			kind: "create" | "update";
			state: "running";
			phase: "capturing" | "uploading" | "sealing" | "activating";
			email?: string;
	  }
	| {
			id: string;
			kind: "create" | "update";
			state: "succeeded";
			publication: PlayerPublication;
			source: "current" | "changed" | "unavailable";
	  }
	| {
			id: string;
			kind: "create" | "update";
			state: "failed";
			message: string;
			retryable: boolean;
			email?: string;
	  };

export interface PlayerPublicationModel {
	available: boolean;
	title: string;
	entry: string;
	scenario: string;
	included: string[];
	ready: boolean;
	diagnostics: { code: string; frame: string; message: string; remedy: string; path?: string; line?: number }[];
	association: "missing" | "incomplete" | "current" | "superseded" | "mismatched";
	source: "current" | "changed" | "unavailable";
	recipients: string[];
	publication?: PlayerPublication;
	problem?: string;
	job?: PlayerPublicationJob;
}

export interface PlayerPublicationClient {
	model(): Promise<PlayerPublicationModel>;
	start(email?: string): Promise<PlayerPublicationJob>;
	job(id: string): Promise<PlayerPublicationJob>;
	grant(email: string, kind: "invite" | "revoke"): Promise<PlayerPublication>;
	stop(): Promise<PlayerPublication>;
	subscribe(listener: () => void): () => void;
}

export function createPlayerPublicationClient(config: {
	path: string;
	entry: string;
	scenario: string;
	controlToken: string;
}): PlayerPublicationClient {
	const headers = { "x-spool-control": config.controlToken };
	const params = new URLSearchParams({ entry: config.entry, scenario: config.scenario });
	const fields = { entry: config.entry, scenario: config.scenario };
	const post = (path: string, body: object) =>
		fetch(path, {
			method: "POST",
			headers: { ...headers, "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	return {
		model: async () => readModel(await fetch(`${config.path}?${params}`, { headers })),
		start: async (email) =>
			readJob(await post(`${config.path}/jobs`, { ...fields, ...(email === undefined ? {} : { email }) })),
		job: async (id) => readJob(await fetch(`${config.path}/jobs/${encodeURIComponent(id)}`, { headers })),
		grant: async (email, kind) => readPublication(await post(`${config.path}/grants`, { ...fields, email, kind })),
		stop: async () => readPublication(await post(`${config.path}/stop`, fields)),
		subscribe: (listener) => {
			const foreground = () => {
				if (document.visibilityState === "visible") listener();
			};
			window.addEventListener("spool-player-publication-change", listener);
			window.addEventListener("focus", foreground);
			document.addEventListener("visibilitychange", foreground);
			return () => {
				window.removeEventListener("spool-player-publication-change", listener);
				window.removeEventListener("focus", foreground);
				document.removeEventListener("visibilitychange", foreground);
			};
		},
	};
}

async function readModel(response: Response): Promise<PlayerPublicationModel> {
	const value = await responseJson(response);
	if (!response.ok || !isRecord(value)) throw new Error("Sharing could not be checked. Try again.");
	const included = strings(value.included);
	const recipients = strings(value.recipients);
	const diagnostics = Array.isArray(value.diagnostics) ? value.diagnostics.filter(isDiagnostic) : undefined;
	if (
		typeof value.available !== "boolean" ||
		typeof value.title !== "string" ||
		typeof value.entry !== "string" ||
		typeof value.scenario !== "string" ||
		typeof value.ready !== "boolean" ||
		!(
			value.association === "missing" ||
			value.association === "incomplete" ||
			value.association === "current" ||
			value.association === "superseded" ||
			value.association === "mismatched"
		) ||
		!(value.source === "current" || value.source === "changed" || value.source === "unavailable") ||
		included === undefined ||
		recipients === undefined ||
		diagnostics === undefined ||
		(value.problem !== undefined && typeof value.problem !== "string")
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
		association: value.association,
		source: value.source,
		recipients,
		...(publication === undefined ? {} : { publication }),
		...(value.problem === undefined ? {} : { problem: value.problem }),
		...(job === undefined ? {} : { job }),
	};
}

async function readJob(response: Response): Promise<PlayerPublicationJob> {
	const value = await responseJson(response);
	const job = jobOf(value);
	if (!response.ok || job === undefined)
		throw new Error(messageOf(value, "Sharing could not be completed. Try again."));
	return job;
}
async function readPublication(response: Response): Promise<PlayerPublication> {
	const value = await responseJson(response);
	const publication = publicationOf(value);
	if (!response.ok || publication === undefined)
		throw new Error(messageOf(value, "Sharing could not be completed. Try again."));
	return publication;
}
async function responseJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return;
	}
}
function jobOf(value: unknown): PlayerPublicationJob | undefined {
	if (!isRecord(value) || typeof value.id !== "string" || !(value.kind === "create" || value.kind === "update"))
		return;
	if (
		value.state === "running" &&
		(value.email === undefined || typeof value.email === "string") &&
		(value.phase === "capturing" ||
			value.phase === "uploading" ||
			value.phase === "sealing" ||
			value.phase === "activating")
	)
		return {
			id: value.id,
			kind: value.kind,
			state: value.state,
			phase: value.phase,
			...(value.email === undefined ? {} : { email: value.email }),
		};
	if (value.state === "succeeded") {
		const publication = publicationOf(value.publication);
		if (
			publication === undefined ||
			!(value.source === "current" || value.source === "changed" || value.source === "unavailable")
		)
			return;
		return { id: value.id, kind: value.kind, state: value.state, publication, source: value.source };
	}
	if (
		value.state === "failed" &&
		typeof value.message === "string" &&
		typeof value.retryable === "boolean" &&
		(value.email === undefined || typeof value.email === "string")
	)
		return {
			id: value.id,
			kind: value.kind,
			state: value.state,
			message: value.message,
			retryable: value.retryable,
			...(value.email === undefined ? {} : { email: value.email }),
		};
}
function publicationOf(value: unknown): PlayerPublication | undefined {
	if (
		!isRecord(value) ||
		typeof value.id !== "string" ||
		typeof value.url !== "string" ||
		!(
			value.state === "staging" ||
			value.state === "active" ||
			value.state === "stopped" ||
			value.state === "suspended"
		) ||
		!Number.isInteger(value.revision) ||
		!Number.isInteger(value.accessGeneration)
	)
		return;
	const invitedEmails = strings(value.invitedEmails);
	return invitedEmails === undefined
		? undefined
		: {
				id: value.id,
				url: value.url,
				invitedEmails,
				state: value.state,
				revision: value.revision as number,
				accessGeneration: value.accessGeneration as number,
			};
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
function messageOf(value: unknown, fallback: string): string {
	return isRecord(value) && typeof value.message === "string" ? value.message : fallback;
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
