/**
 * The official registry as the browsing prototype (spool-cloud#185) draws it: the
 * page tree #181 agreed and the source layout #182 agreed, with a few entries
 * standing in for real content. Nothing here reads a downloaded revision.
 *
 * `purpose` and `line` are what an entry says about itself. Whether an entry has
 * to say this, and where the words live in its source, is spool-cloud#186's.
 */

export type Purpose = "starting point" | "study";
export type Specimen = "slack-channel" | "slack-settings" | "spool-buttons" | "vercel-buttons" | "spool-hero" | "grain";

export interface RegistryFrame {
	name: string;
	specimen: Specimen;
	w: number;
	h: number;
}

export interface Collection {
	/** full page path under frames/, the name everything addresses it by */
	path: string;
	category: string;
	name: string;
	purpose: Purpose;
	line: string;
	frames: readonly RegistryFrame[];
	/** what the first frame imports, as an agent following its imports would find it */
	uses: readonly string[];
}

export const REVISION = "r42";
export const REGISTRY_ROOT = "~/.spool/registries/official/r42";

export const CATEGORIES = ["design-systems", "apps", "components"] as const;

export const COLLECTIONS: readonly Collection[] = [
	{
		path: "design-systems/spool",
		category: "design-systems",
		name: "spool",
		purpose: "starting point",
		line: "spool's own tokens, type and controls. Take the theme to look like spool, or only the parts you need.",
		frames: [
			{ name: "buttons", specimen: "spool-buttons", w: 720, h: 460 },
		],
		uses: ["shared/ui/design-systems/spool/theme.css", "shared/ui/design-systems/spool/button.tsx"],
	},
	{
		path: "design-systems/vercel",
		category: "design-systems",
		name: "vercel",
		purpose: "study",
		line: "Vercel's buttons and inputs, redrawn to learn how the system holds together. Not Vercel's code.",
		frames: [
			{ name: "buttons", specimen: "vercel-buttons", w: 720, h: 460 },
		],
		uses: ["shared/ui/design-systems/vercel/theme.css", "shared/ui/design-systems/vercel/button.tsx"],
	},
	{
		path: "apps/slack",
		category: "apps",
		name: "slack",
		purpose: "starting point",
		line: "A Slack channel and its settings with sample messages. Build a bot or an integration on top of it.",
		frames: [
			{ name: "channel", specimen: "slack-channel", w: 1280, h: 800 },
			{ name: "settings", specimen: "slack-settings", w: 1280, h: 800 },
		],
		uses: [
			"shared/ui/apps/slack/theme.css",
			"shared/ui/apps/slack/message-row.tsx",
			"shared/ui/apps/slack/sample-data.ts",
			"shared/assets/apps/slack/avatar.png",
		],
	},
	{
		path: "components/shaders",
		category: "components",
		name: "shaders",
		purpose: "study",
		line: "The ribbon behind spool.page, tuned by hand for one hero. Read it for the technique; it takes no props.",
		frames: [
			{ name: "spool-hero", specimen: "spool-hero", w: 1440, h: 810 },
			{ name: "grain", specimen: "grain", w: 1440, h: 810 },
		],
		uses: ["shared/ui/components/shaders/ribbon.glsl", "importmap: three"],
	},
];

export function collection(path: string): Collection {
	const found = COLLECTIONS.find((item) => item.path === path);
	if (found === undefined) throw new Error(`no collection ${path}`);
	return found;
}

/** what "copy for your agent" puts on the clipboard: a location and one instruction, nothing automatic */
export function agentNote(frame: string, purpose: Purpose): string {
	return [
		purpose === "starting point"
			? `Use the spool registry entry ${frame} as a starting point.`
			: `Study the spool registry entry ${frame}. It is a study, so take the technique rather than the whole thing.`,
		`Source: ${REGISTRY_ROOT}/design/frames/${frame}`,
		"Copy what you need into this project, following its imports, then adapt it. Registry files are read-only.",
	].join("\n");
}
