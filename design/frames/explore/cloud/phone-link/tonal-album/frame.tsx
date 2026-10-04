import { ui } from "spool";
import { album, AlbumPage, EdgeBack, HomeTab, type Now, Page, Player, Shell, TabBar } from "shared/ui/explore/cloud/phone-link/tonal";

export default function Frame() {
	ui.use();
	const a = album(ui.state.album as string | undefined);
	const now = (ui.state.now ?? null) as Now | null;
	const change = (n: Now) => {
		ui.state.now = n;
	};
	return (
		<Shell>
			<EdgeBack
				onBack={() => ui.back()}
				under={
					<Page title="Home" keep="homeScroll" still>
						<HomeTab onOpen={() => {}} onPlay={() => {}} />
					</Page>
				}
			>
				<AlbumPage a={a} now={now} onChange={change} onBack={() => ui.back()} />
			</EdgeBack>
			<Player now={now} onChange={change} />
			<TabBar
				tab="Home"
				onTab={(t) => {
					ui.state.tab = t;
					ui.back();
				}}
			/>
		</Shell>
	);
}
