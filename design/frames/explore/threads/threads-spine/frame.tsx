import { ThreadsStage } from "shared/ui/explore/threads/threads-stage";

/**
 * threads-spine: the rail today, kept as the row everything below is a diff against.
 *
 * Three columns of chrome beside the log. The nameplate says which thread this is, by the
 * frames it wrote: `home, receipt`. The 34px column down the panel's edge holds one mark
 * per thread with the plus on top; hover a mark and the flyout says the name, the last
 * line drawn, the age, and offers a close. The 44px dock strip beside it switches the
 * panel between properties and the agent.
 *
 * Hover the column to see what the marks are standing in for. Five threads are five
 * cells, and three of the five are a hollow dot or nothing at all.
 */
export default function ThreadsSpineFrame() {
	return <ThreadsStage take="spine" />;
}
