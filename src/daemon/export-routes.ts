import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { isFramePath } from "../page-path";
import { DesignBoundaryError } from "./design-path";
import type { ExportAnswer, HtmlExport } from "./html-export";
import { type ResolveProject, withProject } from "./project-route";

const planQuery = z.object({ frame: z.string().refine(isFramePath, { message: "not a frame name" }) });
const htmlQuery = planQuery.extend({ scope: z.enum(["flow", "one"]).default("flow") });

/**
 * A frame exported as one HTML file (spool#239), mounted under `/api/p`: what
 * the export choice offers, and the file itself, as a download.
 */
export function exportRoutes(deps: { resolve: ResolveProject; htmlExport: HtmlExport }) {
	return new Hono()
		.get(
			"/:project/export/plan",
			validator("query", (value, c) => {
				const parsed = planQuery.safeParse(value);
				return parsed.success ? parsed.data : c.text("an export plan is ?frame=<name>", 400);
			}),
			(c) =>
				withProject(c, deps.resolve, async (root) => {
					const answer = await refusing(() => deps.htmlExport.plan(root, c.req.valid("query").frame));
					return answer.kind === "ok" ? c.json(answer.value) : refused(c, answer);
				}),
		)
		.get(
			"/:project/export/html",
			validator("query", (value, c) => {
				const parsed = htmlQuery.safeParse(value);
				return parsed.success ? parsed.data : c.text("an export is ?frame=<name>&scope=flow|one", 400);
			}),
			(c) => {
				const project = c.req.param("project");
				return withProject(c, deps.resolve, async (root) => {
					const { frame, scope } = c.req.valid("query");
					const answer = await refusing(() => deps.htmlExport.html(root, project, frame, scope));
					if (answer.kind !== "ok") return refused(c, answer);
					const { html, filename } = answer.value;
					c.header("content-disposition", `attachment; filename="${filename.replace(/["\\]/g, "_")}"`);
					c.header("cache-control", "no-store");
					return c.html(html);
				});
			},
		);
}

/** A design/ that reaches outside itself is a frame that can't be built, said as the compile would. */
async function refusing<T>(work: () => Promise<ExportAnswer<T>>): Promise<ExportAnswer<T>> {
	try {
		return await work();
	} catch (error) {
		if (error instanceof DesignBoundaryError) return { kind: "broken", message: error.message };
		throw error;
	}
}

function refused(
	c: { text: (text: string, status: 404 | 422) => Response },
	answer: Exclude<ExportAnswer<unknown>, { kind: "ok" }>,
): Response {
	return c.text(answer.message, answer.kind === "missing" ? 404 : 422);
}
