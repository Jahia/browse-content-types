import React from 'react';
import PropTypes from 'prop-types';
import {useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {Button, CustomDropdown, SearchInput} from '@jahia/moonstone';
import {DisplayAction} from '@jahia/ui-extender';
import {ButtonRenderer} from '@jahia/jcontent';
import {ColumnsIcon} from './ColumnsIcon';
import {ContentTypesColumnsPicker} from './ContentTypesColumnsPicker';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The row of controls between the type heading and the table.
 *
 * The search box filters the table, Advanced search opens jContent's own search dialog - the
 * same registered action its page builder header uses - and the columns icon opens the picker for
 * which fields the table shows, and in what order. Filter is laid out but does nothing yet.
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
    isDirty,
    toggleField,
    moveField,
    saveAsDefault
}) => {
    const {t} = useTranslation(NAMESPACE);
    const site = useSelector(state => state.site);

    return (
        <div className={styles.toolBar} data-sel-role="content-types-toolbar">
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

            {/* Pushes the columns control to the right end of the line. */}
            <div className={styles.toolBarSpacer}/>

            <CustomDropdown
                variant="ghost"
                icon={<ColumnsIcon/>}
                aria-label={t('label.toolbar.columns')}
                title={t('label.toolbar.columns')}
                data-sel-role="toolbar-columns"
            >
                <ContentTypesColumnsPicker
                    lockedLabel={lockedLabel}
                    availableFields={availableFields}
                    visibleFields={visibleFields}
                    isDirty={isDirty}
                    toggleField={toggleField}
                    moveField={moveField}
                    saveAsDefault={saveAsDefault}
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
    isDirty: PropTypes.bool.isRequired,
    onSearchChange: PropTypes.func.isRequired,
    toggleField: PropTypes.func.isRequired,
    moveField: PropTypes.func.isRequired,
    saveAsDefault: PropTypes.func.isRequired
};

export default ContentTypesToolBar;
