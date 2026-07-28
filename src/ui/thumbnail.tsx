import type { Cover } from "../cover";
import { coverUrl } from "./api";

/**
 * A frame's cover, as a plain image element (#111). No fetch, no blob URL, no
 * effect: its immutable address is known the moment the projection is, so the
 * browser owns the whole job — it starts loading at commit instead of after an
 * effect and caches by URL across every element that names it.
 */
export function Thumbnail({
	project,
	frame,
	cover,
	alt,
	...image
}: Omit<React.ComponentPropsWithoutRef<"img">, "src" | "srcSet" | "sizes" | "alt"> & {
	project: string;
	frame: string;
	cover: Cover;
	alt: string;
}) {
	return <img {...image} src={coverUrl(project, frame, cover.hash)} alt={alt} />;
}
