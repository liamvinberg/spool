import { type ClassNameValue, extendTailwindMerge } from "tailwind-merge";

/**
 * The theme's own names, so a class handed to a primitive replaces the one it
 * draws with rather than racing it. cn.test.ts holds these to theme.css.
 */
export const THEME_NAMES = {
	spacing: [
		"unit",
		"control-xs",
		"control-sm",
		"control-md",
		"control-lg",
		"row",
		"row-roomy",
		"bar",
		"menu",
		"rail",
		"panel",
		"toast",
		"agent",
		"dialog",
		"sheet",
		"tab-max",
		"tab-min",
		"tab-compact",
	],
	duration: ["quick", "fast", "base", "slow", "slower"],
	ease: ["snap"],
} as const;

const merge = extendTailwindMerge<"focus-ring">({
	extend: {
		theme: { spacing: [...THEME_NAMES.spacing], ease: [...THEME_NAMES.ease] },
		classGroups: {
			duration: [{ duration: [...THEME_NAMES.duration] }],
			"focus-ring": ["focus-ring", "focus-ring-inset"],
		},
	},
});

export function cn(...values: readonly ClassNameValue[]): string {
	return merge(...values);
}
