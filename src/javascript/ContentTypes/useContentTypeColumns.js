import {useEffect, useMemo, useState} from 'react';
import {useQuery} from '@apollo/client';
import {useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {GET_CONTENT_TYPE_FIELDS} from './ContentTypes.gql';
import {NAMESPACE} from '../ContentTypes.register';

const STORAGE_PREFIX = 'content-types:columns:';

/**
 * Metadata and content status are not part of any single content type's own definition, but every
 * node in the repository carries them, so they are offered from a fixed catalog instead of a
 * query. `sortProperty` is the GraphQL field path the record query aliases the same property to -
 * see ContentTypesRecordQuery - which is why the two files must agree on these key names.
 */
export const COMMON_FIELDS = [
    {key: 'type', labelKey: 'label.field.type', sortProperty: 'primaryNodeType.displayName'},
    {key: 'createdBy', labelKey: 'label.field.createdBy', sortProperty: 'createdBy.value', isDefault: true},
    {key: 'createdDate', labelKey: 'label.field.createdDate', sortProperty: 'createdDate.value'},
    {key: 'lastModified', labelKey: 'label.field.lastModified', sortProperty: 'lastModified.value', isDefault: true},
    {key: 'lastModifiedBy', labelKey: 'label.field.lastModifiedBy', sortProperty: 'lastModifiedBy.value'},
    {key: 'publicationStatus', labelKey: 'label.field.publicationStatus', isDefault: true},
    {key: 'publishedOn', labelKey: 'label.field.publishedOn', sortProperty: 'publishedOn.value'},
    {key: 'publishedBy', labelKey: 'label.field.publishedBy', sortProperty: 'publishedBy.value'},
    {key: 'path', labelKey: 'label.field.path'},
    {key: 'systemName', labelKey: 'label.field.systemName'},
    {key: 'id', labelKey: 'label.field.id'}
];

const DEFAULT_VISIBLE_KEYS = COMMON_FIELDS.filter(field => field.isDefault).map(field => field.key);

/** A binary property (a large file's own bytes) has no reasonable display as a table cell. */
const isRenderable = definition => !definition.hidden && !definition.protected && definition.requiredType !== 'BINARY';

const readStoredKeys = storageKey => {
    try {
        const stored = window.localStorage.getItem(storageKey);
        return stored ? JSON.parse(stored) : DEFAULT_VISIBLE_KEYS;
    } catch {
        // A private window, a full quota, or corrupted JSON all land here. None of them should
        // stop the table from showing something - they just mean today's choice starts fresh.
        return DEFAULT_VISIBLE_KEYS;
    }
};

/**
 * Everything about the Name and Content Type columns picker for one content type: the catalog of
 * fields it could show, which of them are currently visible, and the one place that choice is
 * read from and saved to.
 *
 * The choice is stored in the browser, per site and per content type, rather than on the server:
 * unlike which content types the accordion lists at all, this is how one person prefers to look
 * at a table, not a decision that should change what a colleague sees.
 */
export const useContentTypeColumns = contentType => {
    const {t} = useTranslation(NAMESPACE);
    const site = useSelector(state => state.site);
    const uilang = useSelector(state => state.uilang);
    const storageKey = `${STORAGE_PREFIX}${site}:${contentType}`;

    const {data, loading} = useQuery(GET_CONTENT_TYPE_FIELDS, {
        variables: {type: contentType, language: uilang || 'en'},
        skip: !contentType
    });

    const contentTypeFields = useMemo(() => {
        const definitions = data?.jcr?.nodeTypeByName?.properties || [];
        return definitions
            .filter(definition => definition.declaringNodeType?.name === contentType && isRenderable(definition))
            .map(definition => ({
                key: `ct_${definition.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
                label: definition.displayName || definition.name,
                propertyName: definition.name,
                requiredType: definition.requiredType,
                multiple: definition.multiple,
                isDynamic: true
                // Not offered as sortable: a reference or a multi-valued property has no single
                // value to order by, and verifying that an arbitrary custom property's alias
                // sorts correctly server-side, the way the fixed common fields do, is outside
                // this feature's scope.
            }));
    }, [data, contentType]);

    const availableFields = useMemo(() => [
        ...COMMON_FIELDS.map(field => ({...field, label: t(field.labelKey)})),
        ...contentTypeFields
    ], [contentTypeFields, t]);

    const [visibleKeys, setVisibleKeys] = useState(() => readStoredKeys(storageKey));
    const [savedKeys, setSavedKeys] = useState(() => readStoredKeys(storageKey));

    // A different type means a different storage key and a different catalog: read that type's
    // own choice instead of carrying the previous type's selection over.
    useEffect(() => {
        const stored = readStoredKeys(storageKey);
        setVisibleKeys(stored);
        setSavedKeys(stored);
    }, [storageKey]);

    // A field can disappear from under a stored choice - the module was updated, a property was
    // removed from the definition. Drop it silently rather than ask the table to render a column
    // with no data behind it.
    useEffect(() => {
        if (loading) {
            return;
        }

        const known = new Set(availableFields.map(field => field.key));
        setVisibleKeys(previous => previous.filter(key => known.has(key)));
    }, [availableFields, loading]);

    // A newly shown field is added at the end, in the order it was checked - the same place a
    // freshly added table column would land. Moving it anywhere else is what the arrows are for.
    const toggleField = key => setVisibleKeys(previous => (
        previous.includes(key) ? previous.filter(existing => existing !== key) : [...previous, key]
    ));

    // Swaps a visible field with its neighbour. Silently does nothing at either end of the list -
    // there is no neighbour to swap with, and the locked Name column is not part of this array at
    // all, so the first entry here is already the first field after it.
    const moveField = (key, direction) => setVisibleKeys(previous => {
        const index = previous.indexOf(key);
        const target = index + direction;
        if (index === -1 || target < 0 || target >= previous.length) {
            return previous;
        }

        const next = [...previous];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
    });

    // Order matters now that it drives both the picker and the table, so two selections of the
    // same fields in a different order are still a change worth offering to save.
    const isDirty = useMemo(() => (
        visibleKeys.length !== savedKeys.length || visibleKeys.some((key, index) => key !== savedKeys[index])
    ), [visibleKeys, savedKeys]);

    const saveAsDefault = () => {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(visibleKeys));
            setSavedKeys(visibleKeys);
            return true;
        } catch {
            return false;
        }
    };

    // In visibleKeys' own order, not the catalog's: this is what the up/down arrows reorder, and
    // what the table's columns then follow, left to right.
    const visibleFields = useMemo(() => {
        const byKey = new Map(availableFields.map(field => [field.key, field]));
        return visibleKeys.map(key => byKey.get(key)).filter(Boolean);
    }, [availableFields, visibleKeys]);

    return {availableFields, visibleFields, visibleKeys, toggleField, moveField, isDirty, saveAsDefault, loading};
};

export default useContentTypeColumns;
