# Features held back from the first release

Four features were built, work, and are deliberately not in 1.0. This file is the map back to
them: what each one was, which commit took it out, and what is worth reworking before it returns.

Nothing was thrown away. The full set as it stood before any of this is the annotated tag
**`v0-full`** (`bf2d16ae1aef0f2b4e3cb70eaf54dddeee5560f5`), also kept as the branch
**`archive/full-feature-set`**. That branch is not maintained and will not follow this one — the
tag is the record, the branch is only there to be noticed.

**To bring one back:** `git revert <sha>`. Each removal commit took out one feature and nothing
else, so its inverse is the feature as it was. Expect conflicts in proportion to how much the code
around it has moved since; the list below says where to look.

Before any of the four were removed, three refactors landed on `master` to cut them loose. They
are on both lines, so neither a revert nor the code it lands in carries the tangle they undid:

| Commit | What it separated |
|---|---|
| `309bb01` | `ContentTypesFilters` was three things in one file. Split into `ContentTypesFieldTypes` (what kind of value a column holds — the columns, the bulk editor and the CSV writer all need it), `ContentTypesSearch` (the typed term), and the filtering proper. |
| `7e3b3ec` | The mutation-kind → document map moved from `useCellEdit` to `ContentTypes.gql`, so deleting the cell editor could not break bulk editing. |
| `e010e99` | The read every write does before replacing a value, written out at three call sites, became `captureUndo`. |

---

## Assign to — `01082314eec5cbbedad567df9320889a6012785a`

Raising one task for the ticked rows, assigned to someone who may edit the site.

**What went:** `ContentTypesAssignDialog`, `ContentTypesTasks` (+ spec), `useEditableUsers`, eight
GraphQL documents, the `assignTo` bulk-menu entry, and the task-shaped undo.

**What stayed, and must not be removed:** the `[ct:taskTarget]` mixin in `definitions.cnd`.
Jahia's `DefinitionsBundleChecker` treats removing a registered node type as a MAJOR change and
refuses the whole module deployment — and a definition stays registered after the module is
uninstalled, so there is no clean way back. It is a mixin nothing applies. Leave it there.

**Worth reworking first:** working out who may be given a task costs three round trips over access
control, because the site's grants have to answer before it is known which groups need expanding.
On a site that grants roles to users directly the last two are skipped, but it is still the
slowest thing in the module.

## Undo — `371a1172be934b13b7656e3fa9d631dae5fca2a0`

One level of undo behind every bulk operation: the values read before each write, the publication
stamps captured with them, the restore, and the bar offering to take it back.

**What went:** `ContentTypesUndo` (+ spec), `ContentTypesUndoAction`, `useBulkUndo`, the
`CAPTURE_TIMESTAMPS` document, and the recording at each write.

**Where to look on a revert:** one piece was never really undo and stays — adding tags or
categories has to read what each record holds to compute the union, so that read lives on as
`captureHeldValues` in `ContentTypesBulkFields`, with the assertions that covered it. A revert has
to reconcile the two rather than restore a second copy.

**Worth reworking first:** it is one level and one snapshot, by design, and it notices nothing
another editor does to the same records in between. That is honest for a step taken straight away
and thin as a promise. Decide whether 1.x wants the same bargain before putting it back.

## Inline cell editing — `5a4e1b0922a0468904e6f21c231e6e4647d51917`

Correcting a value in the cell that shows it: the pencil on hover, the double-click, the editor
inside the cell, the dialog for a value too long for one, and single-record tagging from the tags
cell.

**What went:** `ContentTypesCellEdit` (+ spec), `ContentTypesCellEditor`,
`ContentTypesCellEditDialog`, `useCellEdit`, and the `canEdit: hasPermission(...)` the record
query asked of every row.

**Where to look on a revert:** the Name column's editor wiring (`NAME_VALUE_KEY`,
`valueSelection`, `isEditableName` in `useContentTypeColumns`) was orphaned by this commit but
removed in the next one, so restoring the editor takes both.

**Worth reworking first:** editability was decided per cell from a permission asked per record,
which is correct and is a column of extra data on every row of every page. Bulk editing answers
the same question from the field catalog alone.

## Column filtering — `20cfc07d80ee78384ffdc05413d0143844d02e3a`

Setting a condition on a column from its heading, and narrowing the table by it — with the
conditions held in the address bar, so a narrowed table was a link.

**What went:** `ContentTypesFilters` (+ spec), `ContentTypesFilterOverlay`, `useColumnFilters`,
the toolbar summary and chips, and the clickable heading.

**Where to look on a revert:** the heaviest of the four by far, with around seventy touch points
in `ContentTypesTable` alone. Search and filtering used to compose into one constraint through
`toNodeConstraint`; search is now the constraint on its own, so that merge has to be reinstated
rather than restored.

**Worth reworking first:** publication status could not be filtered honestly. It is not a
property, so the repository can neither narrow nor count by it — the table read up to 2000 records
and did its own filtering and paging over them, and said so when there were more. Either that
needs an answer from the platform or the filter should not be offered.

**Still in the tree unread:** `jcrProperty` on the common columns in `useContentTypeColumns`,
which records which JCR property each column reads. Nothing consumes it today; filtering is what
did, and it is what filtering would need first.
