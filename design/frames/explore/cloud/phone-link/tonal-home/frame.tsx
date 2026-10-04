import { AnimatePresence, motion } from "motion/react";
import { ui } from "spool";
import { type Album, HomeTab, LibraryTab, type Now, Page, Player, play, SearchTab, Shell, type Tab, TabBar } from "shared/ui/explore/cloud/phone-link/tonal";

export default function Frame() {
	ui.use();
	const tab = (ui.state.tab ?? "Home") as Tab;
	const now = (ui.state.now ?? null) as Now | null;
	const open = (a: Album) => {
		ui.state.album = a.id;
		ui.go("explore/cloud/phone-link/tonal-album");
	};
	return (
		<Shell>
			<AnimatePresence initial={false} mode="popLayout">
				<motion.div key={tab} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
					{tab === "Home" ? (
						<Page title="Home" keep="homeScroll">
							<HomeTab onOpen={open} current={ui.state.album as string | undefined} onPlay={(a: Album) => (ui.state.now = play(a, 0))} />
						</Page>
					) : tab === "Search" ? (
						<Page title="Search">
							<SearchTab onOpen={open} />
						</Page>
					) : (
						<Page title="Library">
							<LibraryTab onOpen={open} />
						</Page>
					)}
				</motion.div>
			</AnimatePresence>
			<Player now={now} onChange={(n) => (ui.state.now = n)} />
			<TabBar tab={tab} onTab={(t) => (ui.state.tab = t)} />
		</Shell>
	);
}
