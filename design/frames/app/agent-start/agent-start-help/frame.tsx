import { ui } from "spool";
import { NoticeStage, Prototype } from "shared/ui/spool/agent-start/stage";

export default function Frame() {
	return (
		<Prototype note="help · open the agent picker from the ? above settings">
			<NoticeStage
				take="ready"
				helpOpen
				onGuide={() => ui.go("agent-start-guide--claude")}
				onContinue={() => ui.go("agent-start-dialog--ready")}
				onClaude={() => ui.go("agent-start-dialog--claude")}
				onCopy={(text) => ui.copy(text)}
			/>
		</Prototype>
	);
}
