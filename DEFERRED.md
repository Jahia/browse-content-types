# Features held back from the first release

Seven features were built, work, and are deliberately not in 1.0, along with the menu the last
three of them hung off. This file is the map back to them: what each one was, which commit took it
out, and what is worth reworking before it returns.

## The quick answer

**To bring a feature back, merge its branch.** Each `feature/*` branch below is this line with that
feature restored, already built and already passing its tests:

| Branch | Restores | Tests |
|---|---|---|
| `feature/bulk-menu` | the `contentTypesBulkActions` menu and extension point | 127 |
| `feature/export` | …and Export (CSV, JSON) | 207 |
| `feature/replace-a-value` | …and Replace a value | 250 |
| `feature/tag-categorize` | …and Tag and Categorize | 293 |
| `feature/column-filtering` | …and column filtering | 335 |
| `feature/inline-cell-editing` | …and inline cell editing | 385 |
| `feature/undo` | …and Undo | 415 |
| `feature/assign-to` | …and Assign to | 478 |

**Read the "…and" literally. The branches are a stack, not a menu.** Each row contains everything
in the rows above it, because that is the order the features came out in and the code interlocks:
Export registered an entry in the bulk menu, so it cannot come back without it; Undo recorded the
values each write replaced, so it cannot come back without the writes. Merging
`feature/inline-cell-editing` brings back cell editing *and* filtering, tag, replace-a-value,
export and the menu. There is no branch that restores one of the lower features alone.

This was measured, not assumed: reverting any single removal onto `master` conflicts, in every case
but the menu. The stack is the order in which the reverts apply cleanly.

If one feature is genuinely wanted on its own, it has to be rebuilt from its branch rather than
merged from it — take the files and the registration, drop what belonged to the features beneath.
The per-feature sections below say what each one owned.

## The archive points

Three tags record the tree as it stood before each round of removals. Branches of the same content
exist so the points are noticeable in a branch listing; the tags are the record, and neither the
branches nor the tags are maintained.

| Round | What came out | Tag | Branch |
|---|---|---|---|
| First | Assign to, Undo, inline cell editing, column filtering | **`v0-full`** (`bf2d16ae1aef0f2b4e3cb70eaf54dddeee5560f5`) | `archive/full-feature-set` |
| Second | Tag and Categorize, Replace a value | **`v1-bulk`** (`63ef4cd2f84bc13b245ad368a7d87ea5bc723cdc`) | `archive/bulk-operations` |
| Third | Export, and the bulk menu itself | **`v1-export`** (`bf9f483`) | `archive/export-and-bulk-menu` |

Nothing was thrown away. Prefer the **latest** tag that still holds the feature you are after: the
earlier ones hold it tangled with everything removed later, none of which is coming back with it.
`v0-full` is the only record of the four first-round features; it is the wrong place to read Export
or the bulk operations from.

The `feature/*` branches above supersede all three for actually restoring something — they are the
same code already reconciled with this line. The tags are for reading what a feature looked like
before anything moved.

## Reverting by hand

`git revert <sha>` still works, in reverse removal order — bottom of the table upwards. That is
exactly what the branches are, so there is rarely a reason to do it by hand.

Reverting any of these restores its comments as they stood, including sentences in
`ContentTypesSelection` and `useContentTypeColumns` that describe features removed in an earlier
round as though the module still offered them. Correct them on the way through rather than taking
them as a description of the tree.

## The refactors underneath

Each round was preceded by refactors that cut the features loose, so neither a revert nor the code
it lands in carries the tangle they undid:

| Commit | What it separated |
|---|---|
| `309bb01` | `ContentTypesFilters` was three things in one file. Split into `ContentTypesFieldTypes` (what kind of value a column holds — the columns, the bulk editor and the CSV writer all need it), `ContentTypesSearch` (the typed term), and the filtering proper. |
| `7e3b3ec` | The mutation-kind → document map moved from `useCellEdit` to `ContentTypes.gql`, so deleting the cell editor could not break bulk editing. |
| `e010e99` | The read every write does before replacing a value, written out at three call sites, became `captureUndo`. |
| `4fd2702` | The create-target dialog was using the replace-a-value form's Cancel label and its control width. Both became its own, so removing that form could not take a working dialog with it — in one case silently, a missing translation key rendering as the key. |

