/**
 * The same rows as JSON.
 *
 * Where the CSV writes **what the table shows**, this writes **what the repository stores**, with
 * the types intact: a number is a number, a boolean is a boolean, a multi-valued property is an
 * array, and nothing at all is `null` rather than an empty string. That is the whole reason to
 * choose JSON over CSV, and it is the one place the two exports deliberately disagree.
 *
 * The clearest case is a constrained property. The CSV writes "Swimming pool", because a person is
 * reading it; this writes `swimmingPool`, because something else is. The label belongs to the
 * defining module's resource bundle and changes with the reader's language - the code does not, and
 * is what anything consuming the file can match on.
 */

/** Numeric property types, whose values arrive from GraphQL as strings like any other. */
const NUMERIC_TYPES = new Set(['LONG', 'DOUBLE', 'DECIMAL']);

/**
 * One stored value, as the type it really is.
 *
 * A number that will not parse is left as the string it arrived as rather than becoming `NaN`, which
 * JSON cannot represent and `JSON.stringify` silently turns into `null` - losing the value and any
 * chance of noticing it was there.
 */
const typedValue = (requiredType, value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (requiredType === 'BOOLEAN') {
        return value === 'true';
    }

    if (NUMERIC_TYPES.has(requiredType)) {
        const number = Number(value);
        return Number.isNaN(number) ? value : number;
    }

    return value;
};

/**
 * How each field common to every node reads, keyed by the same field.key everything else uses.
 *
 * Dates are the ISO timestamps the repository stores, which is what they already are - the CSV makes
 * the same choice, for the same reason.
 *
 * Publication status is the code rather than the label the chip shows: `PUBLISHED` is the value, and
 * "Published" is one language's rendering of it.
 *
 * Lists are arrays, which is the point. A tag containing a comma is a problem the CSV can only
 * quote its way around and that this does not have at all.
 */
const COMMON_VALUES = {
    type: node => node.primaryNodeType?.name || null,
    createdBy: node => node.createdBy?.value || null,
    createdDate: node => node.createdDate?.value || null,
    lastModified: node => node.lastModified?.value || null,
    lastModifiedBy: node => node.lastModifiedBy?.value || null,
    publicationStatus: node => node.aggregatedPublicationInfo?.publicationStatus || null,
    publishedOn: node => node.publishedOn?.value || null,
    publishedBy: node => node.publishedBy?.value || null,
    tags: node => [...new Set(node.tags?.values || [])],
    categories: node => (node.categories?.refNodes || []).map(category => category.displayName),
    // Who holds a lock, as a list. Whether it blocks this reader is shown in the table by colour,
    // which no file can carry.
    lock: node => [...new Set((node.lockInfo?.details || []).map(detail => detail.owner).filter(Boolean))],
    path: node => node.path || null,
    systemName: node => node.name || null,
    id: node => node.uuid || null
};

/**
 * A content type's own property, typed.
 *
 * A reference reads as the display name of the node it points at, the same as in the CSV: the uuid
 * it stores is in the record's own `id` field if an identifier is what is wanted, and a reference to
 * a name nobody can read would make the export harder to use, not more faithful.
 *
 * A multi-valued property is always an array, even holding one value, and an empty one is `[]`
 * rather than `null` - the property exists and is empty, which is not the same as absent, and a
 * consumer iterating the field should not have to check which it got.
 */
const dynamicValue = (field, payload) => {
    if (!payload) {
        return field.multiple ? [] : null;
    }

    if (field.multiple) {
        if (payload.refNodes?.length > 0) {
            return payload.refNodes.map(node => node.displayName ?? null);
        }

        return (payload.values || []).map(value => typedValue(field.requiredType, value));
    }

    if (payload.refNode) {
        return payload.refNode.displayName || null;
    }

    return typedValue(field.requiredType, payload.value);
};

/** One field of one row, as the value it really holds. */
export const jsonValue = (field, node) => {
    if (field.isDynamic) {
        return dynamicValue(field, node[field.key]);
    }

    const read = COMMON_VALUES[field.key];
    return read ? read(node) : null;
};

/**
 * The rows as JSON text.
 *
 * An array of objects keyed by the column **label**, matching the CSV's header row and the table's
 * own headings - the reader chose these columns by those names, and `ct_j_something` would name
 * nothing they have seen. `name` comes first, as it does in the table and in the CSV.
 *
 * Indented, because a file somebody chose to download is a file somebody may open and read. The size
 * cost is a compression artefact away and the readability is not.
 */
export const buildRecordsJson = ({nodes, fields, nameLabel}) => {
    const rows = (nodes || []).map(node => {
        const row = {[nameLabel]: node.displayName || node.name || null};
        (fields || []).forEach(field => {
            row[field.label] = jsonValue(field, node);
        });
        return row;
    });

    return `${JSON.stringify(rows, null, 2)}\n`;
};
