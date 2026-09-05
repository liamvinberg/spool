# Pen, Paper, and Figma workflow study

Research date: **2026-09-05**. Brief and tracking: [spool-cloud #58](https://github.com/liamvinberg/spool-cloud/issues/58). This is an evidence-backed product investigation, not an approved Spool design or implementation plan.

## Start here

| Read | Purpose |
| --- | --- |
| [Comparison](comparison.md) | Cross-product workflows, runtime boundaries, source ownership, and implications |
| [Pen](pen.md) | Local design documents, reusable nodes, script execution, and agent/export boundaries |
| [Paper](paper.md) | Web layout, token editing, HTML translation, synchronization, and handoff |
| [Figma](figma.md) | Design components/prototypes and Make's executable, editable code |
| [Evidence index](evidence/README.md) | Screenshots, synthetic examples, reproduction, and capture limits |

## What changed our understanding

1. **“Competitors cannot run live applications” is false as a blanket claim.** In Figma Make, a real textarea accepted a note; Save incremented React state and displayed that note. Direct TSX editing changed the preview. A visual property edit became an agent-authored TSX change. Figma Design separately ran a wired navigation between two frames. Pen separately executed a JavaScript script node that generated design layers. These are distinct runtime contracts. [Make before/after](evidence/figma-09-make-after.png), [Make source](evidence/figma-make-App.tsx.txt), [Pen probe](pen.md#4-runtime-and-interactivity)
2. **Paper's use of HTML/CSS does not make an imported design the original application.** The tested HTML button with a click handler became design frames; the imported input became frames/text. Exported JSX retained visual styles and variable references, but neither an input nor the handler. This result applies to the tested MCP HTML path. [Paper runtime findings](paper.md#4-runtime-and-interactivity), [raw export](evidence/paper-export.jsx.txt)
3. **A local file and a local service answer different questions.** Pen saved and reopened a local `.pen`; its disclosures separately describe account services and remote processing. Paper's local MCP and browser synchronized one user's edits, while official release notes supply the separate evidence for human collaboration. No multi-person, offline, or packet-level test was performed. [Pen storage](pen.md), [Paper storage](paper.md#6-collaboration-storage-and-delivery)
4. **“Reuse” must name the relationship.** Pen and Figma Design component changes reached instances while retaining text overrides. Paper's duplicate remained an independent clone, although both copies kept a color token. This does not establish that Paper lacks every component mechanism. [Component comparison](comparison.md#reuse-and-editing-contracts)

## Method and coverage

The installed applications were **Pen 1.2.8**, **Paper 0.5.7**, and **Figma 126.8.18**. One agent controlled the shared desktop through the requested Computer Use skill's supported CUA runtime. Independent documentation investigations used current first-party guides, schemas, release notes, and disclosures. All three products received hands-on scratch-document work; Figma also received a separate Make test. Existing work documents were preserved.

The common task was a responsive reading card, wrapping text, spacing value, repeated button, image, and an interaction where supported. It was a comparison of workflows, not a visual-fidelity contest. Native model differences were preserved: a clone was not relabeled an instance, a script parameter was not called user application state, and frame navigation was not called a backend mutation. Figma Design's image import was attempted but not completed; Make rendered a synthetic image successfully.

**Observed** means the stated action/result was inspected locally. **Documented** means an operational first-party source states it. **Claimed** denotes vendor positioning or a capability announcement without local verification. **Inferred** identifies a deduction. **Unverified** records a specific unresolved test or access boundary. Not finding a control is not proof of unsupported behavior.

Every requested investigation area is covered in each report, with remaining gaps explicitly scoped. The strongest observations concern selection/editing, reflow, tokens, reuse, runtime, and code translation. Cold offline starts, crash recovery, cross-user conflicts, paid permission boundaries, advanced libraries/modes, arbitrary network calls, and existing-repository round trips remain open. No plan upgrades, invitations, published links, or production feature changes were needed.

Native capture sometimes returned a blank image despite usable accessibility state. Paper and Figma visual tests therefore used browser surfaces; Pen's earlier native captures worked, while its final reopen capture was blank. These are capture limitations, not established product rendering bugs. Clipboard and shortcut misfires were corrected and are not presented as usability measurements.

## Relationship to earlier work

This study extends the [shared-library second pass](../shared-library-second-pass.md), [visual properties mapping](../visual-properties-mapping.md), [Figma editing workflows](../figma-editing-workflows.md), and [properties foundation audit](../properties-foundation-audit.md). Their Spool proposals remain proposals. In particular, this investigation does not decide a properties-panel taxonomy, source-editing architecture, or feature priority.

To continue, start with the per-product unknowns. The highest-value unresolved distinction is whether a product preserves existing source identity and binding semantics across an actual repository round trip, rather than generating a visually similar new project.
