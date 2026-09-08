// Camera geometry mirrors src/ui/canvas/camera.ts. The site owns no daemon state.
export interface Camera {
	x: number;
	y: number;
	k: number;
}
export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}
export const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
export function fitCamera(box: Box, width: number, height: number): Camera {
	const k = clamp(Math.min((width - 128) / box.w, (height - 128) / box.h), 0.02, 1);
	return { k, x: (width - box.w * k) / 2 - box.x * k, y: (height - box.h * k) / 2 - box.y * k };
}
export function centerOn(camera: Camera, box: Box, width: number, height: number): Camera {
	return {
		k: camera.k,
		x: width / 2 - (box.x + box.w / 2) * camera.k,
		y: height / 2 - (box.y + box.h / 2) * camera.k,
	};
}
export function entryCamera(camera: Camera, box: Box, width: number, height: number): Camera {
	const fit = fitCamera(box, width, height);
	if (camera.k < fit.k) return fit;
	if (box.w * camera.k <= width && box.h * camera.k <= height) return centerOn(camera, box, width, height);
	const x = box.x * camera.k + camera.x,
		y = box.y * camera.k + camera.y;
	return x < width && x + box.w * camera.k > 0 && y < height && y + box.h * camera.k > 0
		? camera
		: centerOn(camera, box, width, height);
}
export function zoomAt(camera: Camera, x: number, y: number, factor: number): Camera {
	const k = clamp(camera.k * factor, 0.02, 32),
		ratio = k / camera.k;
	return { k, x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio };
}
