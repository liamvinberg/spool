# Shared editing and a page of primitives

**Later pass:** [Visual properties over live source](visual-properties-mapping.md) explores Figma-like controls and direct padding/gap gestures in six working frames. It replaces this document's utility-list recommendation with a compact visual inspector plus contextual canvas handles. The library findings below remain relevant.

Research and prototype review, 2026-09-05. Recommendation for review, not a replacement for the accepted tickets.

**Keep shared editing. Build a small, real component library as part of authoring a project. Start its visible home as an ordinary spool page of working examples. Defer the automatic page of every exported component.**

The need is sound: changing a shared button should work, and a person should be able to see the pieces an app uses. The larger proposal bundles this with automatic discovery, isolated previews, another kind of page, and another kind of frame. Those are separate investments. They do not need to precede the first useful version.

Liam's follow-up widened the review to the properties rail itself: the first library prototype's custom fields did not follow the existing properties model, and the shipped rail also feels too heavy. **The immediate design priority is now a cleaner Tailwind editing surface that works both on an application frame and on a component example.** The library recommendation below remains provisional; the properties takes are the latest material to judge.

Three runnable takes are on `explore/components/reconsider/library` in this checkout's design canvas:

- `primitives-context`: edit from the product, with a list of uses and no library destination.
- `primitives-examples`: an ordinary `system/primitives` page with chosen states, plus contextual editing. **Recommended starting point.**
- `primitives-catalog`: an illustrative automatic export gallery, including a closed dialog and a component with no usage. Compare it with the existing `library-frames` prototype for the previously selected camera and arrangement.

Run `pnpm dev url primitives-examples` to get its player address. `pnpm dev open` opens this checkout's canvas. The player prototypes keep edits in memory. They do not modify a project's source.

## Follow-up: Tailwind as an interface

Three additional frames stand on `explore/components/reconsider/properties`:

| Take | What changes | Tradeoff |
| --- | --- | --- |
| `properties-fields` | Only properties actually used by the selected element appear, grouped into compact sections. Each field shows the Tailwind class it represents. | Most familiar, but repeating a property name beside a readable utility can still feel like extra furniture. |
| `properties-utilities` | A direct list of the element's utilities. Pressing one opens its values, colour swatches where applicable, hover previews, an arbitrary-value input, and removal. | Earlier recommendation, superseded by the visual-properties pass. Least duplication and closest to Tailwind. Someone who does not know utility names needs the descriptions and search. |
| `properties-nearby` | The same utility editor floats over the canvas instead of occupying the dock. | The lightest permanent chrome, but can cover the design. Its placement is fixed in this prototype, not a proven selection-following layout. |

These takes use the same application frames, example destination, classes, and operations. Select Button or Card, edit a value, change scope, add a class, remove one, undo, or visit examples. The footer can reveal the complete current className. The fields in the earlier library takes are now historical comparison material; they are not the recommended rail design.

### What comes from Tailwind

Tailwind's own docs establish the useful structure. Utilities are composed on an element. Conflicting utilities are resolved by stylesheet order, not the order of words in className, so a value picker should replace the intended family rather than append a conflicting word. [Utility classes](https://tailwindcss.com/docs/styling-with-utility-classes)

