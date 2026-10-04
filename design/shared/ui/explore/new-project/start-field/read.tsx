import type { ReactNode } from "react";
import { type Finding, type Project, UNTITLED } from "shared/lib/explore/new-project/places";
import type { Intent, Job, Stage } from "./preview";
import { complete, DIRS, type Host, isLink, isPath, PEOPLE, read, type Reading, readLink, recents, type Scope, slug, trim } from "./world";

type TreeLines = Extract<Stage, { kind: "tree" }>["lines"];

/**
 * The field's reading: given what is typed, the rows under it, the grey completion
 * after the caret, and the one mono line that says what spool sees. Pure, so the
 * Home field and the palette read the same text the same way.
 */

export interface Row {
	id: string;
	intent: Intent;
	/** Home keeps the recents under what you typed, quieter */
	dim?: boolean;
}

export interface Read {
	rows: Row[];
	ghost: string;
	status: string;
	/** keys that apply right now, right-aligned under the field */
	keys: string;
	/** a mono label drawn above the row at each index */
	labels: { at: number; text: string }[];
}

const SCOPES: { scope: Scope; name: string }[] = [
	{ scope: "own", name: "your projects" },
	{ scope: "tidemark", name: "tidemark" },
];

export function readField(query: string, scope: Scope, host: Host, projects: Project[], readDone: string | null, job: Job | null, keep: boolean): Read {
	const core = readCore(query, scope, host, projects, readDone, job);
	if (!keep || (query.trim() === "" && !job) || query.trimStart().startsWith("@")) return core;
	const listed = new Set(core.rows.map((row) => row.id));
	if (job) listed.add(job.id);
	const rest = recents(projects, scope).filter((project) => !listed.has(project.id));
	if (rest.length === 0) return core;
	return {
		...core,
		labels: [...core.labels, { at: core.rows.length, text: scope === "own" ? "recent" : "tidemark" }],
		rows: [...core.rows, ...rest.map((project): Row => ({ id: project.id, intent: project.onMac === false ? { do: "fetch", project } : { do: "open", project }, dim: true }))],
	};
}

