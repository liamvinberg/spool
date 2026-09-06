import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createExtensionRuntime, type ResourceLoader } from "@earendil-works/pi-coding-agent";
import { skillText } from "../skill";
import type { BundledFilePolicy } from "./bundled-files";

/** Project instructions are text. This loader never performs pi resource discovery. */
export function bundledResources(root: string, policy: BundledFilePolicy): ResourceLoader {
	const extensions = { extensions: [], errors: [], runtime: createExtensionRuntime() };
	return {
		getExtensions: () => extensions,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({
			agentsFiles: ["AGENTS.md", "CLAUDE.md", "design/AGENTS.md"].flatMap((name) => {
				const path = join(root, name);
				if (!existsSync(path)) return [];
				try {
					return [{ path, content: readFileSync(policy.path(path), "utf8") }];
				} catch {
					return [];
				}
			}),
		}),
		getSystemPrompt: () =>
			`You are spool, helping the person design live TSX frames in this project. Follow the supplied Spool skill and project instructions. The selection in each message is the selection captured when that message was sent. Reference images are look-only input. Only use tools that are explicitly available.\n\n${skillText()}`,
		getSystemPromptSource: () => undefined,
		getAppendSystemPrompt: () => [],
		getAppendSystemPromptSources: () => [],
		extendResources: () => {},
		reload: async () => {},
	};
}
