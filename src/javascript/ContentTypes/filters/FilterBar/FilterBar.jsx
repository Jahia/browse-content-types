import React, {useCallback, useMemo, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';
import {useTranslation} from 'react-i18next';
import {CollectionBar} from '../../../vendor/moonstone/CollectionBar';
import {NAMESPACE} from '../../../ContentTypes.register';
import {defaultOperator, filterToConstraint} from '../filterConstraint';
import {setFilterIn} from '../filterParams';
import {collectionBarLabels, filterValueLabel} from './filterLabels';
import {FilterSelector} from './FilterSelector';
import styles from './FilterBar.scss';

const sameFilter = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

const draftOf = (field, filter) => (filter ?
    {operator: filter.operator, ...(filter.value !== undefined && {value: filter.value})} :
    {operator: defaultOperator(field.kind)});

/**
 * The filters of the list, on Moonstone CollectionBar, in a row below the toolbar of the Header.
 * The bar is controlled: `filters` holds the active filters, and `onChange` gets the new list.
 * It holds a draft for each open selector. The Filter button and Enter apply the draft, and the other ways to close the selector discard it.
 */
export const FilterBar = ({fields, filters = [], onChange, defaultFields = [], isDisabled = false, className, ...props}) => {
    const {t} = useTranslation(NAMESPACE);
    const [drafts, setDrafts] = useState({});
    const draftsRef = useRef(drafts);
    draftsRef.current = drafts;

    const fieldKeys = useMemo(() => new Set(fields.map(field => field.key)), [fields]);
    // A filter from the URL is data: a change keeps the filters of the field list only
    const knownFilters = useMemo(() => filters.filter(filter => fieldKeys.has(filter.field)), [filters, fieldKeys]);

    const setDraft = useCallback((key, draft) => {
        setDrafts(previous => ({...previous, [key]: draft}));
    }, []);

    const dropDraft = key => setDrafts(previous => {
        const {[key]: dropped, ...rest} = previous;
        return rest;
    });

    const apply = field => {
        const current = knownFilters.find(filter => filter.field === field.key);
        const draft = draftsRef.current[field.key];
        dropDraft(field.key);
        if (!draft) {
            return;
        }

        const candidate = {field: field.key, operator: draft.operator, ...(draft.value !== undefined && {value: draft.value})};
        if (filterToConstraint(field, candidate)) {
            if (!sameFilter(candidate, current)) {
                onChange(setFilterIn(knownFilters, candidate));
            }
        } else if (current) {
            // A selector closed with no value removes the filter
            onChange(knownFilters.filter(filter => filter.field !== field.key));
        }
    };

    const collectionFilters = fields.map(field => {
        const filter = knownFilters.find(candidate => candidate.field === field.key);
        return {
            key: field.key,
            label: field.label,
            valueLabel: filterToConstraint(field, filter) ? filterValueLabel(t, field, filter) : '',
            isDisplayedByDefault: defaultFields.includes(field.key),
            selector: ({close}) => (
                <FilterSelector
                    field={field}
                    draft={drafts[field.key] || draftOf(field, filter)}
                    onDraftChange={draft => setDraft(field.key, draft)}
                    onApply={close}
                />
            ),
            onClear: () => {
                dropDraft(field.key);
                onChange(knownFilters.filter(candidate => candidate.field !== field.key));
            },
            // The Filter button and Enter apply the draft. Cancel, Escape and a click outside discard it
            onClose: ({reason}) => {
                if (reason === 'applyButton' || reason === 'close') {
                    apply(field);
                } else {
                    dropDraft(field.key);
                }
            }
        };
    });

    return (
        <CollectionBar
            {...props}
            className={clsx(styles.filterBar, className)}
            filters={collectionFilters}
            isDisabled={isDisabled}
            i18n={collectionBarLabels(t)}
            onClearAll={() => {
                setDrafts({});
                onChange([]);
            }}
            onOpenFilterChange={key => {
                const field = key && fields.find(candidate => candidate.key === key);
                if (field) {
                    setDraft(key, draftOf(field, knownFilters.find(candidate => candidate.field === key)));
                }
            }}
        />
    );
};

FilterBar.propTypes = {
    fields: PropTypes.arrayOf(PropTypes.shape({
        key: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        kind: PropTypes.oneOf(['text', 'number', 'date', 'boolean', 'choice', 'media']).isRequired,
        property: PropTypes.string.isRequired,
        multiple: PropTypes.bool,
        options: PropTypes.arrayOf(PropTypes.shape({value: PropTypes.string, label: PropTypes.string})),
        looseSeparators: PropTypes.bool
    })).isRequired,
    filters: PropTypes.arrayOf(PropTypes.shape({
        field: PropTypes.string.isRequired,
        operator: PropTypes.string.isRequired,
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])
    })),
    onChange: PropTypes.func.isRequired,
    defaultFields: PropTypes.arrayOf(PropTypes.string),
    isDisabled: PropTypes.bool,
    className: PropTypes.string
};
