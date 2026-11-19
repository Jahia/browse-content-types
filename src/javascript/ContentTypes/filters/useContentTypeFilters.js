import {useCallback, useMemo} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {registry} from '@jahia/ui-extender';
import {NAMESPACE} from '../../ContentTypes.register';
import {buildFilterFields, formFieldsOf} from './filterFields';
import {filtersToNodeConstraint} from './filterConstraint';
import {readFilters, withFilters} from './filterParams';

/** The key of the Name column as a filter field. */
export const NAME_FIELD_KEY = 'std:displayName';

/** The chips that the filter bar shows with no value: none, every filter comes from Add filter. */
export const DEFAULT_FILTER_FIELDS = [];

/**
 * The Name column as a filter field. It constrains the primary item of the type, or the node name with loose separators
 * when the type has no primary item: the column shows `highlight-numbers` as "Highlight Numbers".
 */
export const nameFilterField = nameField => ({
    key: NAME_FIELD_KEY,
    label: nameField.label,
    kind: 'text',
    property: nameField.jcrProperty,
    ...(nameField.looseSeparators && {looseSeparators: true})
});

/**
 * The fields grouped as in the column picker: the Name column and the properties of the type, then the standard fields
 * that every item has. Each field holds the title of its group, for the Add filter menu.
 */
export const groupFields = (fields, typeLabel, commonLabel) => [
    ...fields.filter(field => !field.key.startsWith('std:') || field.key === NAME_FIELD_KEY).map(field => ({...field, group: typeLabel})),
    ...fields.filter(field => field.key.startsWith('std:') && field.key !== NAME_FIELD_KEY).map(field => ({...field, group: commonLabel}))
];

/**
 * The Name column first, then the fields. The Name column replaces the field of the property it shows:
 * `jcr:title`, or the system name for a type with no primary item.
 */
export const withNameField = (fields, nameField) => {
    if (!nameField?.jcrProperty) {
        return fields;
    }

    const name = nameFilterField(nameField);
    return [name, ...fields.filter(field => field.property !== name.property)];
};

const NO_FILTERS = [];

/**
 * The filters of the list of a content type, kept in the jContent URL in `params.filters`, as jContent keeps its own.
 * The fields are the Name column, the standard fields and the properties of the type.
 * A change is a new history entry, so the back button removes the last change.
 *
 * @param {object} columns what useContentTypeColumns returns: the definitions, the form and the Name column of the type
 * @returns {{fields: Array, filters: Array, setFilters: Function, toNodeConstraint: Function}}
 */
export const useContentTypeFilters = ({definitions, form, nameField}) => {
    const {t} = useTranslation(NAMESPACE);
    const dispatch = useDispatch();
    const params = useSelector(state => state.jcontent?.params);

    const fields = useMemo(
        () => groupFields(
            withNameField(buildFilterFields({t, definitions: definitions || [], formFields: formFieldsOf(form)}), nameField),
            t('label.columns.availableType'),
            t('label.columns.availableCommon')
        ),
        [t, definitions, form, nameField]
    );

    const filters = useMemo(() => {
        const read = readFilters(params);
        return read.length > 0 ? read : NO_FILTERS;
    }, [params]);

    const setFilters = useCallback(next => {
        const goto = registry.get('redux-action', 'jcontentGoto');
        if (goto) {
            dispatch(goto.action({params: withFilters(params, next)}));
        }
    }, [dispatch, params]);

    // A filter on a field that is not in the list is ignored: the property name always comes from the field list
    const toNodeConstraint = useCallback(
        searchConstraint => filtersToNodeConstraint(filters, fields, searchConstraint),
        [filters, fields]
    );

    return {fields, filters, setFilters, toNodeConstraint};
};
