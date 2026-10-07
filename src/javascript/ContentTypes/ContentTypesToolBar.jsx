import React from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {SearchInput, Typography} from '@jahia/moonstone';
import {ContentTypesCreateAction} from './ContentTypesCreateAction';
import {ContentTypesSelectionBar} from './ContentTypesSelectionBar';
import {MIN_SEARCH_LENGTH, isSearchTooShort} from './ContentTypesSearch';
import {isBulkSelection} from './ContentTypesSelection';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The left-hand side of the header's toolbar: what you do to the list you are looking at.
 *
 * The create action opens a new record of the listed type, and the search box narrows the table
 * across every field at once. Choosing which columns show sits on the toolbar's right instead,
 * where jContent puts its own view and sort selectors - it is about how the table reads rather
 * than about what is in it, so it is the one control that never changes with the selection.
 *
 * Ticking SEVERAL rows replaces all of that with what can be done to them, in the same place: while
 * a set is being acted on, the controls for finding content are not what is being asked for, and a
 * search or a sort clears the selection anyway.
 *
 * One ticked row leaves this line alone, which is a departure from jContent - its own list switches
 * at one. Picking a single record out is not a change of mode, and having the toolbar answer it by
 * replacing itself read as one. See ContentTypesSelection, where the threshold and its cost live.
 *
 * Choosing which types the accordion lists is deliberately not offered here: it is a site wide
 * setting and lives in Administration > site > Settings, where an administrator looks for it,
 * rather than on a page about one type's records.
 */
export const ContentTypesToolBar = ({
    search,
    onSearchChange,
    contentType,
    contentTypeLabel,
    selection,
    onClearSelection
}) => {
    const {t} = useTranslation(NAMESPACE);

    return (
        <div className={styles.toolBar} data-sel-role="content-types-toolbar">
            {isBulkSelection(selection) ? (
                <ContentTypesSelectionBar nodes={selection} onClear={onClearSelection}/>
            ) : (
                <>
                    {/* First on the line, and only while nothing is ticked: creating a record is
                        about the type being listed, not about the rows that happen to be selected. */}
                    <ContentTypesCreateAction contentType={contentType} contentTypeLabel={contentTypeLabel}/>
                    <SearchInput
                        className={styles.search}
                        variant="ghost"
                        value={search}
                        placeholder={t('label.toolbar.searchPlaceholder')}
                        data-sel-role="toolbar-search"
                        onChange={event => onSearchChange(event.target.value)}
                        onClear={() => onSearchChange('')}
                    />
                    {/* Said while it is true, which is the only moment it helps. A term shorter than
                        MIN_SEARCH_LENGTH is held back so it costs no query, and the table simply
                        does not change - indistinguishable, from the reader's side, from a search
                        that ran and matched everything. The placeholder cannot cover this: it is
                        gone the moment anything is typed. */}
                    {isSearchTooShort(search) && (
                        <Typography
                            variant="caption"
                            className={styles.searchHint}
                            data-sel-role="search-too-short"
                        >
                            {t('label.toolbar.searchTooShort', {count: MIN_SEARCH_LENGTH})}
                        </Typography>
                    )}
                </>
            )}

        </div>
    );
};

ContentTypesToolBar.propTypes = {
    search: PropTypes.string.isRequired,
    /** The type being listed, which the create action creates one of. */
    contentType: PropTypes.string.isRequired,
    /** That same type as the heading names it, for the create button to offer by name. */
    contentTypeLabel: PropTypes.string.isRequired,
    onSearchChange: PropTypes.func.isRequired,
    /** The ticked rows. Empty means nothing is selected, and the browse controls hold the line. */
    selection: PropTypes.array.isRequired,
    onClearSelection: PropTypes.func.isRequired
};

export default ContentTypesToolBar;
