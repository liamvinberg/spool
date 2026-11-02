/**
 * Every image in the document loaded and decoded, or the budget spent (#216):
 * an imported image arrives by URL after the frame has booted, and a cover
 * taken before it lands pictures the frame without it. An image left lazy and
 * not yet loaded is offscreen, so it is not waited on: it would only spend the
 * budget. A broken image counts as arrived.
 */
export async function imagesReady(budgetMs: number): Promise<void> {
	const images = Array.from(document.images).filter((image) => image.loading !== "lazy" || image.complete);
	if (images.length === 0 || !(budgetMs > 0)) return;
	let timer: ReturnType<typeof setTimeout> | undefined;
	await Promise.race([
		Promise.all(images.map((image) => image.decode().catch(() => {}))),
		new Promise<void>((resolve) => {
			timer = setTimeout(resolve, budgetMs);
		}),
	]);
	clearTimeout(timer);
}
