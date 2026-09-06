import { EngineRecovery } from "shared/ui/explore/engines/engine-recovery";
export default function Frame() {
	return <EngineRecovery seed="bypass" initialEngine="claude" railWidth={280} permissionMenu />;
}