function readCore(query: string, scope: Scope, host: Host, projects: Project[], readDone: string | null, job: Job | null): Read {
	const q = query.trimStart();
	const mine = recents(projects, scope);
	const where = scope === "own" ? "~/spool" : "~/spool/tidemark";

	if (job) {
		return {
			rows: [{ id: `job-${job.id}`, intent: job.kind === "clone" ? { do: "clone", finding: readLink(job.from) } : { do: "fetch", project: projects.find((project) => project.id === job.id)! } }],
			ghost: "",
			status:
				job.stage === "reading"
					? `reading ${job.into} · ${job.frames > 0 ? `design/ · ${job.frames} frames` : "no design/ · adding one"}`
					: job.kind === "clone"
						? `cloning ${job.from} · ${Math.round(job.progress * 100)}%`
						: `getting ${job.name} from ${job.from} · ${job.frames} frames · ${Math.round(job.progress * 100)}%`,
			keys: "esc cancels",
			labels: [],
		};
	}

	if (q.startsWith("@")) {
		const stem = q.slice(1).toLowerCase();
		const hits = SCOPES.filter((item) => item.name.startsWith(stem) || (item.scope === "own" && "yours".startsWith(stem)));
		const first = hits[0];
		return {
			rows: hits.map((item) => ({ id: `scope-${item.scope}`, intent: { do: "scope", scope: item.scope } })),
			ghost: first && first.name.startsWith(stem) ? (first.scope === "own" ? "your projects" : "Tidemark").slice(stem.length) : "",
			status: "@ picks who a new project belongs to",
			keys: "tab picks · esc clears",
			labels: [],
		};
	}

	if (q === "") {
		const rows: Row[] = mine.map((project) => ({ id: project.id, intent: project.onMac === false ? { do: "fetch", project } : { do: "open", project } }));
		if (host === "app") rows.push({ id: "choose", intent: { do: "choose" } });
		return {
			rows,
			ghost: "",
			status:
				host === "app"
					? `↵ new ${scope === "own" ? "draft" : "tidemark project"} in ${where} · ⌘O choose a folder`
					: `↵ new ${scope === "own" ? "draft" : "tidemark project"} in ${where} · paste a path to use a folder`,
			keys: scope === "own" ? "@ for a team" : "⌫ back to yours",
			labels: [{ at: 0, text: scope === "own" ? "recent" : "tidemark" }],
		};
	}

	if (isLink(q)) {
		const finding = readLink(q.trim());
		return {
			rows: [{ id: finding.into, intent: { do: "clone", finding } }],
			ghost: "",
			status: `git link · ${finding.url} · clones into ${finding.into}`,
			keys: "↵ clones",
			labels: [],
		};
	}

	if (isPath(q)) return readPath(q, projects, readDone);

	const lower = q.trim().toLowerCase();
	const matches = mine.filter((project) => project.name.toLowerCase().includes(lower));
	const prefix = matches.find((project) => project.name.toLowerCase().startsWith(lower));
	const taken = projects.some((project) => project.name.toLowerCase() === lower);
	const name = taken ? `${q.trim()} 2` : q.trim();
	const create: Row = { id: `create`, intent: { do: "create", name } };
	const other: Scope = scope === "own" ? "tidemark" : "own";
	const elsewhere: Row = { id: `create-${other}`, intent: { do: "create", name, scope: other } };
	const found = matches.map((project): Row => ({ id: project.id, intent: project.onMac === false ? { do: "fetch", project } : { do: "open", project } }));
	return {
		rows: prefix ? [...found, create, elsewhere] : [create, elsewhere, ...found],
		ghost: prefix && q === q.trimEnd() ? prefix.name.slice(q.length) : "",
		status: scope === "own" ? `draft · ${where}/${slug(name)}` : `tidemark · ${where}/${slug(name)} · jonas, mira and sam get it`,
		keys: prefix ? "tab completes" : "↵ creates",
		labels: found.length > 0 ? [{ at: prefix ? 0 : 2, text: "projects" }] : [],
	};
}

function readPath(q: string, projects: Project[], readDone: string | null): Read {
	const listing = q.endsWith("/");
	const at = trim(q.trim());
	const reading = read(at, projects);
	const rows: Row[] = [];
	let status = "";
	if (reading && reading.kind !== "dir") {
		if (readDone !== at) {
			rows.push({ id: `reading-${at}`, intent: { do: "reading", path: at } });
			status = `reading ${at}…`;
		} else {
			rows.push(actionFor(reading, at));
			status = statusFor(reading);
		}
	}
	const { parent, names } = listing ? { parent: at, names: DIRS_OF(at) } : complete(at);
	const own = at.split("/").pop() ?? "";
	const candidates = names.filter((name) => listing || name !== own).map((name) => `${parent}/${name}`);
	for (const text of candidates) rows.push({ id: `dir-${text}`, intent: { do: "complete", text, reading: read(text, projects) } });
	if (!status) status = candidates.length > 0 ? `${listing ? at : parent} · ${candidates.length} ${candidates.length === 1 ? "folder" : "folders"}` : `no folder at ${at}`;
	if (rows.length === 0) rows.push({ id: "none", intent: { do: "none", text: `no folder at ${at}` } });
	const first = !listing && names[0] && names[0] !== own ? names[0] : null;
	const stem = listing ? "" : own;
	return {
		rows,
		ghost: first && first.toLowerCase().startsWith(stem.toLowerCase()) && q === q.trimEnd() ? first.slice(stem.length) : "",
		status,
		keys: candidates.length > 0 ? "tab completes" : "esc clears",
		labels: candidates.length > 0 && rows[0]?.intent.do !== "complete" ? [{ at: 1, text: "folders" }] : [],
	};
}

