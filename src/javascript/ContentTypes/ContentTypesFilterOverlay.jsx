import React, {useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Button, Dropdown, Input} from '@jahia/moonstone';
import {FILTER_BOOLEAN, FILTER_DATE, FILTER_NUMBER, OPERATORS, VALUELESS_OPERATORS, defaultOperator, operatorLabel} from './ContentTypesFilters';
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
export const ContentTypesFilterOverlay = ({field, filter, onApply, onClear, onClose}) => {
    const {t} = useTranslation(NAMESPACE);
    const operators = OPERATORS[field.filterType] || [];

    const [operator, setOperator] = useState(filter?.o || defaultOperator(field.filterType));
    const [value, setValue] = useState(filter?.v === undefined ? '' : String(filter.v));

    const needsValue = !VALUELESS_OPERATORS.has(operator);
    const canApply = !needsValue || String(value).trim() !== '';

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

    let inputType = 'text';
    if (field.filterType === FILTER_NUMBER) {
        inputType = 'number';
    } else if (field.filterType === FILTER_DATE) {
        // "In the last N days" asks for a count, not a day, even in a date column.
        inputType = operator === 'lastDays' ? 'number' : 'date';
    }

    return (
        <div className={styles.filterOverlay} data-sel-role="filter-overlay" onKeyDown={onKeyDown}>
            <Dropdown
                isFullWidth
                size="small"
                hasSearch={false}
                data={operators.map(name => ({label: operatorLabel(t, field.filterType, name), value: name}))}
                value={operator}
                data-sel-role="filter-operator"
                onChange={(event, item) => {
                    setOperator(item.value);
                    // A condition that takes no value must not carry one over from the last choice.
                    if (VALUELESS_OPERATORS.has(item.value)) {
                        setValue('');
                    }
                }}
            />

            {needsValue && field.filterType !== FILTER_BOOLEAN && (
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
