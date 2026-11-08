/** The words a file name or a layer name becomes in a path: lowercase, hyphens, never empty. */
export function slugOf(name: string, fallback = "frame"): string {
	const slug = name
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/gu, "")
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, 60)
		.replace(/-+$/u, "");
	return slug === "" ? fallback : slug;
}

export function unique(slug: string, taken: Set<string>): string {
	let candidate = slug;
	for (let n = 2; taken.has(candidate); n++) candidate = `${slug}-${n}`;
	taken.add(candidate);
	return candidate;
}