const DIRS_OF = (path: string) => DIRS[path] ?? [];

function actionFor(reading: Reading, at: string): Row {
	if (reading.kind === "known") return { id: reading.project.id, intent: { do: "open", project: reading.project } };
	if (reading.kind === "finding") return { id: reading.finding.kind === "inside" ? "tvarso" : at, intent: { do: "adopt", finding: reading.finding } };
	return { id: "none", intent: { do: "none", text: at } };
}

function statusFor(reading: Reading): string {
	if (reading.kind === "known") return `already in spool · ${reading.project.frames} frames`;
	if (reading.kind !== "finding") return "";
	const finding = reading.finding;
	switch (finding.kind) {
		case "project":
			return `design/ · ${finding.frames} frames${finding.branch ? ` · ${finding.branch}` : ""}`;
		case "repo":
			return `git · ${finding.branch} · ${finding.stack} · no design/ yet`;
		case "inside":
			return `inside ${finding.root} · design/ at its root`;
		case "plain":
			return "folder · no git · no design/";
		default:
			return "";
	}
}

/** the short tag a folder row carries, the same reading at a glance */
export function tagFor(reading: Reading | null): string {
	if (!reading) return "";
	if (reading.kind === "dir") return "folder";
	if (reading.kind === "known") return "in spool";
	const finding = reading.finding;
	if (finding.kind === "project") return `design/ · ${finding.frames} frames`;
	if (finding.kind === "repo") return "git · no design/";
	if (finding.kind === "inside") return `inside ${finding.name}`;
	if (finding.kind === "plain") return "folder · no git";
	return "";
}

/* ── what a row says, and what its preview draws ───────────────── */

export interface Said {
	verb: string;
	name?: string;
	tail?: string;
	detail: string;
	glyph: "art" | "plus" | "folder" | "link" | "get" | "team" | "finder" | "wait" | "none";
	art?: Project["art"];
	stageId?: string;
	stage: Stage;
	title: ReactNode;
	meta: string[];
	body?: ReactNode;
}

const nameOf = (name: string) => name || UNTITLED;

