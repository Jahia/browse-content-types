import React from 'react';
import PropTypes from 'prop-types';
import {useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {Button, CustomDropdown, SearchInput} from '@jahia/moonstone';
import {DisplayAction} from '@jahia/ui-extender';
import {ButtonRenderer} from '@jahia/jcontent';
import {ColumnsIcon} from './ColumnsIcon';
import {ContentTypesColumnsPicker} from './ContentTypesColumnsPicker';
import {ContentTypesSelectionBar} from './ContentTypesSelectionBar';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The row of controls between the type heading and the table.
 *
 * The search box filters the table, Advanced search opens jContent's own search dialog - the
 * same registered action its page builder header uses - and the columns icon opens the picker for
 * which fields the table shows, and in what order. Filter is laid out but does nothing yet.
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
    lockedLabel,
    availableFields,
    visibleFields,
    toggleField,
    moveField,
    resetToDefaults,
    selection,
    onClearSelection
}) => {
    const {t} = useTranslation(NAMESPACE);
    const site = useSelector(state => state.site);

    return (
        <div className={styles.toolBar} data-sel-role="content-types-toolbar">
            {selection.length > 0 ? (
                <ContentTypesSelectionBar nodes={selection} onClear={onClearSelection}/>
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
                    <DisplayAction
                        actionKey="search"
                        path={`/sites/${site}`}
                        buttonLabel={t('label.toolbar.advancedSearch')}
                        render={ButtonRenderer}
                        buttonProps={{variant: 'ghost', 'data-sel-role': 'toolbar-advanced-search'}}
                    />
                    <Button variant="ghost"
                            label={t('label.toolbar.filter')}
                            data-sel-role="toolbar-filter"
                    />
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
    lockedLabel: PropTypes.string.isRequired,
    availableFields: PropTypes.array.isRequired,
    visibleFields: PropTypes.array.isRequired,
    onSearchChange: PropTypes.func.isRequired,
    toggleField: PropTypes.func.isRequired,
    moveField: PropTypes.func.isRequired,
    resetToDefaults: PropTypes.func.isRequired,
    /** The ticked rows. Empty means nothing is selected, and the browse controls hold the line. */
    selection: PropTypes.array.isRequired,
    onClearSelection: PropTypes.func.isRequired
};

export default ContentTypesToolBar;
