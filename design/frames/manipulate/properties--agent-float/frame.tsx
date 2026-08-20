import { PropertiesScreen } from "../../../shared/ui/spool-properties-screen";

/**
 * The agent rail is on and untouched: the properties card floats at the element, the
 * composer's chip names the same element, and the two never compete for the column.
 * The rail stays the agent's whole, which is what #238 gated it off to protect.
 */
export default function PropertiesAgentFloatFrame() {
	return <PropertiesScreen config={{ surface: "float", vocab: "tailwind", tail: false, agent: "float" }} />;
}
