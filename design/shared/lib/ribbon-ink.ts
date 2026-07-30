import { useEffect, useState } from "react";
import { MARK_MASK } from "./ribbon-strands";

/**
 * How much ink the ribbon actually is, at the size it is drawn.
 *
 * The accent question needs a number and had been getting an opinion. The rail's standing
 * rule is that state is motion and the one accent belongs to the selection, and the mark's
 * identity is the red — so the argument turns on how much red an always-present mark puts
 * on screen against how much the selection already has. Both are measurable and neither had
 * been measured.
 *
 * So the mask is rasterised into an offscreen canvas at the mark's own drawn size and every
 * pixel with any alpha in it is counted. The comparison is the composer's own chip, whose
 * `bg-thread/55` bar is 2px by 12px — 24 square pixels of accent, nine pixels below the slot
 * and already doing the selection's job. A data URI does not taint a canvas, so the read is
 * exact rather than sampled.
 *
 * The number comes back as `null` until the image has decoded, which is one frame, and the
 * panel prints an ellipsis rather than a zero for it.
 */

/** the composer chip's accent bar, at #196's shape: 2px by 12px */
export const CHIP_INK = 24;

export interface Ink {
	/** pixels with any alpha, at the drawn size */
	readonly px: number;
	/** what share of the mark's own box that is */
	readonly share: number;
}

export function useInk(width: number, height: number): Ink | null {
	const [ink, setInk] = useState<Ink | null>(null);

	useEffect(() => {
		let alive = true;
		const source = MARK_MASK.slice(5, -2);
		const image = new Image();
		image.onload = () => {
			if (!alive) return;
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const paint = canvas.getContext("2d");
			if (paint === null) return;
			paint.drawImage(image, 0, 0, width, height);
			const data = paint.getImageData(0, 0, width, height).data;
			let lit = 0;
			for (let at = 3; at < data.length; at += 4) if ((data[at] ?? 0) > 0) lit += 1;
			setInk({ px: lit, share: lit / (width * height) });
		};
		image.src = source;
		return () => {
			alive = false;
		};
	}, [width, height]);

	return ink;
}
