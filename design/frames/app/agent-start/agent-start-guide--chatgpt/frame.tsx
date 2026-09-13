import { useState } from "react";
import { ui } from "spool";
import { GuideStage, Prototype } from "shared/ui/spool/agent-start/stage";

export default function Frame() {
	const [note, setNote] = useState(
		"chatgpt · proposed desktop integration via the documented codex app command; app launch is simulated",
	);
	return (
		<Prototype note={note}>
			<GuideStage
				app="chatgpt"
				onSelect={{
					claude: () => ui.go("agent-start-guide--claude"),
					chatgpt: () => ui.go("agent-start-guide--chatgpt"),
					antigravity: () => ui.go("agent-start-guide--antigravity"),
				}}
				onClose={() => ui.go("agent-start-dialog--ready")}
				onCopy={(text) => ui.copy(text)}
				onLaunch={() => setNote("prototype · would open kaffe in the desktop app; no app was launched")}
			/>
		</Prototype>
	);
}
