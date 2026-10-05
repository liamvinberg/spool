import { parentPort } from "node:worker_threads";
import { DesignBoundaryError } from "./design-boundary";
import { type CssJob, type CssReply, compileFrameCssHere } from "./stylesheet-workers";

/**
 * A stylesheet worker: the Tailwind half of a frame compile, off the daemon's
 * event loop (see CSS_WORKERS in stylesheet-workers.ts). It keeps nothing between jobs;
 * every job is the same compileFrameCssHere the daemon would otherwise run
 * on its event loop.
 */
const port = parentPort;
if (port === null) throw new Error("tailwind-worker runs as a worker");

port.on("message", (job: CssJob) => {
	// the job's deadline runs from now, not from when it was handed over
	port.postMessage({ id: job.id, started: true } satisfies CssReply);
	compileFrameCssHere(job.designDir, job.sources).then(
		(css) => port.postMessage({ id: job.id, css } satisfies CssReply),
		(error: unknown) =>
			port.postMessage(
				(error instanceof DesignBoundaryError
					? { id: job.id, boundary: error.authored }
					: { id: job.id, message: error instanceof Error ? error.message : String(error) }) satisfies CssReply,
			),
	);
});