export function say(intent: Intent, scope: Scope, job: Job | null, projects: Project[]): Said {
	const team = scope === "tidemark";
	switch (intent.do) {
		case "create": {
			const shared = (intent.scope ?? scope) === "tidemark";
			const name = nameOf(intent.name);
			const path = `${shared ? "~/spool/tidemark" : "~/spool"}/${slug(name)}`;
			return {
				verb: shared ? "Create" : "Create draft",
				name,
				...(shared ? { tail: "in Tidemark" } : {}),
				detail: path,
				glyph: "plus",
				stageId: `${intent.scope ?? scope}-${slug(name)}`,
				stage: { kind: "blank", name, team: shared },
				title: name,
				meta: [path, shared ? "tidemark · relayed by Spool Cloud" : "draft · on this Mac"],
				body: shared ? (
					<>Jonas, Mira and Sam see it in Tidemark the moment it exists, and each of their Macs gets the files.</>
				) : intent.name === "" ? (
					<>↵ starts it now and an agent can write frames into it at once. Name it here first, or later on its canvas.</>
				) : (
					<>spool keeps drafts in ~/spool. A draft can move into a repo or into Tidemark later.</>
				),
			};
		}
		case "open": {
			const project = intent.project;
			const here = project.here ?? [];
			return {
				verb: "Open",
				name: project.name,
				detail: project.place.kind === "team" ? project.edited : project.place.kind === "draft" ? "drafts" : project.place.label,
				glyph: "art",
				art: project.art,
				stageId: project.id,
				stage: { kind: "cover", art: project.art, here },
				title: project.name,
				meta: [project.place.branch ? `${project.place.path} · ${project.place.branch}` : project.place.path, `${project.frames === 0 ? "no frames yet" : `${project.frames} frames`} · ${project.edited}`],
			};
		}
		case "fetch": {
			const project = intent.project;
			return {
				verb: "Get",
				name: project.name,
				detail: "not on this Mac",
				glyph: "art",
				art: project.art,
				stageId: project.id,
				stage: job && job.id === project.id ? { kind: "link", from: "Tidemark", into: project.place.path, job, art: project.art, frames: project.frames } : { kind: "cover", art: project.art, away: true },
				title: project.name,
				meta: [project.place.path, `${project.frames} frames · ${project.edited}`],
				body: <>Sam made it on another Mac. ↵ puts its {project.frames} frames in {project.place.path} and opens it.</>,
			};
		}
		case "adopt":
			return adopt(intent.finding, team, projects);
		case "clone": {
			const finding = intent.finding;
			return {
				verb: "Clone",
				name: finding.name,
				detail: `into ${finding.into}`,
				glyph: "link",
				stageId: finding.into,
				stage: { kind: "link", from: finding.url, into: finding.into, job, art: finding.art, frames: finding.frames },
				title: finding.name,
				meta: [finding.url, `into ${finding.into}`],
				body: team ? (
					<>spool clones it with your git login and reads what arrives. It joins Tidemark, and its design/ leaves git.</>
				) : (
					<>spool clones it with your git login, then reads what arrives and opens it.</>
				),
			};
		}
		case "complete": {
			const name = intent.text.split("/").pop() ?? intent.text;
			const inner = intent.reading ? (intent.reading.kind === "dir" ? null : say(intent.reading.kind === "known" ? { do: "open", project: intent.reading.project } : { do: "adopt", finding: intent.reading.finding }, scope, job, projects)) : null;
			return {
				verb: "",
				name,
				detail: tagFor(intent.reading),
				glyph: "folder",
				stage: inner?.stage ?? { kind: "tree", lines: [{ depth: 0, name: `${name}/`, tone: "text" }, ...DIRS_OF(intent.text).map((child) => ({ depth: 1, name: `${child}/`, tone: "muted" as const }))] },
				title: intent.text,
				meta: [tagFor(intent.reading), "tab completes"],
				body: inner?.body,
			};
		}
		case "scope":
			return {
				verb: intent.scope === "own" ? "Your projects" : "Tidemark",
				detail: intent.scope === "own" ? "on this Mac" : "4 people",
				glyph: "team",
				stage: { kind: "team", scope: intent.scope },
				title: intent.scope === "own" ? "Your projects" : "Tidemark",
				meta: intent.scope === "own" ? ["drafts in ~/spool · folders where they are"] : ["team · 4 people · 4 projects", "~/spool/tidemark"],
				body: intent.scope === "own" ? <>New projects are yours alone, as drafts or in a folder you choose.</> : <>Projects you start here belong to Tidemark. Every member gets the files.</>,
			};
		case "choose":
			return {
				verb: "Choose a folder…",
				detail: "",
				glyph: "finder",
				stage: { kind: "finder" },
				title: "Choose a folder",
				meta: ["⌘O"],
				body: <>Opens the Finder. The folder you pick is read the same way as a pasted path.</>,
			};
		case "reading":
			return {
				verb: "Reading",
				name: intent.path.split("/").pop() ?? "",
				detail: "",
				glyph: "wait",
				stage: { kind: "quiet", text: `reading ${intent.path}…` },
				title: intent.path.split("/").pop() ?? "",
				meta: [intent.path],
			};
		case "none":
			return { verb: "", detail: "", glyph: "none", stage: { kind: "quiet", text: intent.text }, title: "Nothing here", meta: [intent.text], body: <>Check the path, or Tab through what is in the folder above it.</> };
	}
}

