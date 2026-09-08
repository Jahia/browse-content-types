/**
 * When a selection becomes a bulk selection.
 *
 * Free of React, like the other logic modules here, and its own file because two components ask the
 * question and must not answer it differently: the toolbar decides whether to hand its line over to
 * the selection bar, and the table decides whether a row still has its own three-dot menu and which
 * of three right-click menus it opens. Those disagreeing would put the bar over a row that still
 * offers its own actions, or take the actions away while the toolbar still showed the search.
 */

/**
 * How many ticked rows it takes to be acting on a selection rather than on a record.
 *
 * **Two, which is a deliberate departure from jContent.** Its own list view switches at one:
 * `CellVisibleActions` draws the row menu only while `selection.length === 0`, and the categories
 * header swaps its toolbar at `> 0`. Copying that meant ticking a single checkbox replaced the
 * toolbar and took away the row's three dots, which reads as the screen changing mode in answer to
 * picking one thing out.
 *
 * So one ticked row is still one row: the toolbar keeps the search, the filters and the create
 * button, and the row keeps its menu. The bar appears when there is genuinely a set to act on.
 *
 * The cost, which is real: the actions this module contributes - tag, categorize, export, assign -
 * live only in that bar, so they are not reachable for a single record this way. Editing a value is
 * no loss, being what the cell editor does; the other four are, and putting them in the row menu is
 * the follow-up that closes it.
 */
export const BULK_SELECTION_FROM = 2;

/** Whether what is ticked should be treated as a set rather than as a record. */
export const isBulkSelection = selection => (selection?.length || 0) >= BULK_SELECTION_FROM;
