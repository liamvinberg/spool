import { ui } from "spool";
import { NoticeStage, Prototype } from "shared/ui/explore/agent-start/stage";

export default function Frame() {
	return (
		<Prototype note="inline · the notice fills the chat panel on first open">
			<NoticeStage
				take="inline"
				onGuide={() => ui.go("agent-start-guide--claude")}
				onContinue={() => ui.go("agent-start-dialog--ready")}
				onClaude={() => ui.go("agent-start-dialog--claude")}
				onCopy={(text) => ui.copy(text)}
			/>
		</Prototype>
	);
}
