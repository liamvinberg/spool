import { expect, it } from "vitest";
import { combineUseOutcomes } from "./source-edit";

it.each(["inactive", "constrained"] as const)("keeps a %s use visible beside a verified sibling", (rendered) => {
	const healthy = { occurrence: "healthy", installation: "installed", rendered: "verified" } as const;
	const affected = { occurrence: "affected", installation: "installed", rendered } as const;
	const combined = combineUseOutcomes([healthy, affected]);
	expect(combined.rendered).toBe(rendered);
	expect(combined.uses).toEqual([healthy, affected]);
	expect(combineUseOutcomes([affected, { ...healthy, rendered: "failed" }]).rendered).toBe("failed");
});
