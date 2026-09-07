import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Plugin } from "esbuild";

// Disposable build-time taps, never a node_modules edit. coerceRef sees the
// exact element assigned to a Fiber before memo may discard its incoming props.
// Copy/reset taps retire speculative bindings when React reuses its two trees.
export function reconciledRenderer(): Plugin {
	return {
		name: "pinned-react-element-witness",
		setup(build) {
			build.onLoad({ filter: /react-dom-client\.production\.js$/ }, ({ path }) => {
				let contents = readFileSync(path, "utf8");
				if (createHash("sha256").update(contents).digest("hex") !== RENDERER_SHA256)
					throw new Error("reconciliation taps require the exact pinned renderer bytes");
				const replace = (before: string, after: string) => {
					if (contents.split(before).length !== 2) throw new Error("renderer tap anchor is not unique");
					contents = contents.replace(before, after);
				};
				replace(
					"function coerceRef(workInProgress, element) {",
					"function coerceRef(workInProgress, element) {\n  globalThis.__handReconcile.bind(workInProgress, element);",
				);
				replace(
					"  return workInProgress;\n}\nfunction resetWorkInProgress",
					"  globalThis.__handReconcile.copy(current, workInProgress);\n  return workInProgress;\n}\nfunction resetWorkInProgress",
				);
				replace(
					"  return workInProgress;\n}\nfunction createFiberFromTypeAndProps",
					"  globalThis.__handReconcile.copy(current, workInProgress);\n  return workInProgress;\n}\nfunction createFiberFromTypeAndProps",
				);
				return { contents, loader: "js" };
			});
		},
	};
}

export const RENDERER_SHA256 = "9d2de2ee4a588c5d0b8580ff3467f796b8d9bbc45bdc35b257f7d1380e686c56";
