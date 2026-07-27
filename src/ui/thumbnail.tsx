import type { Cover } from "../cover";
import { coverSrcSet, coverUrl } from "./api";

/**
 * A frame's cover, as a plain image element (#111). No fetch, no blob URL, no
 * effect: the ladder's addresses are known the moment the projection is, so the
 * browser owns the whole job — it starts loading at commit instead of after an
 * effect, caches by URL across every element that names one, upgrades a rung in
 * place, and evicts decodes on its own terms.
 *
 * `sizes` is the one thing the browser cannot work out for itself. The camera is
 * a CSS transform and `srcset` resolves against layout size, so the caller
 * computes it from the zoom (`coverSizes`) and quantizes it to the rung
 * boundaries; left alone, every cover would take its top rung at every zoom.
 */
export function Thumbnail({
	project,
	frame,
	cover,
	alt,
	sizes,
	...image
}: Omit<React.ComponentPropsWithoutRef<"img">, "src" | "srcSet" | "alt"> & {
	project: string;
	frame: string;
	cover: Cover;
	alt: string;
	/** The rung the camera asks for, as a CSS length — the narrowest one still sharp. */
	sizes?: string | undefined;
}) {
	const widest = cover.widths[0];
	if (widest === undefined) return null;
	return (
		<img
			{...image}
			src={coverUrl(project, frame, cover.hash, widest)}
			srcSet={coverSrcSet(project, frame, cover)}
			{...(sizes === undefined ? {} : { sizes })}
			alt={alt}
		/>
	);
}
