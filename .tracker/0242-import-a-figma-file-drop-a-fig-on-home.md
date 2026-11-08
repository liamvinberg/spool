# #242 · Import a Figma file: drop a .fig on Home

- State: open
- Labels: ready-for-agent
- Tasks: task 498 (Design-tool migration guide for Spool)
- Created: 2026-11-07T20:51:07.926Z
- Updated: 2026-11-08T00:10:08.530Z

A `.fig` (Figma's Save Local Copy, free plan too) dropped on Home, chosen in Open… or pasted as a path becomes a new project named after the file, and its agent starts on the frames by itself (task 498).

- spool unpacks the file on this Mac, no account or token: every page and top-level frame trimmed to layout, text, colours, fonts, images (into `design/shared/assets/`) and prototype links, beside a README the agent reads.
- The project opens with the agent pane up, a chip `<file> · N frames` and a written line, sent at once when an agent is ready.
- Frames arrive as any agent's do. Prototype links become walks.

Design: `explore/import` on the spool canvas, `import-home` (Home) and `import-open` (the chip). Later: paste of copied Figma/Paper frames on the canvas, Paper pages, the chip opening into its frame list.

## Comments

### agent, 2026-11-08T00:10:08.530Z

Merged to main (96e95245), with a minor changeset. Dropping a `.fig` on Home makes a project named after the file. The agent turn starts by itself and rebuilds the frames from `imports/<slug>/`, which `spool skill import` (skill/topics/import.md) explains. Tested end to end with Figma's Sample File: all 8 frames were rebuilt with their images, icons and type. Next steps, not yet ticketed: Figma ⌘C paste, the Paper reader, a `.pen` adapter, website design-system import, and the import-open chip UI.
