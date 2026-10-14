import type { Context } from "hono";
import { CanvasFileError } from "./canvas-file";
import { DesignBoundaryError } from "./design-path";

/** The registered project a route's `:project` names, or the refusal that answers it. */
export type ResolveProject = (c: Context, name: string) => { root: string } | { response: Response };

/** Runs a project route on the root its `:project` names, or answers the resolver's refusal. */
export function withProject<R>(c: Context, resolve: ResolveProject, act: (root: string) => R): R | Response {
	const project = resolve(c, c.req.param("project") ?? "");
	return "response" in project ? project.response : act(project.root);
}

/**
 * A design/ read or write, with the two refusals it can throw already answered
 * (#228): a path that resolves out of design/, and a canvas.json spool will not
 * overwrite because it cannot read what overwriting it would lose.
 */
export function answeringDiskRefusals<T>(c: Context, work: () => T): { value: T } | { response: Response } {
	try {
		return { value: work() };
	} catch (error) {
		if (error instanceof DesignBoundaryError) return { response: c.text(error.message, 400) };
		if (error instanceof CanvasFileError) return { response: c.text(error.message, 500) };
		throw error;
	}
}
