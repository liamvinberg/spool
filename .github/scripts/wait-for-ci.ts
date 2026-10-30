import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

interface WorkflowRun {
	id: number;
	head_sha: string;
	event: string;
	status: string;
	conclusion: string | null;
}

interface WorkflowJob {
	name: string;
	conclusion: string | null;
}

type Verdict = { state: "waiting" | "success" | "failed"; message: string };

export async function fullCiVerdict(
	sha: string,
	runs: readonly WorkflowRun[],
	jobsForRun: (id: number) => Promise<readonly WorkflowJob[]>,
): Promise<Verdict> {
	const latest = runs
		.filter((run) => run.head_sha === sha && (run.event === "push" || run.event === "workflow_dispatch"))
		.sort((left, right) => right.id - left.id)[0];
	if (latest === undefined || latest.status !== "completed") {
		return { state: "waiting", message: `Waiting for full CI on ${sha}.` };
	}
	if (latest.conclusion !== "success") {
		return { state: "failed", message: `CI run ${latest.id} finished with ${latest.conclusion}.` };
	}
	const jobs = await jobsForRun(latest.id);
	if (!jobs.some((job) => job.name === "gates" && job.conclusion === "success")) {
		return {
			state: "failed",
			message: `CI run ${latest.id} did not run the full Linux gate. Run ci.yml on the release tag first.`,
		};
	}
	return { state: "success", message: `Full CI passed on ${sha} in run ${latest.id}.` };
}

/** A GitHub answer worth asking again: it is busy, rate limiting, or briefly unreachable. */
export class TransientLookupError extends Error {}

export function isTransientStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

export interface WaitOptions {
	/** One GitHub API call; throws TransientLookupError for an answer worth asking again. */
	request: <T>(path: string) => Promise<T>;
	sleep: (ms: number) => Promise<void>;
	now: () => number;
	log: (message: string) => void;
}

/** Between looks at the CI run. */
export const POLL_MS = 15_000;
/**
 * How long a push takes to show a CI run at all. A run that has started is
 * waited out: its own jobs' timeouts end it, and the job running this wait
 * bounds the whole.
 */
export const NO_RUN_MS = 10 * 60_000;
/** How long GitHub may stay unreachable before the wait gives up on it. */
export const UNREACHABLE_MS = 10 * 60_000;

export async function waitForCi(sha: string, options: WaitOptions): Promise<void> {
	if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Expected a complete release commit SHA.");
	const { request, sleep, now, log } = options;
	const started = now();
	let reachedAt = started;
	let seenRun = false;
	for (;;) {
		try {
			const { workflow_runs: runs } = await request<{ workflow_runs: WorkflowRun[] }>(
				`actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`,
			);
			const verdict = await fullCiVerdict(sha, runs, async (id) => {
				const { jobs } = await request<{ jobs: WorkflowJob[] }>(`actions/runs/${id}/jobs?per_page=100`);
				return jobs;
			});
			reachedAt = now();
			log(verdict.message);
			if (verdict.state === "success") return;
			if (verdict.state === "failed") throw new Error(verdict.message);
			seenRun ||= runs.some(
				(run) => run.head_sha === sha && (run.event === "push" || run.event === "workflow_dispatch"),
			);
			if (!seenRun && now() - started >= NO_RUN_MS)
				throw new Error(
					`No CI run started on ${sha} within ${NO_RUN_MS / 60_000} minutes. Run ci.yml on the release tag before retrying.`,
				);
		} catch (error) {
			if (!(error instanceof TransientLookupError)) throw error;
			log(`${error.message} Asking again.`);
			if (now() - reachedAt >= UNREACHABLE_MS)
				throw new Error(`GitHub's CI lookup kept failing for ${UNREACHABLE_MS / 60_000} minutes: ${error.message}`);
		}
		await sleep(POLL_MS);
	}
}

function githubRequest(repository: string, token: string) {
	return async <T>(path: string): Promise<T> => {
		let response: Response;
		try {
			response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
				headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
				signal: AbortSignal.timeout(15_000),
			});
		} catch (error) {
			throw new TransientLookupError(
				`GitHub CI lookup failed: ${error instanceof Error ? error.message : String(error)}.`,
			);
		}
		if (isTransientStatus(response.status))
			throw new TransientLookupError(`GitHub CI lookup returned HTTP ${response.status}.`);
		if (!response.ok) throw new Error(`GitHub CI lookup returned HTTP ${response.status}.`);
		try {
			return (await response.json()) as T;
		} catch (error) {
			throw new TransientLookupError(
				`GitHub CI lookup sent an unreadable answer: ${error instanceof Error ? error.message : String(error)}.`,
			);
		}
	};
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	const repository = process.env.GITHUB_REPOSITORY;
	const token = process.env.GITHUB_TOKEN;
	if (!repository || !token) throw new Error("GitHub repository and token are required.");
	await waitForCi(process.argv[2] ?? "", {
		request: githubRequest(repository, token),
		sleep: (ms) => setTimeout(ms),
		now: Date.now,
		log: console.log,
	});
}
