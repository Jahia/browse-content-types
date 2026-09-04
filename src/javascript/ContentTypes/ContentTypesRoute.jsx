import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useQuery} from '@apollo/client';
import {shallowEqual, useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {Typography} from '@jahia/moonstone';
import {GET_SITE_CONTENT_TYPES} from './ContentTypes.gql';
import {ContentTypesTable} from './ContentTypesTable';
import {ContentTypesToolBar} from './ContentTypesToolBar';
import {useContentTypeColumns} from './useContentTypeColumns';
import {useColumnFilters} from './useColumnFilters';
import {ContentTypesPreviewPanel} from './ContentTypesPreviewPanel';
import {clearUndo} from './useBulkUndo';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The main pane: names the selected content type, then lists its records.
 *
 * The selection is read from the accordion's path, which is where the side panel writes it, so
 * the pane follows the tree and a reload lands back on the same type.
 */
export const ContentTypesRoute = () => {
    const {t} = useTranslation(NAMESPACE);
    const {site, language, path} = useSelector(state => ({
        site: state.site,
        language: state.language,
        path: state.jcontent.path
    }), shallowEqual);

    const contentType = (path || '/').substring(1);
    const [search, setSearch] = useState('');

    // A term typed for one type means nothing for the next, and leaving it in the box while the
    // table ignored it would be worse than clearing it. The undo goes with it: an offer to take
    // back an operation on records no longer listed is one nobody can check before accepting.
    useEffect(() => {
        setSearch('');
        clearUndo();
    }, [contentType]);

    // Apollo already has this from the side panel, so naming the type costs no extra request.
    const {data} = useQuery(GET_SITE_CONTENT_TYPES, {
        variables: {siteKey: site, language},
        skip: !site
    });

    // Owned here rather than inside the table or the toolbar: the toolbar renders the picker, the
    // table renders the columns it chose, and neither can do that from the other's own state. The
    // selection is here for the same reason - the table's checkboxes fill it, the toolbar acts on
    // it.
    const columns = useContentTypeColumns(contentType);
    const [selection, setSelection] = useState([]);

    // Stable, so that the table clearing the selection from an effect does not make that effect a
    // dependency on every render.
    const clearSelection = useCallback(() => setSelection([]), []);

    // Owned here for the same reason the columns are: the headers in the table set the filters and the
    // toolbar above summarises them, so neither can hold the state the other needs. They live in the
    // address bar rather than in this component, which is what makes a narrowed table a link.
    const {filters, setFilter, clearFilter, clearAll} = useColumnFilters();

    // Indexed over the whole catalog, not only what is shown: a filter carried in a shared link can
    // name a column this reader has hidden, and it must still narrow the table and still be nameable
    // in the summary.
    const fieldsByKey = useMemo(
        // Name is in here without being in the picker: it is always shown, but a filter on it still
        // has to be built and still has to be nameable in the summary.
        () => new Map([...columns.availableFields, columns.nameField].map(field => [field.key, field])),
        [columns.availableFields, columns.nameField]
    );

    if (!contentType) {
        return <div className={styles.mainPane} data-sel-role="content-types-route"/>;
    }

    const type = data?.jcr?.nodeTypes?.nodes?.find(candidate => candidate.name === contentType);

    return (
        <div className={styles.mainPane} data-sel-role="content-types-route">
            <header className={styles.header}>
                <Typography isNowrap variant="heading" weight="bold">
                    {type?.displayName || contentType}
                </Typography>
                <Typography isNowrap className={styles.subtitle} variant="caption">
                    {contentType}
                </Typography>
            </header>
            <ContentTypesToolBar
                search={search}
                contentType={contentType}
                lockedLabel={t('label.table.name')}
                availableFields={columns.availableFields}
                visibleFields={columns.visibleFields}
                toggleField={columns.toggleField}
                moveField={columns.moveField}
                resetToDefaults={columns.resetToDefaults}
                selection={selection}
                filters={filters}
                fieldsByKey={fieldsByKey}
                translatableFields={columns.translatableFields}
                languages={columns.languages}
                onSearchChange={setSearch}
                onClearSelection={clearSelection}
                onClearFilter={clearFilter}
                onClearAllFilters={clearAll}
            />
            {/* The table and the preview share the remaining height as a row, so opening a
                preview narrows the table rather than pushing it off the bottom. */}
            <div className={styles.contentArea}>
                <ContentTypesTable
                    contentType={contentType}
                    search={search}
                    visibleFields={columns.visibleFields}
                    availableFields={columns.availableFields}
                    selection={selection}
                    filters={filters}
                    fieldsByKey={fieldsByKey}
                    translatableFields={columns.translatableFields}
                    languages={columns.languages}
                    searchableTextProperties={columns.searchableTextProperties}
                    onSelectionChange={setSelection}
                    onSetFilter={setFilter}
                    onClearFilter={clearFilter}
                />
                <ContentTypesPreviewPanel/>
            </div>
        </div>
    );
};

export default ContentTypesRoute;