function adopt(finding: Finding, team: boolean, projects: Project[]): Said {
	switch (finding.kind) {
		case "project":
			return {
				verb: team ? "Add to Tidemark" : "Open",
				name: finding.name,
				detail: `${finding.frames} frames · ${finding.branch ?? "no git"}`,
				glyph: "art",
				art: finding.art,
				stageId: finding.path,
				stage: { kind: "cover", art: finding.art },
				title: finding.name,
				meta: [`${finding.path}/design · ${finding.branch}`, `${finding.frames} frames · new to spool`],
				body: team ? (
					<>harbor joins Tidemark. Its design/ leaves git, and Tidemark keeps its history from here.</>
				) : (
					<>It already has design/ with {finding.frames} frames. spool remembers the folder and opens it.</>
				),
			};
		case "repo":
			return {
				verb: "Add design/ to",
				name: finding.name,
				detail: `${finding.branch} · ${finding.stack}`,
				glyph: "plus",
				stageId: finding.path,
				stage: {
					kind: "tree",
					lines: [
						{ depth: 0, name: `${finding.name}/`, tone: "text", note: finding.branch },
						{ depth: 1, name: ".git/", tone: "muted" },
						{ depth: 1, name: "src/", tone: "muted", note: finding.stack },
						{ depth: 1, name: "design/", tone: "new", note: team ? "new · out of git" : "new" },
					],
				},
				title: finding.name,
				meta: [`${finding.path}/design`, team ? `${finding.branch} · tidemark` : `${finding.branch} · ${finding.stack}`],
				body: team ? (
					<>design/ goes beside the code and is left out of git. Tidemark relays each save to Jonas, Mira and Sam and keeps the history.</>
				) : (
					<>Frames are files in design/, beside the code on {finding.branch}. Commit them like the rest of the repo.</>
				),
			};
		case "plain":
			return {
				verb: "Add design/ to",
				name: finding.name,
				detail: "no git",
				glyph: "plus",
				stageId: finding.path,
				stage: {
					kind: "tree",
					lines: [
						{ depth: 0, name: `${finding.name}/`, tone: "text" },
						{ depth: 1, name: "references/", tone: "muted" },
						{ depth: 1, name: "design/", tone: "new", note: "new" },
					],
				},
				title: finding.name,
				meta: [`${finding.path}/design`, team ? "folder · tidemark" : "folder · no git"],
				body: team ? <>moodboard has no git. Tidemark keeps design/'s history and every member gets the files.</> : <>moodboard is a plain folder. Frames are saved as files in a new design/ inside it.</>,
			};
		case "inside": {
			const tvarso = projects.find((project) => project.id === "tvarso");
			const sub = finding.path.slice(finding.root.length + 1);
			return {
				verb: "Open",
				name: finding.name,
				detail: `design/ is at ${finding.root}`,
				glyph: "art",
				art: finding.art,
				stageId: tvarso?.id ?? "tvarso",
				stage: { kind: "tree", lines: insideTree(finding.root, sub, finding.frames) },
				title: finding.name,
				meta: [`${finding.root}/design`, `${finding.frames} frames · already in spool`],
				body: <>{finding.path.split("/").pop()} is inside {finding.root.split("/").pop()}, which has design/ at its root. spool opens that project.</>,
			};
		}
		default:
			return { verb: "", detail: "", glyph: "none", stage: { kind: "quiet", text: "" }, title: "", meta: [] };
	}
}

function insideTree(root: string, sub: string, frames: number): TreeLines {
	const parts = sub.split("/");
	const lines: TreeLines = [
		{ depth: 0, name: `${root.split("/").pop()}/`, tone: "text", note: "main" },
		{ depth: 1, name: "design/", tone: "text", note: `${frames} frames · opens` },
	];
	parts.forEach((part, index) => {
		const last = index === parts.length - 1;
		lines.push(last ? { depth: index + 1, name: `${part}/`, tone: "here", note: "pasted" } : { depth: index + 1, name: `${part}/`, tone: "muted" });
	});
	return lines;
}

export { PEOPLE };
