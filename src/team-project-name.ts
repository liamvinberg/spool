/**
 * The name a team project is reached by, made from what was typed as spool.page makes it (its `projectName`): accents
 * dropped, lower case, every run of anything else one hyphen, trimmed to 40. "My Site" is `my-site`. Undefined when
 * nothing is left that spool.page would take; a reserved name is spool.page's to refuse.
 */
export function teamProjectName(typed: string): string | undefined {
	const name = typed
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, 40)
		.replace(/-+$/u, "");
	return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/u.test(name) ? name : undefined;
}
