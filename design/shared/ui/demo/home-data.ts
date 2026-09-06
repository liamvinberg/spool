/** Fictional local data for the home exploration. Nothing here reads or changes a project. */
export type Artwork = "coast" | "coffee" | "notes" | "studio" | "system" | "slack" | "blank";

export interface HomeProject {
	name: string;
	description: string;
	frames: number;
	when: string;
	art: Artwork;
	group: "Personal" | "Studio";
}

export const projects: readonly HomeProject[] = [
	{
		name: "tvärsö",
		description: "A small escape by the sea.",
		frames: 24,
		when: "just now",
		art: "coast",
		group: "Personal",
	},
	{
		name: "kaffe",
		description: "Coffee, from the first tap.",
		frames: 18,
		when: "2 hours ago",
		art: "coffee",
		group: "Personal",
	},
	{
		name: "fieldnotes",
		description: "A quieter place to write.",
		frames: 12,
		when: "yesterday",
		art: "notes",
		group: "Personal",
	},
	{
		name: "studio",
		description: "A home for the work.",
		frames: 32,
		when: "yesterday",
		art: "studio",
		group: "Studio",
	},
	{
		name: "dispatch",
		description: "The conversation around a release.",
		frames: 9,
		when: "3 days ago",
		art: "slack",
		group: "Studio",
	},
	{ name: "untitled", description: "Something new.", frames: 0, when: "last week", art: "blank", group: "Personal" },
];

export type RegistryKind = "Design systems" | "Sections" | "Components" | "App surfaces";
export interface RegistryItem {
	name: string;
	description: string;
	kind: RegistryKind;
	source: "spool-registry" | "my-registry";
	count: string;
	art: Artwork;
}

export const registry: readonly RegistryItem[] = [
	{
		name: "spool",
		description: "Type, color, and the small things between.",
		kind: "Design systems",
		source: "spool-registry",
		count: "28 components",
		art: "system",
	},
	{
		name: "studio-system",
		description: "The starting point for your studio’s apps.",
		kind: "Design systems",
		source: "my-registry",
		count: "36 components",
		art: "studio",
	},
	{
		name: "landing-sections",
		description: "Headers, stories, pricing, and a place to start.",
		kind: "Sections",
		source: "spool-registry",
		count: "16 sections",
		art: "coast",
	},
	{
		name: "primitives",
		description: "Buttons, fields, menus, and their states.",
		kind: "Components",
		source: "spool-registry",
		count: "24 components",
		art: "system",
	},
	{
		name: "Slack",
		description: "Channels, messages, and a bot in the flow.",
		kind: "App surfaces",
		source: "spool-registry",
		count: "8 frames",
		art: "slack",
	},
	{
		name: "editorial",
		description: "A page with room for the words.",
		kind: "Sections",
		source: "my-registry",
		count: "6 sections",
		art: "notes",
	},
];

export const categories = ["All", "Design systems", "Sections", "Components", "App surfaces"] as const;
export type Category = (typeof categories)[number];
export type HomeTake =
	| "quiet"
	| "covers"
	| "shelf"
	| "resume"
	| "index"
	| "spaces"
	| "workbench"
	| "library"
	| "search"
	| "start"
	| "desk"
	| "browser";
export type HomeState = "home" | "registry" | "create" | "empty" | "filtered" | "detail";
