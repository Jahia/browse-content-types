import {bulkEditVariables, editorKind, isEditable} from './ContentTypesBulkEdit';

/**
 * Editing one cell in place.
 *
 * Free of React and of Apollo, like the other logic modules here. Almost nothing about *writing* is
 * new: which columns may be written, what control collects a value, what the mutation is given and
 * which mutation that is are all decided by ContentTypesBulkEdit already, and a single cell is that
 * same path with one path in the array. What this module adds is only what a cell needs and a
 * selection did not - whether THIS record may be written, what it currently holds, and whether the
 * value fits in a cell at all.
 */

/** The cell becomes the control. */
export const CELL_EDIT_INLINE = 'inline';

/** The control opens over the table, because it could not fit in a cell. */
export const CELL_EDIT_DIALOG = 'dialog';

/** Why a cell cannot be edited, for the affordance to say so rather than simply not appear. */
export const CELL_NOT_EDITABLE = 'notEditable';
export const CELL_LOCKED = 'locked';
export const CELL_NO_PERMISSION = 'noPermission';

/**
 * Past this many characters, a value is edited in a dialog rather than in the cell.
 *
 * Decided on the value rather than on the definition, because the definition does not say. A rich
 * text body and a one-line title are both a single-valued STRING; what separates them is what they
 * hold, and that is in hand. Content Editor knows better - it is given a selector type - but this
 * module reads a table's columns, not a form, and inventing a guess from the property name would be
 * worse than measuring the thing itself.
 *
 * The consequence to be aware of: a field is edited inline while it is short and in a dialog once it
 * is long, so the same column can offer either. That reads as the control following the content,
 * which is the honest description of what it is doing.
 */
const LONG_TEXT_FROM = 120;

/** Whether a value wants more room than a table cell has. */
export const isLongText = value => typeof value === 'string' &&
    (value.length > LONG_TEXT_FROM || value.includes('\n'));

/**
 * Where the control for this cell should appear, or nothing where the column cannot be written.
 *
 * A multi-valued property always goes to the dialog: its control is a list typed one per line, which
 * is not something a row's height can hold. Everything else fits a cell until its own value says
 * otherwise.
 */
export const editSurface = (field, currentValue) => {
    if (!isEditable(field)) {
        return null;
    }

    if (field.multiple) {
        return CELL_EDIT_DIALOG;
    }

    return editorKind(field) === 'text' && isLongText(currentValue) ? CELL_EDIT_DIALOG : CELL_EDIT_INLINE;
};

/**
 * Whether this cell of this record may be edited, and where the answer comes from when it may not.
 *
 * Three separate questions, and they are asked in the order a reader would want them answered. The
 * column being writable at all is a property of the definition and the same on every row. The other
 * two are properties of the record: a lock held by somebody else, and the write permission the
 * record query asks for on each node.
 *
 * `canEdit` is read from the record rather than assumed, because a table is exactly where the
 * assumption breaks: a reader can list content across a site and hold permission on some of it.
 * Offering an editor that the server will refuse would report the refusal only after the value had
 * been typed.
 */
export const cellEditability = (field, row) => {
    if (!isEditable(field)) {
        return {canEdit: false, reason: CELL_NOT_EDITABLE};
    }

    if (row?.lockedAndCannotBeEdited) {
        return {canEdit: false, reason: CELL_LOCKED};
    }

    // Absent rather than false on a record the query did not ask it of - a row from a cached page
    // fetched before this column existed. Treated as refused: the honest answer to "may I write
    // this" when nobody has asked is not yes.
    if (!row?.canEdit) {
        return {canEdit: false, reason: CELL_NO_PERMISSION};
    }

    return {canEdit: true, reason: null};
};

/**
 * The JCR date this control can be given.
 *
 * A date property comes back as a full moment - `2026-09-08T15:21:23.198+02:00` - and a date input
 * holds a day. The day is taken off the front of the stored text rather than parsed through a Date,
 * which would shift it across a timezone boundary and show the day before for anything stored near
 * midnight.
 *
 * Any other shape answers empty rather than something a control would misread.
 */
export const toDateInputValue = value => {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ''));
    return match ? match[1] : '';
};

/**
 * What the cell holds now, in the shape the control that edits it expects.
 *
 * The record carries a payload per column, aliased to the column's key - see
 * ContentTypesRecordQuery - holding `values` for a multi-valued property and `value` for the rest.
 * This is the one place that turns that into what a form collects, so a control never reads the
 * record directly and the two cannot come to disagree about what an empty cell is.
 *
 * `valueKey` is for the column that draws one thing and edits another: the Name column shows the
 * name as resolved, which falls back to the node's own name when the primary item is empty, and
 * editing has to start from what the property actually holds rather than from that fallback.
 *
 * A boolean answers `'false'` rather than empty when nothing is stored: it holds one of two things,
 * which is the same reason `initialValue` starts a boolean there.
 */
export const currentCellValue = (field, row) => {
    const payload = row?.[field?.valueKey || field?.key];

    if (field?.multiple) {
        return payload?.values || [];
    }

    const value = payload?.value;
    const kind = editorKind(field);

    if (kind === 'boolean') {
        return value === 'true' ? 'true' : 'false';
    }

    if (kind === 'date') {
        return toDateInputValue(value);
    }

    return value ?? '';
};

/**
 * Whether what was collected differs from what is stored.
 *
 * Saving an unchanged value is not harmless: the mutation succeeds, and `jcr:lastModified` and the
 * publication status move with it, so a record would be reported as edited because somebody looked
 * at a cell and pressed Enter. Compared as text, and as a list where the property holds one, since
 * that is the shape both sides are in by the time they get here.
 */
export const hasCellValueChanged = (before, after) => {
    if (Array.isArray(before) || Array.isArray(after)) {
        const first = before || [];
        const second = after || [];
        return first.length !== second.length || first.some((entry, index) => entry !== second[index]);
    }

    return String(before ?? '') !== String(after ?? '');
};

/**
 * What the mutation is given for one record.
 *
 * Delegated whole to the bulk path, which already decides every part of it - the language an
 * internationalized property needs, the JCR type that keeps a number a number, values against value.
 * A cell is one record, so it arrives as a list of one. Kept as a named function rather than
 * inlined at the call site so that a reader looking for what a cell edit sends finds it here beside
 * everything else about a cell edit.
 */
export const cellEditVariables = ({field, row, value, isClearing, language}) => bulkEditVariables({
    field,
    nodes: [row],
    value,
    isClearing,
    language
});
