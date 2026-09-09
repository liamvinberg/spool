import { useState } from "react";
import { ui } from "spool";
import { GuideStage, Prototype } from "shared/ui/explore/agent-start/stage";

export default function Frame() {
	const [note, setNote] = useState("antigravity · copy uses spool’s clipboard; project path is sample data");
	return (
		<Prototype note={note}>
			<GuideStage
				app="antigravity"
				onSelect={{
					claude: () => ui.go("agent-start-guide--claude"),
					codex: () => ui.go("agent-start-guide--codex"),
					opencode: () => ui.go("agent-start-guide--opencode"),
					antigravity: () => ui.go("agent-start-guide--antigravity"),
				}}
				onClose={() => ui.go("agent-start-dialog--ready")}
				onCopy={(text) => ui.copy(text)}
				onLaunch={() => setNote("prototype · would open kaffe in the desktop app; no app was launched")}
			/>
		</Prototype>
	);
}
