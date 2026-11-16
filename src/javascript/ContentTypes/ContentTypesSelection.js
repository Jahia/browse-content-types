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
 * **One, as in jContent.** Its own list view switches at one: `CellVisibleActions` draws the row
 * menu only while `selection.length === 0`, and its header swaps its toolbar at `> 0`. Ticking a
 * single checkbox here does the same, so the selection bar - and the Bulk menu in it - is reachable
 * for a single record too.
 */
export const BULK_SELECTION_FROM = 1;

/** Whether what is ticked should be treated as a set rather than as a record. */
export const isBulkSelection = selection => (selection?.length || 0) >= BULK_SELECTION_FROM;

/**
 * How many ticked rows it takes for a row to give up its own menus.
 *
 * **Two.** One ticked row is still one record: it keeps its three-dot menu, and a right-click on it
 * opens its own actions, while the toolbar already offers the selection bar and its Bulk menu. From
 * two rows on, what applies is an action on the selection, so the row menus give way to it.
 */
export const ROW_ACTIONS_HIDDEN_FROM = 2;

/** Whether the rows hide their own menus because a set of rows is ticked. */
export const hidesRowActions = selection => (selection?.length || 0) >= ROW_ACTIONS_HIDDEN_FROM;
