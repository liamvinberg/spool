import type { Context } from "hono";

/** The registered project a route's `:project` names, or the refusal that answers it. */
export type ResolveProject = (c: Context, name: string) => { root: string } | { response: Response };

/** Runs a project route on the root its `:project` names, or answers the resolver's refusal. */
export function withProject<R>(c: Context, resolve: ResolveProject, act: (root: string) => R): R | Response {
	const project = resolve(c, c.req.param("project") ?? "");
	return "response" in project ? project.response : act(project.root);
}
