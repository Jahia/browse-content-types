import React, {useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Button, Dropdown, Input} from '@jahia/moonstone';
import {FILTER_BOOLEAN, FILTER_CHOICE, FILTER_DATE, FILTER_NUMBER, FILTER_PUBLICATION, MULTI_VALUE_OPERATORS, OPERATORS, VALUELESS_OPERATORS, defaultOperator, operatorLabel, valuesOf} from './ContentTypesFilters';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The form behind a column's filter control: which condition, and what to compare against.
 *
 * One form, four shapes, chosen by what the column holds - a number gets number comparisons and a
 * numeric input, a date gets before/after and a date picker, a boolean gets no value box at all. The
 * operators come from the same table the constraint builder reads, so the two cannot drift into
 * offering something that could not be asked of the repository.
 *
 * Nothing is applied as it is typed. A filter reloads the table and changes the address bar, and
 * doing that on every keystroke would fill the browser's history with half-typed words.
 */
/** Past this many values the list is worth searching rather than scrolling - country has 249. */
const SEARCHABLE_FROM = 12;

/**
 * The value the form opens with, in the shape that column keeps its values in.
 *
 * A value list keeps a list, a status keeps the one it holds, and everything else keeps the string it
 * was typed as. A filter arriving from a shared link is folded into the same shape, which is why a
 * bare string is read through `valuesOf` rather than used as it stands.
 */
const initialValue = (field, filter) => {
    if (field.filterType === FILTER_CHOICE) {
        return valuesOf(filter?.v);
    }

    if (field.filterType === FILTER_PUBLICATION) {
        return valuesOf(filter?.v)[0] || '';
    }

    return filter?.v === undefined ? '' : String(filter.v);
};

/** The kind of box a typed value is entered in. */
const inputTypeFor = (field, operator) => {
    if (field.filterType === FILTER_NUMBER) {
        return 'number';
    }

    if (field.filterType === FILTER_DATE) {
        // "In the last N days" asks for a count, not a day, even in a date column.
        return operator === 'lastDays' ? 'number' : 'date';
    }

    return 'text';
};

export const ContentTypesFilterOverlay = ({field, filter, onApply, onClear, onClose}) => {
    const {t} = useTranslation(NAMESPACE);
    const operators = OPERATORS[field.filterType] || [];

    const isChoice = field.filterType === FILTER_CHOICE;
    // A status at a time, unlike a value list: a record holds exactly one, so several would only ever
    // widen the answer, and asking for "not published or unpublished" is two filters nobody needs.
    const isStatus = field.filterType === FILTER_PUBLICATION;

    const [operator, setOperator] = useState(filter?.o || defaultOperator(field.filterType));
    const [value, setValue] = useState(() => initialValue(field, filter));

    const needsValue = !VALUELESS_OPERATORS.has(operator);
    const canApply = isChoice ? value.length > 0 : (!needsValue || String(value).trim() !== '');

    /**
     * Adds or removes one value, keeping them in the order the definition lists them.
     *
     * Ordered by the definition rather than by the order they were ticked, so that the same two
     * values always read the same way in the summary above the table.
     */
    const toggleValue = code => setValue(previous => {
        const next = previous.includes(code) ?
            previous.filter(entry => entry !== code) :
            [...previous, code];

        return (field.valueOptions || []).map(option => option.value).filter(entry => next.includes(entry));
    });

    const apply = () => {
        if (canApply) {
            onApply({o: operator, v: needsValue ? value : undefined});
            onClose();
        }
    };

    // Enter applies, which is what a single-field form invites; Escape gives up on it.
    const onKeyDown = event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            apply();
        } else if (event.key === 'Escape') {
            onClose();
        }
    };

    const inputType = inputTypeFor(field, operator);

    return (
        <div className={styles.filterOverlay} data-sel-role="filter-overlay" onKeyDown={onKeyDown}>
            <Dropdown
                isFullWidth
                size="small"
                hasSearch={false}
                data={operators.map(name => ({label: operatorLabel(t, field, name), value: name}))}
                value={operator}
                data-sel-role="filter-operator"
                onChange={(event, item) => {
                    setOperator(item.value);
                    // A condition that takes no value must not carry one over from the last choice.
                    if (VALUELESS_OPERATORS.has(item.value)) {
                        setValue(isChoice ? [] : '');
                    }
                }}
            />

            {/* A value list is chosen from, never typed: the labels are what the reader sees in the
                cells, and the code behind each one never has to be known or spelled. */}
            {needsValue && isChoice && (
                <Dropdown
                    isFullWidth
                    size="small"
                    hasSearch={(field.valueOptions || []).length > SEARCHABLE_FROM}
                    placeholder={t('label.filter.valuePlaceholder')}
                    data={(field.valueOptions || []).map(option => ({label: option.label, value: option.value}))}
                    // `values` rather than `value` is what puts Moonstone's dropdown into multiple
                    // selection. It reports the value that was ticked or unticked, not the new set,
                    // so the set is kept here.
                    values={MULTI_VALUE_OPERATORS.has(operator) ? value : []}
                    data-sel-role="filter-choice"
                    onChange={(event, item) => toggleValue(item.value)}
                />
            )}

            {needsValue && isStatus && (
                <Dropdown
                    isFullWidth
                    size="small"
                    hasSearch={false}
                    placeholder={t('label.filter.valuePlaceholder')}
                    data={(field.valueOptions || []).map(option => ({label: option.label, value: option.value}))}
                    value={value}
                    data-sel-role="filter-status"
                    onChange={(event, item) => setValue(item.value)}
                />
            )}

            {needsValue && field.filterType !== FILTER_BOOLEAN && !isChoice && !isStatus && (
                <Input
                    autoFocus
                    type={inputType}
                    value={value}
                    placeholder={t('label.filter.valuePlaceholder')}
                    data-sel-role="filter-value"
                    onChange={event => setValue(event.target.value)}
                />
            )}

            <div className={styles.filterOverlayFooter}>
                {filter && (
                    <Button
                        variant="ghost"
                        label={t('label.filter.clear')}
                        data-sel-role="filter-clear"
                        onClick={() => {
                            onClear();
                            onClose();
                        }}
                    />
                )}
                <div className={styles.toolBarSpacer}/>
                <Button
                    size="big"
                    color="accent"
                    label={t('label.filter.apply')}
                    isDisabled={!canApply}
                    data-sel-role="filter-apply"
                    onClick={apply}
                />
            </div>
        </div>
    );
};

ContentTypesFilterOverlay.propTypes = {
    /** The column being filtered, which supplies the kind of form and the property behind it. */
    field: PropTypes.object.isRequired,
    /** The filter already set on this column, if there is one. */
    filter: PropTypes.object,
    onApply: PropTypes.func.isRequired,
    onClear: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired
};

export default ContentTypesFilterOverlay;
