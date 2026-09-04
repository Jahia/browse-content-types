import {missingTranslations} from './ContentTypesTranslations';
import {PUBLICATION_STATUSES, labelForValue} from './ContentTypesFilters';

/**
 * Turning the rows on screen into a CSV file.
 *
 * Free of React, of the registry and of the DOM, the way ContentTypesFilters is and for the same
 * reason: what is worth getting right here is the projection from a row to a line of text, and that
 * is a pure function of data the table has already fetched. The download itself - a Blob, an object
 * URL and an anchor - is the caller's business, and lives in registerContentTypesBulkActions.
 *
 * The export needs no request of its own. Every value it writes is already in the rows the table
 * holds, which is why the whole operation is synchronous and why it exports exactly what is on
 * screen rather than a fresh read that might disagree with it.
 */

/**
 * What separates two cells.
 *
 * A comma, which is what the C in CSV means and what every parser reads without being told. Excel
 * in a French or German locale expects a semicolon instead and will put a comma-separated line in
 * one cell - the fix on that side is Data > From Text, or the `sep=;` preamble, which is Excel's own
 * invention and breaks every other reader. Standard wins; the BOM below already handles the part of
 * the Excel problem that has no workaround.
 */
const SEPARATOR = ',';

/**
 * CRLF, which RFC 4180 asks for and every spreadsheet accepts. A bare LF is read correctly by
 * nearly everything too, but "nearly" is doing real work in that sentence on Windows.
 */
const NEWLINE = '\r\n';

/**
 * Prepended to the file so Excel reads it as UTF-8.
 *
 * Without it Excel decodes a .csv in the machine's ANSI codepage and renders every accented
 * character as mojibake - "Propriété" as "PropriÃ©tÃ©". That is not a hypothetical here: the sites
 * this browses are largely French, and it is the single most common way a correct CSV looks broken
 * to the person who opened it.
 */
export const UTF8_BOM = '\uFEFF';

/**
 * One value as a CSV cell, quoted only where it has to be.
 *
 * RFC 4180: a field containing the separator, a quote or a line break is wrapped in quotes, and a
 * quote inside it is doubled. Quoting everything unconditionally would also be valid and is what
 * many exporters do, but it makes the file harder to read in anything that is not a spreadsheet,
 * and a diff of two exports noisier than the change between them.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with a quote character. Excel and Sheets treat such a
 * cell as a formula, so a value that came out of the repository could be executed on opening - the
 * CSV injection problem. This is content someone typed into a form, so it is exactly the case where
 * that matters. The quote is the prefix both applications strip on display and neither evaluates.
 */
