import React from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Button, Close, CustomDropdown, Filter, SearchInput, Typography} from '@jahia/moonstone';
import {ColumnsIcon} from './ColumnsIcon';
import {ContentTypesColumnsPicker} from './ContentTypesColumnsPicker';
import {ContentTypesSelectionBar} from './ContentTypesSelectionBar';
import {ContentTypesUndoAction} from './ContentTypesUndoAction';
import {describeFilter} from './ContentTypesFilters';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The row of controls between the type heading and the table.
 *
 * The search box narrows the table across every field at once, and the columns icon opens the picker
 * for which fields the table shows, and in what order.
 *
 * Filter is the summary, not the way in, and it appears only once there is something to summarise.
 * Conditions are set from the column headers, where the column is; this gathers up whatever is in
 * force so that a condition on a column since scrolled past, or since hidden, is never narrowing the
 * table with nothing on screen to say why. Each one is also named in the line itself, beside the
 * button, so that reading why the table is short does not take a click.
 *
 * Ticking a row replaces all of that with what can be done to what is ticked, in the same place, as
 * jContent's own list does: while there is a selection, the controls for finding content are not
 * what is being asked for, and a search or a sort clears the selection anyway. The columns picker
 * stays either way, being about how the table reads rather than about what is in it.
 *
 * Choosing which types the accordion lists is deliberately not offered here: it is a site wide
 * setting and lives in Administration > site > Settings, where an administrator looks for it,
 * rather than on a page about one type's records.
 */
export const ContentTypesToolBar = ({
    search,
    onSearchChange,
    contentType,
    lockedLabel,
    availableFields,
    visibleFields,
    toggleField,
    moveField,
    resetToDefaults,
    selection,
    onClearSelection,
    filters,
    fieldsByKey,
    onClearFilter,
    onClearAllFilters
}) => {
    const {t} = useTranslation(NAMESPACE);

    return (
        <div className={styles.toolBar} data-sel-role="content-types-toolbar">
            {selection.length > 0 ? (
                <ContentTypesSelectionBar
                    nodes={selection}
                    fields={visibleFields}
                    availableFields={availableFields}
                    fieldsByKey={fieldsByKey}
                    contentType={contentType}
                    onClear={onClearSelection}
                />
            ) : (
                <>
                    <SearchInput
                        className={styles.search}
                        variant="ghost"
                        value={search}
                        placeholder={t('label.toolbar.searchPlaceholder')}
                        data-sel-role="toolbar-search"
                        onChange={event => onSearchChange(event.target.value)}
                        onClear={() => onSearchChange('')}
                    />
                    {/* Nothing about filters is drawn until one is in force. Conditions are
                        created from the column headers, not from here, so an empty Filter control
                        would only invite a click that leads nowhere. Once something is narrowing the
                        table it is named in the line itself, and the button beside it carries the
                        whole list and the way to clear them all at once - which is what a shortened
                        chip cannot do. */}
                    {filters.length > 0 && (
                        <>
                            <CustomDropdown
                                variant="ghost"
                                icon={<Filter/>}
                                label={t('label.filter.activeCount', {count: filters.length})}
                                data-sel-role="toolbar-filter"
                            >
                                <div className={styles.filterSummary} data-sel-role="filter-summary">
                                    {filters.map(filter => (
                                        <div key={filter.c} className={styles.filterSummaryRow}>
                                            <Typography isNowrap variant="body">
                                                {describeFilter(filter, fieldsByKey.get(filter.c), t)}
                                            </Typography>
                                            <Button
                                                variant="ghost"
                                                size="small"
                                                icon={<Close/>}
                                                aria-label={t('label.filter.clear')}
                                                data-sel-role="filter-summary-remove"
                                                onClick={() => onClearFilter(filter.c)}
                                            />
                                        </div>
                                    ))}
                                    <div className={styles.filterSummaryFooter}>
                                        <Button
                                            variant="ghost"
                                            label={t('label.filter.clearAll')}
                                            data-sel-role="filter-clear-all"
                                            onClick={onClearAllFilters}
                                        />
                                    </div>
                                </div>
                            </CustomDropdown>

                            {/* The same conditions spelled out in the line itself, so that reading
                                why the table is short does not take a click. */}
                            <div className={styles.activeFilters} data-sel-role="active-filters">
                                {filters.map(filter => {
                                    const described = describeFilter(filter, fieldsByKey.get(filter.c), t);

                                    return (
                                        <span
                                            key={filter.c}
                                            className={styles.activeFilter}
                                            data-sel-role="active-filter"
                                            data-sel-filter={filter.c}
                                        >
                                            <Typography
                                                isNowrap
                                                variant="caption"
                                                className={styles.activeFilterLabel}
                                                title={described}
                                            >
                                                {described}
                                            </Typography>
                                            <Button
                                                variant="ghost"
                                                size="small"
                                                icon={<Close/>}
                                                aria-label={t('label.filter.remove', {filter: described})}
                                                data-sel-role="active-filter-remove"
                                                onClick={() => onClearFilter(filter.c)}
                                            />
                                        </span>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {/* The way back from the last bulk operation, kept in reach once the selection
                        that raised it has been cleared. Its usual home is beside the Bulk menu in
                        the selection bar; without it here, clearing a selection would quietly throw
                        away the only way to undo what was just done to it. */}
                    <ContentTypesUndoAction/>
                </>
            )}

            {/* Pushes the columns control to the right end of the line. */}
            <div className={styles.toolBarSpacer}/>

            <CustomDropdown
                variant="ghost"
                className={styles.toolBarColumns}
                icon={<ColumnsIcon/>}
                aria-label={t('label.toolbar.columns')}
                title={t('label.toolbar.columns')}
                data-sel-role="toolbar-columns"
            >
                <ContentTypesColumnsPicker
                    lockedLabel={lockedLabel}
                    availableFields={availableFields}
                    visibleFields={visibleFields}
                    toggleField={toggleField}
                    moveField={moveField}
                    resetToDefaults={resetToDefaults}
                />
            </CustomDropdown>
        </div>
    );
};

ContentTypesToolBar.propTypes = {
    search: PropTypes.string.isRequired,
    /** The type being listed. Only the selection bar wants it, to name an exported file. */
    contentType: PropTypes.string.isRequired,
    lockedLabel: PropTypes.string.isRequired,
    availableFields: PropTypes.array.isRequired,
    visibleFields: PropTypes.array.isRequired,
    onSearchChange: PropTypes.func.isRequired,
    toggleField: PropTypes.func.isRequired,
    moveField: PropTypes.func.isRequired,
    resetToDefaults: PropTypes.func.isRequired,
    /** The ticked rows. Empty means nothing is selected, and the browse controls hold the line. */
    selection: PropTypes.array.isRequired,
    onClearSelection: PropTypes.func.isRequired,
    /** The conditions currently narrowing the table, gathered from the column headers. */
    filters: PropTypes.array.isRequired,
    fieldsByKey: PropTypes.instanceOf(Map).isRequired,
    onClearFilter: PropTypes.func.isRequired,
    onClearAllFilters: PropTypes.func.isRequired
};

export default ContentTypesToolBar;
