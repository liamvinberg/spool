import { StreamStage } from "shared/ui/explore/agent/stream-stage";

/**
 * agent-say-plain: the same edge with the fade taken off.
 *
 * Same drain, same word-sized steps, same reserve. A word is either there or not, which
 * is what Claude.ai and ChatGPT both do at the edge. The question this row asks is
 * whether the fade was doing anything the pace was not already doing: at 83 characters
 * a second a word arrives every 60ms or so, and a 170ms fade on top of that means the
 * eye sees three things in motion where the writing itself is one.
 */
export default function AgentSayPlainFrame() {
	return <StreamStage words="plain" log="cut" focus="say" />;
}