const escapeCell = value => {
    const text = String(value ?? '');
    const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

/** Rows of cells to the text of a CSV file, header included by the caller as the first row. */
export const toCsv = rows => rows
    .map(cells => cells.map(escapeCell).join(SEPARATOR))
    .join(NEWLINE);

/**
 * A list of values as one cell.
 *
 * Joined with a comma and a space, the way the table joins a multi-valued field - and the reason the
 * cell is then quoted, which is what keeps a list of three values one cell rather than three.
 *
 * Deduplicated for the same reason the chips are: a set of labels should be a set, and the table
 * already shows it as one.
 */
const joinValues = values => [...new Set((values || []).filter(value => value !== null && value !== undefined && value !== ''))].join(', ');

/**
 * How each field common to every node reads as text, keyed by the same field.key the table's
 * COMMON_RENDERERS use - the two must agree about what a column means, and the keys are what says
 * they do.
 *
 * Three deliberate departures from what the cell shows:
 *
 * - **Nothing is empty, not a dash.** The table writes "-" so a reader's eye has something to land
 *   on in an empty cell. A spreadsheet has its own way of showing an empty cell, and a literal dash
 *   there is a value: it sorts, it breaks a sum, and a filter on "is empty" does not find it.
 * - **A date is the ISO 8601 timestamp the repository stores**, not the localised form on screen.
 *   "3 sept. 2026" is unsortable, ambiguous across locales, and not a date to any spreadsheet that
 *   did not guess the right one; the stored value is already ISO, so this is also the least the
 *   export can do to it.
 * - **A status is its label, not its code.** PUBLISHED reads as "Published" - the same word the chip
 *   shows, since that is the thing the reader recognises, and the code is in no way more precise.
 */
const COMMON_VALUES = {
    type: node => node.primaryNodeType?.displayName || node.primaryNodeType?.name || '',
    createdBy: node => node.createdBy?.value || '',
    createdDate: node => node.createdDate?.value || '',
    lastModified: node => node.lastModified?.value || '',
    lastModifiedBy: node => node.lastModifiedBy?.value || '',
    publicationStatus: (node, {publicationLabel}) => publicationLabel(node.aggregatedPublicationInfo?.publicationStatus),
    // The same gaps the column shows, flattened to one cell: "fr: Title, Subtitle; de: Body".
    // Property LABELS, like everything else in a CSV - the JSON export writes the stored names
    // instead, which is the documented difference between the two.
    missingTranslations: (node, {languages, translatableFields}) => missingTranslations(node, languages, translatableFields)
        .map(gap => `${gap.language}: ${gap.properties.join(', ')}`)
        .join('; '),
    publishedOn: node => node.publishedOn?.value || '',
    publishedBy: node => node.publishedBy?.value || '',
    tags: node => joinValues(node.tags?.values),
    categories: node => joinValues(node.categories?.refNodes?.map(category => category.displayName)),
    // Who holds a lock, which is the part of the cell that carries information. Whether the lock
    // blocks this reader is shown in the table by colour, and colour is the one thing a CSV cannot
    // carry; the lock types behind the tooltip are a detail of the lock rather than of the record.
    lock: node => joinValues((node.lockInfo?.details || []).map(detail => detail.owner)),
    path: node => node.path || '',
    systemName: node => node.name || '',
    id: node => node.uuid || ''
};

/**
 * A content type's own property as text.
 *
 * The shapes are the ones ContentTypesRecordQuery asks for: `values`/`refNodes` on a multiple
 * property, `value`/`refNode` on a single one, and a reference resolved to the node it points at.
 * A reference reads as the display name of its target, which is the only part of it anybody can
 * recognise - the uuid it actually stores would be an export nobody could join anything to by hand,
 * and the Path and ID columns exist for the case where an identifier is what is wanted.
 *
 * A constrained value goes through `labelForValue` so the CSV says "Swimming pool" where the
 * repository stores `swimmingPool`, matching the cell. Where a property carries no value list the
 * lookup returns the value unchanged, which is the same thing the table does with it.
 */
const dynamicValue = (field, payload, {booleanLabel}) => {
    if (!payload) {
        return '';
    }

    const asText = value => {
        if (field.requiredType === 'BOOLEAN') {
            return booleanLabel(value === 'true');
        }

        return labelForValue(field, value);
    };

    if (field.multiple) {
        if (payload.refNodes?.length > 0) {
            return joinValues(payload.refNodes.map(node => node.displayName));
        }

        return joinValues((payload.values || []).map(asText));
    }

    if (payload.refNode) {
        return payload.refNode.displayName || '';
    }

    if (payload.value === null || payload.value === undefined) {
        return '';
    }

    return asText(payload.value);
};

/**
 * The four statuses that carry a name of their own, as a lookup.
 *
 * Built from the same list the publication filter offers, so the CSV, the chip and the filter cannot
 * come to disagree about what PUBLISHED is called.
 */
const PUBLICATION_LABEL_KEYS = Object.fromEntries(
    PUBLICATION_STATUSES.map(status => [status.value, status.labelKey])
);

/**
 * The words this module puts in a cell where the value alone would not read as anything.
 *
 * Gathered into one object taken as an argument rather than reaching for i18next inside the
 * projection, which is what keeps every function above testable without a translation runtime - the
 * spec passes a `t` that returns its own key.
 *
 * A status outside the four named ones keeps its own text, lowercased and with the underscores taken
 * out, exactly as the table's neutral chip shows it: a conflict or a mandatory-language state is
 * rare, but reporting it as one of the four would say something untrue about the record.
 */
export const csvContextFor = t => ({
    publicationLabel: status => {
        if (!status) {
            return '';
        }

        const key = PUBLICATION_LABEL_KEYS[status];
        return key ? t(key) : status.toLowerCase().replace(/_/g, ' ');
    },
    booleanLabel: isTrue => t(isTrue ? 'label.boolean.true' : 'label.boolean.false')
});

/** One field of one row as the text of a cell. */
export const csvValue = (field, node, context) => {
    if (field.isDynamic) {
        return dynamicValue(field, node[field.key], context);
    }

    const read = COMMON_VALUES[field.key];
    return read ? read(node, context) : '';
};

/**
 * The rows on screen as the text of a CSV file.
 *
 * The Name column is written first and is not among the fields, exactly as the table draws it: it is
 * always shown and is not in the picker, so it is not in `visibleFields` either. Everything after it
 * is in the order the reader arranged the columns in, so the file matches the table it came from
 * rather than some canonical order of this module's own.
 *
 * `nodes` are the rows ticked, in the shape the table fetched them - which is why nothing here has
 * to be looked up and why an export costs no request.
 */
export const buildRecordsCsv = ({nodes, fields, nameLabel, context}) => {
    const header = [nameLabel, ...fields.map(field => field.label)];
    const lines = nodes.map(node => [
        node.displayName || node.name || '',
        ...fields.map(field => csvValue(field, node, context))
    ]);

    return UTF8_BOM + toCsv([header, ...lines]) + NEWLINE;
};
