import {useSyncExternalStore} from 'react';

/**
 * The one operation that can still be taken back.
 *
 * A module-level value rather than React state, because of who needs to reach it: the dialogs that
 * record a snapshot are three levels below the pane that draws the undo bar - route, toolbar,
 * selection bar, dialog - and threading a setter down that chain would put a prop on four components
 * that have nothing else to do with undo. A store the two ends subscribe to keeps it to the two
 * places that care.
 *
 * One snapshot, never a stack. Recording a second replaces the first, which is the whole model: the
 * step back is written from what was read just before the step, and a second step invalidates the
 * first snapshot's assumptions about what is on disk.
 */
let snapshot = null;
const listeners = new Set();

const emit = () => listeners.forEach(listener => listener());

const subscribe = listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const read = () => snapshot;

/** Records what an operation just replaced, superseding anything recorded before it. */
export const recordUndo = next => {
    snapshot = next;
    emit();
};

/**
 * Forgets it - after the undo has run, when the reader dismisses the bar, and whenever the pane
 * moves to another content type, where an offer to undo something on records no longer listed would
 * be an offer nobody could check before accepting.
 */
export const clearUndo = () => {
    if (snapshot !== null) {
        snapshot = null;
        emit();
    }
};

/**
 * The snapshot, for whoever draws the bar.
 *
 * `useSyncExternalStore` rather than an effect and a piece of state: it is what React provides for
 * exactly this, and it keeps the value consistent through a concurrent render instead of tearing
 * between two subscribers reading at different moments.
 */
export const useBulkUndo = () => useSyncExternalStore(subscribe, read, read);

export default useBulkUndo;
