import { PropertiesScreen } from "../../../shared/ui/spool-properties-screen";

/**
 * The agent rail is on (#238's flag), and it owns the right column as it ships: no
 * tab row, transcript above, composer below. The properties surface stacks between
 * them as a shelf — the selection chip the composer already carries, opened into
 * its fields. One column, one selection, two ways to act on it: type to the agent
 * or turn a knob yourself.
 */
export default function PropertiesAgentStackFrame() {
	return <PropertiesScreen config={{ surface: "rail", vocab: "tailwind", tail: false, agent: "stack" }} />;
}