---

## Assign to — `01082314eec5cbbedad567df9320889a6012785a`

**Branch:** `feature/assign-to` — the top of the stack. Carries every other feature in this file.

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

**Branch:** `feature/undo` — also carries inline cell editing, column filtering, Tag and
Categorize, Replace a value, Export and the bulk menu.

One level of undo behind every bulk operation: the values read before each write, the publication
stamps captured with them, the restore, and the bar offering to take it back.

**What went:** `ContentTypesUndo` (+ spec), `ContentTypesUndoAction`, `useBulkUndo`, the
`CAPTURE_TIMESTAMPS` document, and the recording at each write.

**Where to look on a revert:** nothing of undo is left in the tree. One piece used to be —
adding tags or categories had to read what each record held to compute the union, so that read
lived on as `captureHeldValues` in `ContentTypesBulkFields` — but adding to a tag list went with
Tag and Categorize below, and the read went with it. A revert of undo now restores the only copy
rather than a second one. **If Tag and Categorize is reverted as well, the two copies come back
and have to be reconciled**; which order they are restored in does not change that.

**Worth reworking first:** it is one level and one snapshot, by design, and it notices nothing
another editor does to the same records in between. That is honest for a step taken straight away
and thin as a promise. Decide whether 1.x wants the same bargain before putting it back.

## Inline cell editing — `5a4e1b0922a0468904e6f21c231e6e4647d51917`

**Branch:** `feature/inline-cell-editing` — also carries column filtering, Tag and Categorize,
Replace a value, Export and the bulk menu.

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

**Branch:** `feature/column-filtering` — also carries Tag and Categorize, Replace a value, Export
and the bulk menu.

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

## Tag and Categorize — `1f22b1f509adde0e0b3ae0cf3ce7328960e73546`

**Branch:** `feature/tag-categorize` — also carries Replace a value, Export and the bulk menu.

Setting a tag list or a category list across the ticked rows, with a choice between replacing what
each record holds and adding to it.

**What went:** `ContentTypesBulkFields` (+ spec), `ContentTypesBulkFieldDialog`, the `SET_BULK_FIELD`
mutation, the two `CAPTURE_` queries, the `.bulkFieldMode` style and the `label.bulkField.*` keys in
both locales.

**What stayed, and is not part of this:** the tags and categories **columns**. They are read by the
record query for display and have nothing to do with writing. So are the `jmix:tagged` and
`jmix:categorized` mixins — this module never declared them, they are Jahia's own.

**Where to look on a revert:** the dialog fetched its pickers off the `@jahia/ui-extender` registry
by Content Editor's selector-type keys, `Tag` and `Category`. Those are registry keys, not an API,
and nothing fails at build time if they move — the dialog degrades to saying the picker is
unavailable. Check them against the Content Editor actually deployed before concluding the revert
worked.

**Worth reworking first:** adding to a list rather than replacing it is computed in the browser —
read every record's current values, union them with what was chosen, write the result back. That is
a read and a write per operation and it races any other editor touching the same records in
between. `addValues` would say it in one call, and the reason it was not used is narrow: on a
property the mixin has defined but never created, it fails outright. Worth re-testing against the
current platform rather than inheriting the workaround.

## Replace a value — `68f0bcb1ff77beda21c5b0612df1f6e60edd8684`

**Branch:** `feature/replace-a-value` — also carries Export and the bulk menu.

Setting one of a content type's own properties across the ticked rows, with a column chooser, five
shapes of control, a clear-instead option and a count of what was about to be overwritten.

**What went:** `ContentTypesBulkEdit` (+ spec), `ContentTypesBulkEditDialog`, the six
`SET_`/`CLEAR_PROPERTY` mutations, the `MUTATIONS` map `7e3b3ec` had moved into `ContentTypes.gql`
for exactly this, and the `label.bulkEdit.*` keys in both locales.

