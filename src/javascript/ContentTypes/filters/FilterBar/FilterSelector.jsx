import React, {useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import * as moonstone from '@jahia/moonstone';
import {NAMESPACE} from '../../../ContentTypes.register';
import {FILTER_OPERATORS, MULTI_VALUE_OPERATORS, VALUELESS_OPERATORS, valuesOf} from '../filterConstraint';
import {operatorLabel} from './filterLabels';
import styles from './FilterBar.scss';

const {CheckboxGroup, CheckboxItem, Dropdown, Input} = moonstone;
// DateTimeInput comes with Moonstone 2.21. Before it, a date filter takes the date input of the browser
const {DateTimeInput} = moonstone;

const LABELS = 'label.filters';
const SEARCH_FROM = 12;

const dayOf = value => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

/**
 * Escape with the list of the condition open closes that list only. The Menu of Moonstone 2.21 has no Escape of its own,
 * so the key would reach the selector and close it, losing what was typed. The Menu closes on a click on its overlay.
 * A handled key is marked, and the selector leaves a marked key alone.
 */
const closeOpenMenuOnEscape = event => {
    if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
    }

    const overlay = document.querySelector('.moonstone-menu_overlay');
    if (overlay) {
        event.preventDefault();
        overlay.click();
    }
};

/**
 * The values of a choice as checkboxes in the selector, with a search above a long list.
 * Not a Dropdown: its list opens over the footer of the selector, so a click meant for the Filter button ticks an option,
 * and the Escape that closes the list also closes the selector.
 */
const ChoiceList = ({field, values, label, searchLabel, onChange}) => {
    const [term, setTerm] = useState('');
    const options = field.options || [];
    const hasSearch = options.length >= SEARCH_FROM;
    const shown = term ? options.filter(option => option.label.toLowerCase().includes(term.toLowerCase())) : options;

    return (
        <div className={styles.choiceList}>
            {hasSearch && (
                <Input
                    aria-label={searchLabel}
                    className={styles.selectorControl}
                    variant="search"
                    value={term}
                    placeholder={searchLabel}
                    onChange={event => setTerm(event.target.value)}
                    onClear={() => setTerm('')}
                />
            )}
            <div className={styles.choiceOptions} role="group" aria-label={label}>
                <CheckboxGroup
                    name={field.key}
                    onChange={(event, value, checked) => onChange(checked ? [...values, value] : values.filter(candidate => candidate !== value))}
                >
                    {shown.map(option => (
                        <CheckboxItem
                            key={option.value}
                            id={`${field.key}-${option.value}`}
                            value={option.value}
                            label={option.label}
                            checked={values.includes(option.value)}
                        />
                    ))}
                </CheckboxGroup>
            </div>
        </div>
    );
};

ChoiceList.propTypes = {
    field: PropTypes.shape({
        key: PropTypes.string.isRequired,
        options: PropTypes.arrayOf(PropTypes.shape({value: PropTypes.string, label: PropTypes.string}))
    }).isRequired,
    values: PropTypes.arrayOf(PropTypes.string).isRequired,
    label: PropTypes.string.isRequired,
    searchLabel: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired
};

/**
 * The controls of one filter: the operator, and the value control of the kind of the field.
 * It edits a draft; the bar applies the draft when the selector closes, and Enter in a value field closes it.
 */
export const FilterSelector = ({field, draft, onDraftChange, onApply}) => {
    const {t, i18n} = useTranslation(NAMESPACE);
    const {operator} = draft;
    const operators = FILTER_OPERATORS[field.kind] || [];

    const setOperator = next => {
        const keepsValue = MULTI_VALUE_OPERATORS.has(next) === MULTI_VALUE_OPERATORS.has(operator) &&
            (next === 'lastDays') === (operator === 'lastDays') && !VALUELESS_OPERATORS.has(next);
        onDraftChange(keepsValue ? {...draft, operator: next} : {operator: next});
    };

    const setValue = value => onDraftChange({...draft, value});
    const applyOnEnter = event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            onApply();
        }
    };

    const valueLabel = t(`${LABELS}.valueField`);
    let valueControl = null;
    if (VALUELESS_OPERATORS.has(operator)) {
        valueControl = null;
    } else if (field.kind === 'choice') {
        valueControl = (
            <ChoiceList
                field={field}
                values={valuesOf(draft.value)}
                label={valueLabel}
                searchLabel={t(`${LABELS}.searchValues`)}
                onChange={setValue}
            />
        );
    } else if (field.kind === 'date' && operator !== 'lastDays' && DateTimeInput) {
        valueControl = (
            <DateTimeInput
                aria-label={valueLabel}
                className={styles.selectorControl}
                type="date"
                locale={i18n.language}
                value={dayOf(draft.value)}
                onChange={(event, value) => setValue(value ? value.toString() : undefined)}
                onKeyDown={applyOnEnter}
            />
        );
    } else if (field.kind === 'date' && operator !== 'lastDays') {
        valueControl = (
            <Input
                aria-label={valueLabel}
                className={styles.selectorControl}
                type="date"
                value={dayOf(draft.value) || ''}
                onChange={event => setValue(event.target.value || undefined)}
                onKeyDown={applyOnEnter}
            />
        );
    } else {
        const isNumber = field.kind === 'number' || operator === 'lastDays';
        valueControl = (
            <Input
                aria-label={valueLabel}
                className={styles.selectorControl}
                type={isNumber ? 'number' : 'text'}
                value={typeof draft.value === 'string' ? draft.value : ''}
                placeholder={valueLabel}
                onChange={event => setValue(event.target.value)}
                onKeyDown={applyOnEnter}
            />
        );
    }

    return (
        <div className={styles.selectorFields} onKeyDown={closeOpenMenuOnEscape}>
            <Dropdown
                aria-label={t(`${LABELS}.operatorField`)}
                className={styles.selectorControl}
                data={operators.map(candidate => ({label: operatorLabel(t, field, candidate), value: candidate}))}
                value={operator}
                onChange={(event, item) => setOperator(item.value)}
            />
            {valueControl}
        </div>
    );
};

FilterSelector.propTypes = {
    field: PropTypes.shape({
        key: PropTypes.string.isRequired,
        kind: PropTypes.string.isRequired,
        options: PropTypes.arrayOf(PropTypes.shape({value: PropTypes.string, label: PropTypes.string}))
    }).isRequired,
    draft: PropTypes.shape({
        operator: PropTypes.string,
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])
    }).isRequired,
    onDraftChange: PropTypes.func.isRequired,
    onApply: PropTypes.func.isRequired
};
