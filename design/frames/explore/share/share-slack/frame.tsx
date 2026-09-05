import { ui } from "spool";
import { LINK } from "shared/lib/explore/share/share-link";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { SlackLink, SlackMessage, SlackUnfurl, SlackWindow } from "shared/ui/demo/slack";
import { SpoolMark } from "shared/ui/spool/mark";

/**
 * Where the link actually lands. The whole point of minting one is that it
 * travels through somebody else's software, so the test of the unfurl is here
 * rather than in spool: does a card in a channel say what this is, and does it
 * look pressable to somebody who has never heard of spool.
 *
 * The card carries a still of the frame, the name of the project and the frame,
 * and the two facts a stranger needs before clicking: how much they will get,
 * and that it is a thing you click rather than a picture.
 */
export default function ShareSlackFrame() {
	return (
		<SlackWindow
			workspace="Kaffe"
			channel="design"
			topic="What we are building this week"
			members={9}
			rows={[
				{ name: "design", active: true },
				{ name: "general" },
				{ name: "kaffe-ops", unread: 3 },
				{ name: "releases" },
				{ name: "Sara Lind", kind: "dm", presence: "active" },
				{ name: "Otto Berg", kind: "dm", presence: "away" },
			]}
		>
			<SlackMessage author="Otto Berg" initials="OB" tint="#3D6E8F" time="13:41">
				<span>Did the tip step survive the checkout rewrite?</span>
			</SlackMessage>

			<SlackMessage
				author="Liam"
				initials="LV"
				tint="#7C4A9B"
				time="14:02"
				reactions={[
					{ emoji: "👀", count: 2 },
					{ emoji: "🔥", count: 1, mine: true },
				]}
			>
				<span>
					It did, and it is clickable now. Cart through to the receipt:{" "}
					<SlackLink
							onOpen={() => {
								ui.go("share-guest");
							}}
						>
							{LINK}
						</SlackLink>
				</span>
				<SlackUnfurl
					service="spool"
					serviceMark={<SpoolMark className="h-3 w-[9px] text-thread" />}
					title="cart · kaffe"
					onOpen={() => {
						ui.go("share-guest");
					}}
					description="A prototype you can click through. Menu, cart, receipt."
					meta="3 frames · live"
					preview={
						<div className="h-[225px] w-[104px] overflow-hidden">
							<div className="h-[520px] w-[240px] origin-top-left scale-[0.4333]">
								<CoffeeScreen screen="cart" />
							</div>
						</div>
					}
				/>
			</SlackMessage>

			<SlackMessage author="Sara Lind" initials="SL" tint="#2E7D6B" time="14:04">
				<span>Opened it on my phone. The tip step is the thing.</span>
			</SlackMessage>
		</SlackWindow>
	);
}
