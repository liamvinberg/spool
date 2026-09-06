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

async function waitForCi(sha: string): Promise<void> {
	if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Expected a complete release commit SHA.");
	const repository = process.env.GITHUB_REPOSITORY;
	const token = process.env.GITHUB_TOKEN;
	if (!repository || !token) throw new Error("GitHub repository and token are required.");
	const request = async <T>(path: string): Promise<T> => {
		const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
			headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) throw new Error(`GitHub CI lookup returned HTTP ${response.status}.`);
		return (await response.json()) as T;
	};
	const deadline = Date.now() + 15 * 60_000;
	while (Date.now() < deadline) {
		const { workflow_runs: runs } = await request<{ workflow_runs: WorkflowRun[] }>(
			`actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`,
		);
		const verdict = await fullCiVerdict(sha, runs, async (id) => {
			const { jobs } = await request<{ jobs: WorkflowJob[] }>(`actions/runs/${id}/jobs?per_page=100`);
			return jobs;
		});
		console.log(verdict.message);
		if (verdict.state === "success") return;
		if (verdict.state === "failed") throw new Error(verdict.message);
		await setTimeout(15_000);
	}
	throw new Error("Full CI did not finish within 15 minutes. Run ci.yml on the release tag before retrying.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	await waitForCi(process.argv[2] ?? "");
}
