/** A path under a home folder, written from `~` the way a person reads it. */
export function tilde(path: string): string {
	return path.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/u, "~");
}
