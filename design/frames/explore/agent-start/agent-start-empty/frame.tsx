import { ui } from "spool";
import { NoticeStage, Prototype } from "shared/ui/explore/agent-start/stage";

export default function Frame() {
	return (
		<Prototype note="empty project · the same handoff guide is available before opening chat">
			<NoticeStage
				take="empty"
				onGuide={() => ui.go("agent-start-guide--claude")}
				onContinue={() => ui.go("agent-start-dialog--ready")}
				onClaude={() => ui.go("agent-start-dialog--claude")}
				onCopy={(text) => ui.copy(text)}
			/>
		</Prototype>
	);
}