States and breakpoints qualify utilities, and qualifiers can be stacked. Editing `hover:px-6` must not silently replace `px-4`. Responsive styles build on unprefixed styles; the unprefixed value is not limited to mobile. [States](https://tailwindcss.com/docs/hover-focus-and-other-states), [Responsive design](https://tailwindcss.com/docs/responsive-design)

Theme variables connect design values with available utilities. Choosing `bg-thread` for this element and redefining `--color-thread` for the project are distinct operations. A colour menu should make the first easy; the global definition edit deserves its own explicit action and #34's source attribution. [Theme variables](https://tailwindcss.com/docs/theme)

The proposed interface follows those concepts: **selection → scope → utility → value**. Components and examples supply context and navigation. They do not introduce another property editor.

### What should change in the current rail

Read `src/ui/canvas/properties-rail.tsx`, `properties-sections.tsx`, `properties-rows.ts`, and `src/daemon/class-write.ts`, plus their design counterparts. The current presentation always calls position, size, layout, appearance, fill, stroke, and text sections. It already reveals some secondary rows conditionally and offers a class entry field. The proposal reduces its initial surface; it does not claim that the current implementation displays all 130 families at once.

| Before | After | Why |
| --- | --- | --- |
| Seven persistent sections with baseline fields | Show the selected element's authored utilities; reveal additional controls when requested | Selection determines the amount of UI. |
| A property label plus a token plus supporting fields | Let the token itself open the appropriate control | Avoid saying the same thing several ways. |
| Shared scope as another substantial block | One source line with an expandable list of uses | Keep scope available without competing with the edit. |
| Component examples requiring different controls | The same selection and utility editor on both application and example frames | Visiting the library does not require learning another editing model. |
| Many advanced controls visible together | One value picker at a time, with text input available | Preserve reach while reducing the resting surface. |

Keep the existing production interpretation, compiler validation, source boundaries, and class-writing machinery. A redesigned presentation should not replace these with the prototype's narrower mechanics. In particular, a polished implementation still has to handle shorthand overlaps, logical directions, important markers, custom themes, arbitrary variants, inherited CSS, and expressions whose value cannot be written directly.

The prototypes reuse `shared/lib/spool/properties-families.ts` for parsing scopes and compiling the sample styles, and `cn()` to merge the edited utility within a scope. They expose thirteen selected families and four scope choices. This is a design comparison, not complete Tailwind support. The preview intentionally forces the chosen scope so its change can be seen; the compound-scope preview uses a fixed precedence for this fixture. A real implementation must rely on the project's compiled CSS and current conditions.

A browser interaction probe verified replacement of `px-4` with `px-6`, a separate `hover:px-8` write, preservation of base classes, undo, an arbitrary `px-[18px]` value, the corresponding rendered padding, navigation to examples, and fewer rows when selecting Card. Each of the three rail takes also compiled and produced a screenshot for visual inspection. These observations support the mechanics of the comparison; Liam's preference remains open.

## What the existing work already establishes

Read [#29](https://github.com/liamvinberg/spool-cloud/issues/29), [#30](https://github.com/liamvinberg/spool-cloud/issues/30), [#31](https://github.com/liamvinberg/spool-cloud/issues/31), and [#32](https://github.com/liamvinberg/spool-cloud/issues/32), including all comments. Also read the prior [instance research #44](https://github.com/liamvinberg/spool-cloud/issues/44), [preview question #38](https://github.com/liamvinberg/spool-cloud/issues/38), and the latest [write and undo resolution #34](https://github.com/liamvinberg/spool-cloud/issues/34#issuecomment-5546876667).

The scope and reach decisions have a strong foundation:

- #29 records a multi-project scan in which shared uses dominate many projects. Its figures are explicitly heuristic. They establish that the refusal is widespread in source, not how often people encounter it during editing.
- #30 moved reach from hover to selection. It kept one accent, added the component name, and used the pages rail to show uses outside the viewport. This is substantially calmer than lighting the project on every hover.
- #31 correctly distinguishes a component from the file that happens to contain it. Its automatic crop and universal component-frame decisions need more evidence.
- #32 correctly prioritizes travel from the selected thing and a quiet destination. The permanent synthetic row is only needed if the synthetic page survives.
- #34 already settles a shared source-write lane, explicit token definitions, preservation of unrelated edits, and undo independent of the originating frame. This review preserves that contract. The prototype does not claim to implement it.

Local implementation inspection confirms the actual obstruction. `src/daemon/hand-lane.ts` rejects a selected source outside the current frame folder in both reading and writing. `src/daemon/flows.ts` exposes a file dependency index, not a rendered-component census. `src/daemon/hands-api.test.ts` asserts the shared refusal; `src/daemon/app.test.ts` already covers recompilation after shared component and token changes. Changing the entry point to a library page does not solve the write or undo work.

There is also a relevant existing artifact: `design/frames/system/primitives/frame.tsx` imports the real components from `shared/ui/spool/` and renders chosen states. It already demonstrates the authored-example model without a library subsystem.

For scale, a read-only Babel scan of the working tree found **102 existing TSX files and 299 named PascalCase callable export candidates** under `design/shared/ui/`, captured before the properties follow-up and excluding the original two prototype files. Forty-six files have more than one such candidate; `spool/icons.tsx` contributes 28. This is a syntactic count, not component classification: it excludes default exports and can include helpers. It was captured with other sessions' uncommitted canvas work present, at base commit `34dd9d6`. Its implication is modest: exporting a function is not the same as deciding it deserves a large visual specimen.

## What other tools actually do

The comparison below separates documented behavior from my suggested transfer. Sources were checked on September 5. This is primary-source research, not a usability study or a claim to have operated every product.

| System | Documented approach | What transfers to spool | Cost or mismatch |
| --- | --- | --- | --- |
| Figma | Instances link to a main component; changes propagate within a file. A selected instance can navigate to its main, with a return-to-instance action after travel from another file. [Edit main components](https://help.figma.com/hc/en-us/articles/360038665934-Edit-main-components) | Make the round trip between a use and its definition easy, and preserve where the person came from. | Figma owns editable main nodes and instance overrides. A React function is not a stored visual main node. |
| Framer | The code author declares property controls and their options; defaults still matter when components are created through code. Controls can depend on other props. [Property Controls](https://www.framer.com/developers/property-controls) | A small, intentional set of editable values is understandable. Distinguish a component's input from its internals. | A universal property-controls registration API would add authoring work and another contract to maintain. |
| Storybook | A story supplies arguments for a rendering. Context providers can be supplied with decorators. Controls can update a story file or save a new story; the UI can create a basic story for a component that has none. [Args](https://storybook.js.org/docs/writing-stories/args), [Providers](https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-providers), [Controls](https://storybook.js.org/docs/essentials/controls) | Make deliberate, runnable examples, including useful states. An agent can author these using spool's existing frames. | Inferring input types does not establish representative data, context, or state. A full stories and controls system is larger than this need. |
| Plasmic | Code components are registered with prop metadata. The API includes templates, thumbnails, default styles, nested component grouping, slots, and control over which styling sections appear. [Code components reference](https://docs.plasmic.app/learn/code-components-ref/) | Group the useful public component and its parts; supply a meaningful starting composition. | Registration and templates are the explicit cost of predictable arbitrary components. Automatic previewing has not made that cost disappear. |
| Subframe | Components have props, source, and interactive examples in their docs. The documented import flow recommends importing the theme first, then uses an agent to recreate a component from supplied code. [Component docs](https://docs.subframe.com/guides/component-docs), [Component overview](https://docs.subframe.com/learn/components/overview) | Strong precedent for seeing and trying an app's component vocabulary. Theme-first authoring is useful when importing an established product. | The documented import is a reconstruction flow. Do not infer live, bidirectional projection of arbitrary source code from it. |
| Webflow | Properties customize individual instances. Its current docs include automatically suggested properties, reviewed before creation, and a `class` custom attribute for instance styling. Editing the main is a separate step. [Component properties](https://help.webflow.com/hc/en-us/articles/33961219350547-Component-properties) | Distinguish editing an input at a use from editing the shared definition. Suggestions can assist the author without silently deciding the surface. | The earlier research's description of a wholly manual, declared surface is incomplete. Webflow owns a model from which it can suggest properties. |
| Penpot | Components have mains and copies, shown with different icons. Copies can override properties; edits can be pushed to the main. The docs also distinguish viewport objects from their asset-library presence. [Components](https://help.penpot.app/user-guide/design-systems/components/) | A library and the place a component is authored need not be identical views. A visual system can be built from actual design objects. | Copy and override semantics do not map directly onto source calls in React. |
| UXPin Merge | Its integration documents special handling for portals, wrapped components, and namespaced components. Patterns can save composed elements for reuse; the docs explicitly distinguish individual element code from code for the entire saved group. [Adjusting components](https://www.uxpin.com/docs/merge/adjusting-components/), [Patterns](https://www.uxpin.com/docs/merge/patterns/) | Useful examples often contain a composition of parts. Treat dialogs and wrappers as normal cases to design for. | Importing React does not automatically supply all the information a visual editor needs. A saved visual composition is not necessarily source-backed as a whole. |
| Onlook | Its documented interface centers on canvas, layers, properties, styling, code, and AI. At the source snapshot inspected below, style selection defaults to the definition target; deletion can target the component call site. [UI overview](https://docs.onlook.com/getting-started/ui-overview) | A source editor can prioritize direct editing and navigate by source identity without first building a complete design-system browser. | It is a useful mechanism precedent, not evidence that people understand silent global edits. |
| shadcn/ui | Components are delivered as editable source, with common composition conventions and a distribution format. [Introduction](https://ui.shadcn.com/docs) | A project's library can simply be its code. The agent and the visual hand should reach those same definitions. | Distribution, package catalogs, and installing components are different problems from showing what this project already uses. |
| Paper | Its roadmap still labels using code components as in progress and components with slots as coming soon. [Roadmap](https://paper.design/roadmap) | Relevant direction and visual inspiration. | These roadmap items are not evidence of a shipped solution to the instance or preview problem. |

For Onlook, re-read the implementation at the same reproducible commit as #44: [`StyleManager`, `423e2e9`](https://github.com/onlook-dev/onlook/blob/423e2e924366419e418ee049093872d535eea41a/apps/web/client/src/components/store/editor/style/index.ts) initializes and resets to root mode, and chooses either `instanceId` or `oid` for a style target. [`ElementManager`](https://github.com/onlook-dev/onlook/blob/423e2e924366419e418ee049093872d535eea41a/apps/web/client/src/components/store/editor/element/index.ts) chooses `instanceId ?? oid` for deletion. These are snapshot claims, not an assertion about all current Onlook UI paths.

Two corrections to the earlier synthesis matter. “Every specimen is hand-authored” is too absolute: Storybook can create a basic story through its UI, and Webflow suggests props. The narrower supported conclusion is that the surveyed tools use explicit examples, defaults, templates, or main objects. **None of the reviewed documentation establishes first-runtime-usage cropping as a complete general-purpose component workbench.** That is an absence in this survey, not proof that no product has ever done it.

## The weak point: one crop does not define a component

An instance preview answers “what did this component look like here?” A component example answers “what does this component do under these chosen inputs?” Both are useful. They are not interchangeable.

React explicitly allows a component's output to be rendered somewhere else in the DOM while retaining React ancestry and context. A DOM crop therefore cannot generally stand in for the entire React component. [React portals](https://react.dev/reference/react-dom/createPortal)

The following are engineering deductions from those semantics, the Storybook context requirements, and #38's own alternatives:

| Case | First-use crop | Deliberate example |
| --- | --- | --- |
| Button with several appearances | Shows one appearance and label. | Shows the appearances that matter together. |
| Closed dialog | Can have no visible rectangle. | Supplies a trigger and an open state. |
| Dialog using a portal | The output can be outside the parent DOM subtree. | Mounts the composition in a known environment. |
| Child of a context provider | Keeping the whole original document retains context; remounting the child alone may fail. | The example provides the necessary parent. |
| Shell or full-width card | Cropping can require most of the original frame. Resizing an isolated crop changes its context. | A suitable viewport and children are chosen explicitly. |
| Component under a condition | Its source can be referenced while it renders nothing in this run. | Relevant conditions are represented as chosen states. |
| Repeated list item | One observed row says little about empty, long, or selected content. | Several useful values can be shown. |
| Component with no app usage yet | There is no crop to obtain. | A new primitive can be designed before its first application frame. |

The last row is particularly relevant to the user's proposed workflow. A library-first tool whose only preview comes from an existing app usage cannot help with the very first primitive without adding an exception.

Authored examples do have upkeep. Importing the real Button prevents a second implementation from drifting, but the chosen labels, states, and selection of examples can become incomplete. Keep them small and ask the agent to maintain an example when it changes the component's intended surface. Do not require an exhaustive matrix for every internal helper.

## Recommended shape

Use “primitives” here to mean the project's reusable visual pieces: Button, Field, Badge, perhaps a repeated PayBar. It does not mean rebuilding a headless accessibility library, nor does it mean that every exported helper belongs in a gallery.

```text
shared/tokens.css       shared/ui/button.tsx
          │                    │
          └─────────┬──────────┘
                    │ imported by
          ┌─────────┴───────────┐
          │                     │
   system/button examples   booking/checkout
   default · disabled       real label and action
          │                     │
          └──── same source ────┘
```

**Authoring:** for an established product, reuse its theme and component vocabulary first. For a new direction, sketch enough of a real frame to choose a visual language, then make the handful of shared pieces the next frames need. If the language is already chosen, starting directly with those primitives is sensible. React's own guidance accepts both top-down and bottom-up construction; it does not prescribe finishing a universal library before building a screen. [Thinking in React](https://react.dev/learn/thinking-in-react)

**The visible home:** an ordinary page, created when useful. A small project can have one `primitives` frame; larger projects can split Button, Field, and Dialog into separate example frames under `system`. Existing page navigation, frame sizing, camera, source stamps, and interaction remain applicable. The library grows because the project needs another piece.

**Editing:** the source of the value determines the target. A literal label passed at checkout belongs to that use. A radius written in Button belongs to the shared definition. Changing a token declaration belongs to that declaration, under #34's source rules. Show the scope next to the relevant fields. A blanket “this selection changes everything” is inaccurate when different fields write different places.

This would explicitly narrow #29's instance-only exclusion. Literal input editing is a proposal, not a settled consequence of this review. The prototype makes it tangible because otherwise a basic request such as changing one payment label still has an unnecessary wall. It does not promise to invert state, calculations, or arbitrary expressions.

**Navigation:** keep component identity and the list of uses available from selection. If an example exists, offer `View examples`; preserve the originating page, camera, frame, and selection on return. Keep the source/editor action separate. Calling a source path a library link makes the destination less predictable.

An optional link to examples still needs a lookup. In the first version, authored pages are usable through ordinary navigation without it. Before automating the link, choose a small explicit convention or a reliable relationship derived from those example frames. Do not pretend the example destination can always be inferred merely because a component was imported.

**Reach:** keep #30's selection-triggered marks. Distinguish source references from observed renderings. An export can be conditionally used, nested in another component, or return multiple DOM nodes. A file dependency can also contain multiple exports or module-level effects. A symbol index helps navigation; it does not by itself prove exactly which pixels will change. Use honest “used in” wording for source references, visible rings for resolved live occurrences, and an unknown state where attribution is incomplete. Keep file dependencies for recompilation.

**Tokens:** keep selecting a token separate from changing its definition. A token sheet can be a frame; a safe token editor still needs #34 and #56's declaration provenance. Do not make global token editing depend on shipping an automatic component gallery.

## Proposed second pass on the tickets

These are proposed amendments. No issue was edited, reopened, or closed by this session.

| Ticket | Keep | Proposed change |
| --- | --- | --- |
| #30, shared signal | One accent; component name; marks on selection; reach beyond the viewport; deletion follows the call site where identifiable. | State scope per operation. A literal call-site value can be local while a definition field is shared. Specify source-reference versus observed-render counts. Do not assume a per-export count alone solves element attribution. |
| #31, library unit | Component identity; file as address; meaningful grouping. | Replace “every exported component becomes a generated frame” with a first version using ordinary authored example frames. First-use previews are contextual evidence and an optional later index feature. |
| #32, door | Contextual travel and a quiet return path. | Use ordinary `system` navigation initially. Add an explicit examples action where its target is known. Defer the fixed synthetic library row until there is a demonstrated need for an automatic inventory. |
| #29, umbrella | Shared edits and tokens should be reachable, safe, and undoable. | Separate shared editing, authoring guidance, examples, and automatic inventory. Clarify the instance-input proposal instead of retaining an absolute rule contradicted by deletion and potential prop edits. |

Suggested replacement sentence for #31:

> The library is the project's shared code. Its first visual home is a normal page of examples that import that code. Components may have several useful examples; internal exports do not each require a frame.

Suggested replacement sentence for the editing boundary, if accepted:

> A hand edits an identifiable source value where it is written. A literal supplied at one call site changes that use; a value in a shared definition changes its consumers. Creating new component structure remains the agent's work.

## Build order and the bloat test

1. **Dogfood the authored page now.** Choose one real product and its small shared vocabulary. The existing spool canvas can already display and run it. Judge the page by whether it helps design the next frame.
2. **Ship shared editing with trustworthy undo and attribution.** This removes the real refusal. It is useful even if the library destination is later rejected.
3. **Add the smallest useful travel path.** Used-in navigation and a known example destination. Return to exactly where the edit began.
4. **Evaluate automatic inventory only after use exposes a retrieval problem.** It could later search and group exports, show observed uses, and reveal missing examples. There is no evidence here requiring it to block the first three steps.

Keep the scope small: no new registration SDK, insertion palette, drag-to-compose system, library publishing, adoption dashboard, or compulsory example for every export in this pass. Those solve other jobs.

The rejection case is concrete. If, during real work, people can make shared edits and consistently find components through selection, and the examples page is never used to compare states or make a design decision, the dedicated examples surface has not earned upkeep. Drop it. Shared editing remains valuable. Conversely, if people repeatedly search for a piece that has no visible use, an inventory has earned a test.

## What the prototype can and cannot establish

All three takes reuse the same demo Button, Badge, and Dialog implementations in `design/shared/ui/explore/components/reconsider/parts.tsx`. Their theme and radius changes propagate through one shared React context. Checkout's label lives separately. Each take has its own in-memory state, Undo, Reset, and an inspectable state disclosure.

The comparison uses the same shell, rails, frame names, and editing controls. The authored take shows solid, outline, and disabled buttons and an openable dialog. The catalog includes illustrative export entries and missing previews. Its data and source addresses are fixtures; it performs no export discovery or cropping. The new takes do not reproduce the canvas camera inside the frame. The earlier `library-frames` remains the visual reference for that behavior.

Try five things:

1. Set Button's radius to 16 and inspect another frame.
2. Change the accent and compare Button with Badge.
3. Visit checkout and change its label; verify the Swish frame keeps its label.
4. Open the Dialog example, then compare it with the catalog's closed initial use.
5. Return to the original frame and undo the last change.

These interactions demonstrate the proposed distinction between shared values, local input, and examples. They do not prove that a new user understands it, that source targeting is safe, or that recompiling many frames is fast. No performance claim is made. Real source-write safety belongs to #34 and its follow-up research; crop implementation remains unvalidated.

## Verification and remaining uncertainty

Repository `pnpm typecheck` and `pnpm check` passed. The all-design `pnpm dev check` reports existing errors in unrelated exploration and site files, with no diagnostics in this pass's `reconsider` files after correction. The initial prototype's missing Dock export was corrected locally rather than changing shared chrome. Browser checks cover the proposed utility edit interactions; source-write safety is not implemented or claimed.

The Figma instance-overrides help page could not be retrieved in this pass. The Figma claims above use the accessible main-component article. Paper is explicitly treated as roadmap evidence. Onlook's source findings are pinned to a commit, while the other tool behavior is tied to the linked documentation observed on the research date.

The open product question is taste and actual use: whether a normal page of deliberately selected components feels like part of spool to Liam. The evidence favors trying it before building the universal inventory. It does not settle that preference on his behalf.
