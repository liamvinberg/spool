import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SpoolError } from "./errors";
import { EXPERIMENT_IDS, type ExperimentId, experimentDefault, isExperimentId } from "./settings/experiments";

/**
 * The in-package skill: `spool skill [topic…]` prints it, and every agent spool spawns
 * carries its overview. Nothing installs per harness; every install carries its own teacher.
 *
 * The words live in skill/ at the package root, as markdown: `overview.md`, then one file
 * per topic under `topics/`. A topic's file name is its name, and its front matter says
 * the line the overview's index shows for it and, for a topic about an experiment, which
 * one: an experiment that is off on this machine drops its topic from the index and the
 * topic says so when asked. Every claim describes shipped behaviour, so when the runtime
 * changes, the text changes in the same commit.
 */

/**
 * The package root, resolved on demand. The daemon reaches this module to frame the
 * agent it spawns, which puts it on the import graph of browser-environment tests where
 * `import.meta.url` is not a file URL, so nothing here runs merely because the module
 * loaded. `../` is the package root from both src/ and dist/.
 */
const packageRoot = () => fileURLToPath(new URL("../", import.meta.url));

export interface SkillTopic {
	readonly name: string;
	/** the overview index's line for it */
	readonly summary: string;
	/** the experiment it teaches, when it teaches one */
	readonly experiment?: ExperimentId;
	readonly body: string;
}

/** Which experiments are on: by default, what a machine that never chose has. */
export type ExperimentsOn = (id: ExperimentId) => boolean;

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n+/;

/** `key: value` lines between `---` fences, which is all a topic's front matter holds */
function frontMatter(text: string): { fields: Record<string, string>; body: string } {
	const found = FRONT_MATTER.exec(text);
	if (found === null) return { fields: {}, body: text };
	const fields: Record<string, string> = {};
	for (const line of (found[1] ?? "").split("\n")) {
		const at = line.indexOf(":");
		if (at > 0) fields[line.slice(0, at).trim()] = line.slice(at + 1).trim();
	}
	return { fields, body: text.slice(found[0].length) };
}

/** the installed package's own package.json, so a driver loads this install's Playwright */
function fill(text: string): string {
	return text.replaceAll("{{package}}", JSON.stringify(join(packageRoot(), "package.json"))).trimEnd();
}

/** Every topic, by name, read from skill/topics/. A file that breaks the format refuses loudly. */
export function skillTopics(): SkillTopic[] {
	const dir = join(packageRoot(), "skill", "topics");
	return readdirSync(dir)
		.filter((file) => file.endsWith(".md"))
		.sort()
		.map((file) => {
			const name = file.slice(0, -".md".length);
			const { fields, body } = frontMatter(readFileSync(join(dir, file), "utf8"));
			const { summary, experiment } = fields;
			if (summary === undefined || summary === "") {
				throw new SpoolError(`skill/topics/${file} has no summary in its front matter`);
			}
			if (experiment !== undefined && !isExperimentId(experiment)) {
				throw new SpoolError(
					`skill/topics/${file} names the experiment "${experiment}", and there is ${EXPERIMENT_IDS.join(", ")}`,
				);
			}
			return { name, summary, ...(experiment === undefined ? {} : { experiment }), body: fill(body) };
		});
}

function index(topics: readonly SkillTopic[], on: ExperimentsOn): string {
	const shown = topics.filter((topic) => topic.experiment === undefined || on(topic.experiment));
	const width = Math.max(...shown.map((topic) => topic.name.length)) + 2;
	const rows = shown.map((topic) => `  ${topic.name.padEnd(width)}${topic.summary}`);
	return ["Topics, `spool skill <topic>…`:", ...rows].join("\n");
}

/**
 * The overview, one topic, or several topics in one text, each under its name; an unknown
 * one refuses them all. `on` says which experiments this machine has on.
 */
export function skillText(asked: readonly string[] = [], on: ExperimentsOn = experimentDefault): string {
	const topics = skillTopics();
	if (asked.length === 0) {
		const overview = readFileSync(join(packageRoot(), "skill", "overview.md"), "utf8");
		return fill(overview.replace("{{topics}}", index(topics, on)));
	}
	const names = [...new Set(asked)];
	const byName = new Map(topics.map((topic) => [topic.name, topic]));
	const unknown = names.find((name) => !byName.has(name));
	if (unknown !== undefined) {
		throw new SpoolError(`no skill topic "${unknown}" — topics: ${topics.map((topic) => topic.name).join(", ")}`);
	}
	const texts = names.map((name) => {
		const topic = byName.get(name) as SkillTopic;
		if (topic.experiment === undefined || on(topic.experiment)) return topic.body;
		return `${topic.body}\n\n(The ${topic.experiment} experiment is off on this machine: \`spool experiments on ${topic.experiment}\` turns it on.)`;
	});
	if (texts.length === 1) return texts[0] ?? "";
	return names.map((name, at) => `--- ${name} ---\n\n${texts[at]}`).join("\n\n");
}
