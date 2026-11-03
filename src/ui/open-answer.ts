import type { Finding } from "./api";
import type { Ask } from "./open-sheet";
import { tilde } from "./paths";

/** What Open… does with a finding: open the project at once, get a team's copy and open it, ask first, or say no. */
export type Answer =
	| { kind: "open"; root: string }
	| { kind: "get"; team: string; project: string; checkout: string | null }
	| { kind: "ask"; ask: Ask; finding: Extract<Finding, { kind: "folder" | "file" | "repo" }> }
	| { kind: "nothing"; says: string };

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A file's size the way Finder prints it. */
export function sizeOf(bytes: number): string {
	if (bytes < 1000) return count(bytes, "byte", "bytes");
	if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
	return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** The one rule, whatever brought it: designs open at once, a team's project comes down, what spool would make is asked. */
export function answerOf(finding: Finding): Answer {
	switch (finding.kind) {
		case "project":
			return { kind: "open", root: finding.root };
		case "team":
			return { kind: "get", team: finding.team, project: finding.project, checkout: finding.checkout };
		case "nothing":
			return finding;
		case "folder":
			return {
				kind: "ask",
				finding,
				ask: {
					face: "folder",
					name: finding.name,
					says: "No designs here yet, so its canvas starts empty.",
					detail: finding.code
						? [
								[tilde(finding.path), "git", finding.branch].filter(Boolean).join(" · "),
								"adds design/ beside the code · the code is left as it is",
							]
						: [
								`${tilde(finding.path)} · ${count(finding.items, "item", "items")}`,
								"adds design/ inside it · nothing else changes",
							],
					act: "Design in this folder",
				},
			};
		case "file":
			return {
				kind: "ask",
				finding,
				ask: {
					face: "file",
					name: finding.name,
					says: "spool keeps a copy of its frames with your projects.",
					detail: [`${tilde(finding.path)} · ${sizeOf(finding.bytes)}`, `into ${tilde(finding.into)}`],
					act: "Import",
				},
			};
		case "repo":
			return {
				kind: "ask",
				finding,
				ask: {
					face: "link",
					name: finding.name,
					says: "spool clones it to your Mac and opens it.",
					detail: [
						[finding.repo, finding.branch].filter(Boolean).join(" · "),
						`git clone into ${tilde(finding.into)}`,
					],
					act: "Clone",
				},
			};
	}
}

/** A link has to be asked about on the network, so its sheet says it is looking; a path answers at once. */
export function isLink(given: string): boolean {
	return (
		/^(?:[a-z][a-z0-9+.-]*:\/\/(?!\/)|[\w.-]+@[\w.-]+:|[\w-]+(?:\.[\w-]+)+\/)/iu.test(given.trim()) &&
		!given.trim().startsWith("file:")
	);
}
