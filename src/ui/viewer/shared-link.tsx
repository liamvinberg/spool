import { useEffect, useMemo, useState } from "react";
import { pageName, pageUnder, ROOT_PAGE } from "../../page-path";
import { saidAgo } from "../../share-view";
import { mergeOrder } from "../canvas/order";
import { RibbonMark } from "../icons";
import { standalone } from "./phone";
import { PhonePlay } from "./phone-play";
import { address, locate, type ViewerConfig, type ViewerProject, type ViewerShared } from "./source";

/** Where a phone remembers it has been told how to keep this link, once per link: each link share is its own host. */
const TOLD_KEY = "spool-link:told";

/**
 * A shared link on a phone (DEV-115): no canvas, only the prototype, running full screen from its first screen.
 * Walks go where its frames lead, and the URL follows, so the app reopens where it was left. Opened in the
 * phone's browser rather than from the Home Screen, a link share says once, under the running prototype, who
 * shared it and how to keep it as an app.
 */
export function SharedLink({ config, project }: { config: ViewerConfig; project: ViewerProject }) {
	const { canvas } = project;
	const shared = project.shared as ViewerShared;
	const first = useMemo(() => {
		for (const page of [...shared.pages, ROOT_PAGE]) {
			const here = canvas.frames.filter((frame) => (frame.page ?? ROOT_PAGE) === page).map((frame) => frame.name);
			const ordered = mergeOrder(canvas.order.frames?.[page], here.map(pageName)).map((leaf) =>
				pageUnder(page, leaf),
			);
			if (ordered[0] !== undefined) return ordered[0];
		}
		return null;
	}, [canvas, shared]);
	const [start, setStart] = useState(() => locate(config, new URL(window.location.href)).frame ?? first);
	const [told, setTold] = useState(() => !config.app || standalone() || window.localStorage.getItem(TOLD_KEY) === "1");

	// once is once shown: the card never comes back, whether or not it was answered
	useEffect(() => {
		if (!told) window.localStorage.setItem(TOLD_KEY, "1");
	}, [told]);

	if (start === null)
		return (
			<div className="flex h-dvh items-center justify-center bg-bg text-muted type-detail">
				Nothing here is ready yet
			</div>
		);
	return (
		<>
			<PhonePlay
				frames={canvas.frames}
				documentOf={(frame) => `${project.frames}${encodeURIComponent(frame)}`}
				walksAnywhere
				start={start}
				coverOf={(frame) => project.covers?.[frame]}
				spotOf={() => null}
				onWalked={(frame) => {
					const page = canvas.frames.find((each) => each.name === frame)?.page ?? ROOT_PAGE;
					window.history.replaceState({ spool: "link" }, "", address(config, page, frame));
					setStart(frame);
				}}
			/>
			{!told && <FirstOpen project={project.project} shared={shared} onOpen={() => setTold(true)} />}
		</>
	);
}

/**
 * The first open in a phone's browser: who shared it and when it last changed, how to add it to the Home Screen
 * (iOS has no way to offer it), and Open it here. It sits under the prototype, which runs and takes touches above
 * it, so it never stands in the way.
 */
function FirstOpen({ project, shared, onOpen }: { project: string; shared: ViewerShared; onOpen: () => void }) {
	return (
		<div
			role="dialog"
			aria-label={`${project}, shared with you`}
			data-first-open=""
			className="fixed inset-x-2.5 z-40 animate-[viewer-page-in_160ms_ease-out] rounded-lg border border-border-raised bg-raised p-5 text-text shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
			style={{ bottom: "calc(10px + env(safe-area-inset-bottom))" }}
		>
			<div className="flex items-center gap-3">
				<span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-border-raised bg-bg">
					<RibbonMark className="h-[22px] w-[17px]" />
				</span>
				<div className="min-w-0">
					<div className="truncate type-heading">{project}</div>
					<div className="text-muted type-detail">
						{shared.by} shared this
						{shared.updated !== null && ` · updated ${saidAgo(shared.updated)}`}
					</div>
				</div>
			</div>
			<p className="mt-4 mb-5 text-muted type-control">
				To open it like an app, tap <b className="text-text tracking-widest">···</b> in Safari’s bar, then{" "}
				<b className="text-text">Share</b>, then <b className="text-text">Add to Home Screen</b>.
			</p>
			<button
				type="button"
				className="h-11 w-full cursor-pointer rounded-md bg-text text-bg active:scale-[0.98] type-control"
				onClick={onOpen}
			>
				Open it here
			</button>
		</div>
	);
}
