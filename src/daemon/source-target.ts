import { relative } from "node:path";
import type { SourceOccurrence } from "../source-edit";
import { realDesignDir } from "./design-path";
import type { RetainedCompilation } from "./retained-compile";
import { type RetryLiteral, type Selection, Sources, sourceRead } from "./source-origins";

/** Resolve the selected committed field against the original compiler snapshot. */
export function resolveTextSource(
	root: string,
	compilation: RetainedCompilation,
	original: SourceOccurrence,
	generation: number,
	inverseCell?: string,
	retry?: RetryLiteral,
) {
	if (
		original.field &&
		(!/^[A-Za-z][A-Za-z0-9:-]*$/.test(original.field) ||
			/^(?:on[A-Z]|data-spool-)/.test(original.field) ||
			["key", "ref", "children", "className", "style", "data-go"].includes(original.field))
	)
		throw new Error("this field requires its dedicated source operation");
	let cellKey = original.cell;
	let target: ReturnType<typeof sourceRead> | undefined;
	if (original.provenance) {
		const sources = new Sources(root, compilation);
		for (const input of compilation.inputs.keys())
			if (/\.[cm]?[jt]sx?$/.test(input)) sources.read(relative(realDesignDir(root), input));
		const selection = JSON.parse(original.provenance) as Selection;
		if (original.field === "src") {
			const leaf = sources.creation(selection.source).node;
			const tag = leaf.type === "JSXElement" ? leaf.openingElement.name : leaf.arguments[0];
			if (
				(tag?.type === "JSXIdentifier" && tag.name === "img") ||
				(tag?.type === "StringLiteral" && tag.value === "img")
			)
				throw new Error("this image requires its dedicated source operation");
		}
		const previous = inverseCell ? compilation.cells[inverseCell] : undefined;
		target = sourceRead(
			sources,
			{ ...selection, generation: String(generation) },
			original.field ? { kind: "attribute", attribute: original.field } : { kind: "text" },
			previous ? { kind: "inverse", source: previous.source, field: previous.field ?? "children" } : retry,
		);
		for (const unit of sources.revisions.values())
			if (!compilation.inputs.has(unit.file))
				throw new Error("the committed origin is outside captured compiler inputs");
		const field = target.syntax === "react-call" ? (target.attribute ?? "children") : target.attribute;
		const found = Object.entries(compilation.cells).find(
			([, cell]) => cell.source === target?.source && cell.field === field,
		);
		if (!found) throw new Error("the committed literal has no retained source cell");
		cellKey = found[0];
	}
	const cell = compilation.cells[cellKey];
	if (
		!cell ||
		(cell.value !== original.value &&
			inverseCell !== cellKey &&
			!(
				retry &&
				retry.source === cell.source &&
				retry.field === (cell.field ?? "children") &&
				retry.after === cell.value &&
				retry.before === original.value
			))
	)
		throw new Error("the selected words have no proven literal source");
	return { cellKey, cell, target };
}

/** A recorded field edge can disclose uncertainty without admitting its transport. */
export function potentialTextSource(
	compilation: RetainedCompilation,
	original: SourceOccurrence,
	cellKey: string,
): boolean {
	const cell = compilation.cells[cellKey];
	if (!cell) return false;
	if (original.cell === cellKey) return true;
	if (!original.provenance) return false;
	try {
		const selection = JSON.parse(original.provenance) as Selection;
		return [selection.values, ...selection.chain.flatMap((call) => [call.values, call.renderedValues])].some(
			(value) =>
				value &&
				Object.values(value.fields).some(
					(field) => field.origin.source === cell.source && field.origin.field === (cell.field ?? "children"),
				),
		);
	} catch {
		return false;
	}
}
