import { EngineRecovery } from "shared/ui/explore/engines/engine-recovery";
export default function Frame() {
	return <EngineRecovery seed="quiet" railWidth={280} initialModel="google/Gemini 2.5 Flash" permissionFooter />;
}
