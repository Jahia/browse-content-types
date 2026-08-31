import React, {useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Button, CheckboxItem, ChevronDown, ChevronUp, SearchInput, Typography} from '@jahia/moonstone';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The content of the columns dropdown: a search box, the columns currently shown, and the ones that
 * could be added - in two groups, this content type's own fields first and then the metadata every
 * node carries, since only the first group is any different from one type to the next.
 *
 * Checking a box takes effect immediately; there is no separate "apply" step. Save as default is
 * the only thing that persists the choice past this visit, and is disabled once the visible set
 * already matches what was last saved, so it never implies there is a change waiting to be kept
 * when there is not.
 */
export const ContentTypesColumnsPicker = ({
    lockedLabel,
    availableFields,
    visibleFields,
    toggleField,
    moveField,
    resetToDefaults
}) => {
    const {t} = useTranslation(NAMESPACE);
    const [filter, setFilter] = useState('');

    const term = filter.trim().toLowerCase();
    const matches = field => !term || field.label.toLowerCase().includes(term);

    const showLocked = !term || lockedLabel.toLowerCase().includes(term);
    // The arrows move a field within this real, full order, so whether one is enabled has to be
    // decided against it too - not against whatever the search box currently leaves on screen,
    // which would make an arrow's own enabled state change with what was typed into the filter.
    const visible = visibleFields.filter(matches);
    const hidden = availableFields.filter(field => !visibleFields.some(v => v.key === field.key) && matches(field));

    // Split by where a field comes from, because the two answer different questions. A content type's
    // own properties are what someone opened this menu for on this type, and there is no telling how
    // many there are; the metadata every node carries is a fixed list of eleven, identical on every
    // type, and mostly already familiar. Run together they read as one long list in which the
    // interesting entries are wherever the catalog happens to have put them.
    const hiddenType = hidden.filter(field => field.isDynamic);
    const hiddenCommon = hidden.filter(field => !field.isDynamic);

    /**
     * One group of fields that could be added. Omitted entirely when it holds nothing, so a type with
     * no properties of its own shows no empty heading, and neither does a search that matched only
     * one of the two groups.
     */
    const renderAvailable = (labelKey, fields, role) => fields.length > 0 && (
        <section className={styles.columnsSection} data-sel-role={role}>
            <Typography className={styles.columnsSectionLabel} variant="caption" weight="bold">
                {t(labelKey)}
            </Typography>
            {fields.map(field => (
                // Wrapped the same way as a visible row, arrows or not: it is what takes each
                // CheckboxItem out of being another one's direct sibling, so every section gets its
                // spacing from .columnsSection's own gap instead of some of them relying on it and
                // others falling back to Moonstone's wider built-in spacing between adjacent
                // checkboxes.
                <div key={field.key} className={styles.columnsRow}>
                    <CheckboxItem
                        checked={false}
                        id={`content-types-column-${field.key}`}
                        label={field.label}
                        data-sel-column={field.key}
                        onChange={() => toggleField(field.key)}
                    />
                </div>
            ))}
        </section>
    );

    return (
        <div className={styles.columnsPicker} data-sel-role="columns-picker">
            <SearchInput
                className={styles.columnsSearch}
                variant="ghost"
                value={filter}
                placeholder={t('label.columns.searchPlaceholder')}
                data-sel-role="columns-search"
                onChange={event => setFilter(event.target.value)}
                onClear={() => setFilter('')}
            />

            <div className={styles.columnsList}>
                {/*
                    Each section is its own block, not a bare run of siblings in the scrolling
                    flex column: Moonstone gives consecutive CheckboxItems a built-in gap via a
                    `checkboxItem + checkboxItem` rule, but that rule does not see a heading in
                    between, so the heading before "Available fields" was landing right against
                    the last checked row above it with none of that spacing - close enough to
                    read as sitting behind it. A section boundary (border, margin, its own
                    padding) is deliberate here instead of relying on that sibling rule to hold.
                */}
                {(showLocked || visible.length > 0) && (
                    <section className={styles.columnsSection} data-sel-role="columns-section-visible">
                        <Typography className={styles.columnsSectionLabel} variant="caption" weight="bold">
                            {t('label.columns.visible')}
                        </Typography>
                        {showLocked && (
                            <div className={styles.columnsRow}>
                                <CheckboxItem
                                    isDisabled
                                    checked
                                    id="content-types-column-locked-name"
                                    label={lockedLabel}
                                />
                                {/* Name has nowhere to move to - it is not part of the reorderable
                                    list at all, always first regardless of it. */}
                            </div>
                        )}
                        {visible.map(field => {
                            const index = visibleFields.findIndex(candidate => candidate.key === field.key);
                            return (
                                <div key={field.key} className={styles.columnsRow}>
                                    <CheckboxItem
                                        checked
                                        id={`content-types-column-${field.key}`}
                                        label={field.label}
                                        data-sel-column={field.key}
                                        onChange={() => toggleField(field.key)}
                                    />
                                    <div className={styles.columnsOrderButtons}>
                                        <Button
                                            variant="ghost"
                                            size="small"
                                            icon={<ChevronUp/>}
                                            isDisabled={index <= 0}
                                            aria-label={t('label.columns.moveUp')}
                                            data-sel-role="columns-move-up"
                                            onClick={() => moveField(field.key, -1)}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="small"
                                            icon={<ChevronDown/>}
                                            isDisabled={index === -1 || index >= visibleFields.length - 1}
                                            aria-label={t('label.columns.moveDown')}
                                            data-sel-role="columns-move-down"
                                            onClick={() => moveField(field.key, 1)}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </section>
                )}

                {/* This type's own fields before the metadata every node carries: they are the ones
                    that differ from one type to the next, so they are what someone came here to
                    find. */}
                {renderAvailable('label.columns.availableType', hiddenType, 'columns-section-type')}
                {renderAvailable('label.columns.availableCommon', hiddenCommon, 'columns-section-common')}

                {!showLocked && visible.length === 0 && hidden.length === 0 && (
                    <Typography className={styles.columnsSectionLabel} variant="caption">
                        {t('label.columns.noMatch')}
                    </Typography>
                )}
            </div>

            {/* No save button: a change is kept as it is made. What the footer is for now is the way
                back, since without it a set someone experimented with would be the set they are
                stuck with on every later visit. */}
            <footer className={styles.columnsFooter}>
                <Typography className={styles.subtitle} variant="caption">
                    {t('label.columns.autoSaved')}
                </Typography>
                <div className={styles.toolBarSpacer}/>
                <Button
                    size="big"
                    variant="ghost"
                    label={t('label.columns.reset')}
                    data-sel-role="columns-reset"
                    onClick={resetToDefaults}
                />
            </footer>
        </div>
    );
};

ContentTypesColumnsPicker.propTypes = {
    lockedLabel: PropTypes.string.isRequired,
    availableFields: PropTypes.array.isRequired,
    visibleFields: PropTypes.array.isRequired,
    toggleField: PropTypes.func.isRequired,
    moveField: PropTypes.func.isRequired,
    resetToDefaults: PropTypes.func.isRequired
};

export default ContentTypesColumnsPicker;
