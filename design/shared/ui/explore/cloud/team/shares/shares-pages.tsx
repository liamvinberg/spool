import { person } from "shared/lib/explore/cloud/team/fixture";
import {
	Caption,
	Faces,
	KindGlyph,
	LINK_URL,
	Outsider,
	PagesRail,
	ProjectCanvas,
	RAIL_W,
	SmallButton,
	shareOf,
	TextButton,
	type Who,
} from "./parts";

/**
 * Take two: sharing is seen where the pages are. Every shared page wears a
 * mark on its row in the pages rail, a person for named people and a link for
 * anyone with the link, so the rail answers "what can outsiders open" at a
 * glance. Selecting a page puts who it is shared with at the rail's foot,
 * under the list, with its verbs.
 *
 * It bets that a share is about a page, so it belongs to the page's row and
 * nowhere else. Its cost shows in `--manage`: one link can carry two pages, so
 * stopping it from one row stops the other too, and the rail has to say so.
 */

export type PagesState = "base" | "manage" | "viewer";

export function SharesPages({ state = "base", onManage, onBack }: { state?: PagesState; onManage?: () => void; onBack?: () => void }) {
	const who: Who = state === "viewer" ? "lena" : "mira";
	const page = state === "manage" ? "receipt" : "checkout";
	return (
		<div className="relative h-full">
			<ProjectCanvas
				who={who}
				page={page}
				rail={<PagesRail who={who} page={page} marks foot={<Foot who={who} page={page} stopping={state === "manage"} onManage={onManage} onBack={onBack} />} />}
				corner={<Faces ids={who === "lena" ? ["jonas", "mira", "ada"] : ["jonas", "ada"]} />}
			/>
			<Caption left={RAIL_W + 24}>
				{state === "manage"
					? "Pages rail, stopping the link from receipt. The link carries onboarding too, so the rail says both stop."
					: state === "viewer"
						? "Pages rail, as a viewer in the browser. The marks and the foot are the same, without the verbs."
						: "Pages rail. A shared page wears a mark on its row, and selecting it says who it is shared with."}
			</Caption>
		</div>
	);
}

/** What the selected page is shared with, docked under the list. */
function Foot({
	who,
	page,
	stopping,
	onManage,
	onBack,
}: {
	who: Who;
	page: string;
	stopping: boolean;
	onManage?: (() => void) | undefined;
	onBack?: (() => void) | undefined;
}) {
	const share = shareOf(page);
	if (share === undefined) return null;
	const editor = who === "mira";
	const others = share.pages.filter((name) => name !== page);
	const maker = share.by === who ? "You" : person(share.by).name.split(" ")[0];
	return (
		<section aria-label={`Who ${page} is shared with`} className="flex shrink-0 flex-col gap-3 border-border border-t px-3.5 pt-3.5 pb-4">
			<div className="flex items-center gap-2">
				<KindGlyph kind={share.kind} className="h-3 w-3 text-text" />
				<span className="flex-1 text-text type-label">{share.kind === "people" ? `Shared with ${share.people?.length} people` : "Anyone with the link"}</span>
				<span className="text-muted type-detail">{share.opens} opens</span>
			</div>

			{share.kind === "people" ? (
				<ul className="flex flex-col gap-1.5">
					{(share.people ?? []).map((email) => (
						<li key={email} className="flex items-center gap-2 text-text type-detail">
							<Outsider email={email} size={18} />
							<span className="truncate">{email}</span>
						</li>
					))}
				</ul>
			) : (
				<div className="flex flex-col gap-1.5">
					{editor ? <span className="truncate text-text type-detail">{LINK_URL}</span> : null}
					{others.length > 0 ? (
						<p className="text-muted type-caption">
							The same link opens {others.join(" and ")}.
						</p>
					) : null}
				</div>
			)}

			<p className="text-muted type-caption">
				{maker} shared it {share.when}.{editor ? null : " Editors and admins can change it."}
			</p>

			{!editor ? null : stopping ? (
				<div className="flex flex-col gap-2.5 rounded-sm border border-border-raised bg-surface p-3">
					<p className="text-text type-label">Stop this link?</p>
					<p className="text-muted type-caption">
						It stops working at once for everyone who has it, on receipt and onboarding both. The pages stay here as they are.
					</p>
					<div className="flex justify-end gap-1.5">
						<SmallButton onClick={onBack}>Keep</SmallButton>
						<SmallButton primary onClick={onBack}>
							Stop link
						</SmallButton>
					</div>
				</div>
			) : (
				<div className="flex items-center gap-4">
					<TextButton>{share.kind === "people" ? "Add someone" : "Copy link"}</TextButton>
					<span className="flex-1" />
					<TextButton danger onClick={onManage}>
						Stop sharing
					</TextButton>
				</div>
			)}
		</section>
	);
}
