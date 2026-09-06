import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function checksForPaths(paths: readonly string[]) {
	return {
		full: paths.some((path) => !path.startsWith("design/") && !path.startsWith("docs/")),
		design: paths.some((path) => path.startsWith("design/")),
		desktop: paths.some(
			(path) => path.startsWith("desktop/") || path.startsWith(".github/") || path === "package.json",
		),
	};
}

export function changedPaths(event: string, before: string, after: string): string[] | null {
	if (event !== "push" && event !== "pull_request") return null;
	if (!before || /^0+$/.test(before)) return null;
	if (![before, after].every((sha) => /^[a-f0-9]{40}$/.test(sha))) {
		throw new Error("Expected complete commit SHAs for CI change detection.");
	}
	// Compare every commit in a push; PRs compare with their branch point.
	const revision = event === "pull_request" ? `${before}...${after}` : `${before}..${after}`;
	return execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", revision, "--"], { encoding: "utf8" })
		.split("\0")
		.filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as {
		before?: string;
		after?: string;
		pull_request?: { base: { sha: string }; head: { sha: string } };
	};
	const paths = changedPaths(
		process.env.GITHUB_EVENT_NAME ?? "",
		event.pull_request?.base.sha ?? event.before ?? "",
		event.pull_request?.head.sha ?? event.after ?? "",
	);
	const checks = paths === null ? { full: true, design: true, desktop: true } : checksForPaths(paths);
	appendFileSync(
		process.env.GITHUB_OUTPUT ?? "",
		Object.entries(checks)
			.map(([name, required]) => `${name}=${required}\n`)
			.join(""),
	);
}
