import React, {useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Button, CheckboxItem, ChevronDown, ChevronUp, SearchInput, Typography} from '@jahia/moonstone';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The content of the columns dropdown: a search box, the columns currently shown, and the ones
 * that could be added - the content type's own fields first, then the metadata every node carries.
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
    isDirty,
    saveAsDefault
}) => {
    const {t} = useTranslation(NAMESPACE);
    const [filter, setFilter] = useState('');
    const [savedFlash, setSavedFlash] = useState(false);

    const term = filter.trim().toLowerCase();
    const matches = field => !term || field.label.toLowerCase().includes(term);

    const showLocked = !term || lockedLabel.toLowerCase().includes(term);
    // The arrows move a field within this real, full order, so whether one is enabled has to be
    // decided against it too - not against whatever the search box currently leaves on screen,
    // which would make an arrow's own enabled state change with what was typed into the filter.
    const visible = visibleFields.filter(matches);
    const hidden = availableFields.filter(field => !visibleFields.some(v => v.key === field.key) && matches(field));

    const handleSave = () => {
        if (saveAsDefault()) {
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 2000);
        }
    };

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

                {hidden.length > 0 && (
                    <section className={styles.columnsSection} data-sel-role="columns-section-available">
                        <Typography className={styles.columnsSectionLabel} variant="caption" weight="bold">
                            {t('label.columns.available')}
                        </Typography>
                        {hidden.map(field => (
                            // Wrapped the same way as a visible row, arrows or not: it is what
                            // takes each CheckboxItem out of being another one's direct sibling,
                            // so both sections get their spacing from .columnsSection's own gap
                            // instead of one relying on it and the other falling back to
                            // Moonstone's wider built-in spacing between adjacent checkboxes.
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
                )}

                {!showLocked && visible.length === 0 && hidden.length === 0 && (
                    <Typography className={styles.columnsSectionLabel} variant="caption">
                        {t('label.columns.noMatch')}
                    </Typography>
                )}
            </div>

            <footer className={styles.columnsFooter}>
                <Typography className={styles.subtitle} variant="caption" data-sel-role="columns-save-status">
                    {savedFlash && t('label.columns.saved')}
                </Typography>
                <div className={styles.toolBarSpacer}/>
                <Button
                    size="big"
                    color="accent"
                    label={t('label.columns.saveAsDefault')}
                    isDisabled={!isDirty}
                    data-sel-role="columns-save"
                    onClick={handleSave}
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
    isDirty: PropTypes.bool.isRequired,
    saveAsDefault: PropTypes.func.isRequired
};

export default ContentTypesColumnsPicker;
