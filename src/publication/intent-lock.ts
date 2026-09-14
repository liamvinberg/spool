import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { withFileLock } from "../file-lock";
import { canonicalJson } from "./manifest";
/** Lock publication work across independent processes; never expire a living owner's authority. */
export function withPublicationIntent<T>(
	spoolDir: string,
	authority: string,
	publisherId: string,
	target: { publicationId: string } | { root: string; entry: string },
	work: () => Promise<T>,
): Promise<T> {
	const instance = realpathSync(resolve(spoolDir));
	const key = createHash("sha256")
		.update(canonicalJson({ authority: new URL(authority).origin, publisherId, instance, target }))
		.digest("hex");
	return withFileLock(join(instance, "publications", "locks", `${key}.lock`), work);
}