**Where to look on a revert:** it emptied this module's bulk menu down to `export`. A clean revert
puts the entry back by itself; a conflicted one is where to look, because the wiring is three
separate one-line edits — `editValue` in `ENTRIES` *and* in `HANDLERS` in
`registerContentTypesBulkActions`, and `openBulkEdit` in the bar's `bulkContext`. Miss the second or
the third and the result is a menu entry that does nothing, which nothing fails on.

**Still in the tree unread:** `mandatory` on the dynamic columns in `useContentTypeColumns`, and in
`GET_CONTENT_TYPE_FIELDS` beside it. It was what told the form a property could not be cleared. It
is deliberately still fetched, and the comment beside it says so. `internationalized`, which sits on
the same two lines and reads like it belongs to the same feature, **does not** — the untranslated
column counts per-language properties with it. Do not treat them as a pair.

**Worth reworking first:** the count of records already holding a value is honest only for a column
that is on screen, because it is computed from rows the table has already fetched; for a hidden
column the dialog said it did not know. That is correct and it is the wrong place to leave the
reader, since the hidden-column case is exactly when someone is least sure what they are about to
overwrite. One query would answer it properly.

## Export — `794e29e3caba3a46c01bfc50011c2054541b08b5`

**Branch:** `feature/export` — and `feature/bulk-menu` beneath it.

Writing the ticked rows to a file: CSV or JSON, with a column picker so an export could carry
columns the table was not showing.

**What went:** `ContentTypesExport` (+ spec), `ContentTypesExportDialog`, `ContentTypesCsv`
(+ spec), `ContentTypesJson` (+ spec), the `label.export.*` keys in both locales, and five styles
whose last reader was the dialog.

**What stayed, and is not this:** jContent's own `export` action, which is in the
`selectedContentActions` target the selection bar renders. For a single ticked row that button is
already there, with its own workspace and zip/xml choices. This was never that.

**Still in the tree unread:** `nameField` in `useContentTypeColumns` — the Name column as a field
in its own right, published so that whatever needed to name every column a record carries could
reach it. The dialog was the only thing that did. `footerNoteKey` and `resetLabelKey` on
`ContentTypesColumnsPicker` are in the same position: both still have their defaults, the toolbar
takes them, and nothing overrides them now that the dialog is gone.

**Where to look on a revert:** `fieldsByKey` in `ContentTypesRoute` was built from `nameField` for
this dialog alone and went with it. A revert restores it; if it is ever rebuilt by hand instead,
that index is the piece that is easy to miss, because the dialog degrades to offering only the
visible columns rather than failing.

**Worth reworking first:** everything was built in the browser from rows already fetched, which is
what made the export honest — it exported the table *as displayed*. It also means an export is
limited to the page being looked at. Exporting a whole type means deciding whether that is a
different feature or the same one with a server behind it.

## The bulk menu — `1088f3e20fc31a65d84e641e30c569496cb3b466`

**Branch:** `feature/bulk-menu` — the bottom of the stack; everything else needs it.

The menu in the selection bar that this module's own operations were gathered behind, and the
`contentTypesBulkActions` registry target they were registered into.

**What went:** `registerContentTypesBulkActions` entirely, its call in `ContentTypes.register`, the
trigger in the selection bar, the `bulkContext` the bar built for it, and the `label.bulk.*` keys.

**This retired a published extension point.** The target was documented for other modules to
register their own bulk operations into. A module that did will find its action registered and
never rendered, with nothing failing to say so. Nothing in this repository does, and the target was
only ever reachable from a deployment of this module — but it is the one removal here that could be
felt from outside it. If this module has already shipped anywhere, that is worth checking before
assuming the removal is invisible.

**What stayed:** the selection bar, and all of jContent's own actions in it. Ticking rows still
does everything it did except open this module's menu.

**Where to look on a revert:** the menu is built on jContent's composed `menuAction`, fetched off
the registry by key because neither it nor its renderers are exported. It is guarded — a missing
`menuAction` logs and returns rather than throwing, because a throw there takes the whole module's
registration down, accordion included. Keep that guard.
