import { useState } from "react";
import { FoldStore, type FoldScreen } from "shared/ui/site/fold-objects/fold-store";
export default function Frame() {const [screen,setScreen]=useState<FoldScreen>("campaign");return <FoldStore screen={screen} onNavigate={setScreen} />;}
