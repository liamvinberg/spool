import { motion } from "motion/react";
import { useState } from "react";
import { childrenOf, HOME, parentOf, shortPath } from "shared/lib/spool/picker-disk";
import { BackIcon } from "shared/ui/spool/icons";

/**
 * The picker as it ships, on the same mock disk as every take beside it. Read
 * off `src/ui/picker.tsx`: a back button, the absolute path in mono, one level
 * of folders, and two buttons. Clicking a row is the only way down.
 *
 * It is here to be the diff. `~/personal/projects/gym-brute` is three clicks
 * and a read of twenty-two names from the state this frame boots in, and the
 * folder wanted is the one folder in the list spool could have named on sight.
 */

export function SpoolPickerToday() {
	const [path, setPath] = useState(HOME);
	const [offerInit, setOfferInit] = useState(false);
	const dirs = childrenOf(path);
	const here = childrenOf(parentOf(path) ?? HOME).find((dir) => dir.path === path);

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.14, ease: "easeOut" }}
			className="absolute inset-0 z-40 flex items-center justify-center bg-bg/70"
		>
			<div className="relative m-0 flex max-h-[70vh] w-[560px] flex-col rounded-lg border border-border bg-surface p-0 text-text">
				<header className="flex items-center gap-3 border-border border-b px-4 py-3">
					<button
						type="button"
						onClick={() => {
							const parent = parentOf(path);
							if (parent !== null) setPath(parent);
							setOfferInit(false);
						}}
						disabled={parentOf(path) === null}
						title="Up one folder"
						className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-raised disabled:opacity-40"
					>
						<BackIcon className="h-3 w-3" />
					</button>
					<span className="truncate font-mono text-muted text-xs leading-xs">{path}</span>
				</header>

				<div className="min-h-32 flex-1 overflow-y-auto p-2">
					{dirs.map((dir) => (
						<button
							key={dir.path}
							type="button"
							onClick={() => {
								setPath(dir.path);
								setOfferInit(false);
							}}
							className="flex h-8 w-full items-center gap-2 rounded-sm px-3 text-left hover:bg-raised"
						>
							<span className="flex-1 truncate text-base text-text leading-xs">{dir.name}</span>
							{dir.isProject ? <span className="shrink-0 font-mono text-2xs text-thread">spool</span> : null}
						</button>
					))}
					{dirs.length === 0 ? <p className="px-3 py-4 font-mono text-muted text-xs">no folders here</p> : null}
				</div>

				<footer className="flex items-center gap-3 border-border border-t px-4 py-3">
					{offerInit ? (
						<span className="flex-1 truncate font-mono text-muted text-xs">
							not a spool project — initialize design/ here?
						</span>
					) : (
						<span className="flex-1" />
					)}
					<button type="button" className="flex h-7 items-center rounded-md px-3 text-muted text-sm hover:text-text">
						Cancel
					</button>
					<button
						type="button"
						onClick={() => setOfferInit(here?.isProject !== true && path !== HOME)}
						className="flex h-7 items-center rounded-md border border-border-raised bg-raised px-3 font-medium text-sm text-text"
					>
						{offerInit ? "Initialize here" : "Open this folder"}
					</button>
				</footer>
			</div>
			<span className="sr-only">{shortPath(path)}</span>
		</motion.div>
	);
}
