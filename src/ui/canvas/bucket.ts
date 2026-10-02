/**
 * Which of `buckets` a name falls in: the same every time for the same name,
 * and spread evenly over many names. The turn a frame label takes to lay out
 * its width while the camera moves (`frame-label.tsx`), and the loader a still
 * always goes to (`picture-loads.ts`).
 */
export function bucketOf(name: string, buckets: number): number {
	let hash = 0;
	for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
	return Math.abs(hash) % Math.max(1, buckets);
}
