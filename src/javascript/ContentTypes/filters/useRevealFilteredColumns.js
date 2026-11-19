import {useEffect, useRef} from 'react';
import {columnKeyFor} from '../ContentTypesColumnCatalog';
import {isActiveFilter} from './filterConstraint';

// The column of each standard filter field. The Name column is always shown, so it has none here
const STANDARD_COLUMNS = {
    'std:created': 'createdDate',
    'std:createdBy': 'createdBy',
    'std:lastModified': 'lastModified',
    'std:lastModifiedBy': 'lastModifiedBy',
    'std:lastPublished': 'publishedOn',
    'std:lastPublishedBy': 'publishedBy',
    'std:tags': 'tags',
    'std:systemName': 'systemName'
};

/** The column key of a filter field, or null when the field has no column of its own. */
export const columnKeyOfField = field => {
    if (!field) {
        return null;
    }

    if (field.key.startsWith('prop:')) {
        return columnKeyFor(field.property);
    }

    return STANDARD_COLUMNS[field.key] || null;
};

/** The keys of the fields whose filters apply. */
export const activeFieldKeys = (filters, fields) => filters
    .filter(filter => isActiveFilter(filter, fields))
    .map(filter => filter.field);

/**
 * Shows the column of a field when a filter on it starts to apply, right after the Name column, so the table shows
 * the values the filter acts on. A filter that applies when the list opens, from a link, counts as a new one.
 * Only a new filter shows a column: the reader can still hide it while the filter applies.
 *
 * @param {Array} filters the filters of the list
 * @param {Array} fields the filter fields of the type
 * @param {object} columns what useContentTypeColumns returns
 */
export const useRevealFilteredColumns = (filters, fields, columns) => {
    const handled = useRef(new Set());
    const {loading, showFieldsFirst} = columns;

    useEffect(() => {
        // The columns of the type are known once the definition is read: a filter seen before that is handled after it
        if (loading) {
            return;
        }

        const active = activeFieldKeys(filters, fields);
        const added = active.filter(key => !handled.current.has(key));
        handled.current = new Set(active);
        if (added.length === 0) {
            return;
        }

        const columnKeys = added
            .map(key => columnKeyOfField(fields.find(field => field.key === key)))
            .filter(Boolean);
        if (columnKeys.length > 0) {
            showFieldsFirst(columnKeys);
        }
        // `showFieldsFirst` is a new function on each render: the effect follows the filters, not it
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, fields, loading]);
};
