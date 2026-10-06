import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useQuery} from '@apollo/client';
import {shallowEqual, useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {Typography} from '@jahia/moonstone';
import {GET_SITE_CONTENT_TYPES} from './ContentTypes.gql';
import {ContentTypesTable} from './ContentTypesTable';
import {ContentTypesToolBar} from './ContentTypesToolBar';
import {useContentTypeColumns} from './useContentTypeColumns';
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
    /*
     * `uilang`, not `language`: a content type's display name is a label out of a resource bundle,
     * so it belongs in the language the interface is in, like every other label on screen. The
     * content language is what the VALUES are read in, and it is a different question - a reader
     * looking at French content through an English interface wants an English type name and French
     * values, which is exactly what they get from the table.
     *
     * This is what the columns picker and the settings panel already did for their own labels; the
     * heading and the create button were the two places still asking in the content language, so
     * the button read "New Bien immobilier" to an English reader.
     */
    const {site, uilang, path} = useSelector(state => ({
        site: state.site,
        uilang: state.uilang,
        path: state.jcontent.path
    }), shallowEqual);

    const contentType = (path || '/').substring(1);
    const [search, setSearch] = useState('');

    // A term typed for one type means nothing for the next, and leaving it in the box while the
    // table ignored it would be worse than clearing it.
    useEffect(() => {
        setSearch('');
    }, [contentType]);

    // Apollo already has this from the side panel, so naming the type costs no extra request.
    const {data} = useQuery(GET_SITE_CONTENT_TYPES, {
        variables: {siteKey: site, language: uilang || 'en'},
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

    // Indexed over the whole catalog, not only what is shown: the export dialog offers every column
    // a record carries, including ones this reader has hidden from the table.
    const fieldsByKey = useMemo(
        // Name is in here without being in the picker: it is always shown, and so never in it.
        () => new Map([...columns.availableFields, columns.nameField].map(field => [field.key, field])),
        [columns.availableFields, columns.nameField]
    );

    if (!contentType) {
        return <div className={styles.mainPane} data-sel-role="content-types-route"/>;
    }

    const type = data?.jcr?.nodeTypes?.nodes?.find(candidate => candidate.name === contentType);
    // What to call this type on screen, worked out once: the heading shows it and the create button
    // offers it by name, and the two must not disagree.
    const typeLabel = type?.displayName || contentType;

    return (
        <div className={styles.mainPane} data-sel-role="content-types-route">
            <header className={styles.header}>
                <Typography isNowrap variant="heading" weight="bold">
                    {typeLabel}
                </Typography>
                <Typography isNowrap className={styles.subtitle} variant="caption">
                    {contentType}
                </Typography>
            </header>
            <ContentTypesToolBar
                search={search}
                contentType={contentType}
                contentTypeLabel={typeLabel}
                lockedLabel={t('label.table.name')}
                availableFields={columns.availableFields}
                visibleFields={columns.visibleFields}
                toggleField={columns.toggleField}
                moveField={columns.moveField}
                resetToDefaults={columns.resetToDefaults}
                selection={selection}
                fieldsByKey={fieldsByKey}
                translatableFields={columns.translatableFields}
                languages={columns.languages}
                onSearchChange={setSearch}
                onClearSelection={clearSelection}
            />
            {/* Holds the table to the height the toolbar leaves rather than letting it run past the
                bottom of the pane - which is what `flex: 1 1 0` with `min-height: 0` is for. */}
            <div className={styles.contentArea}>
                <ContentTypesTable
                    contentType={contentType}
                    search={search}
                    visibleFields={columns.visibleFields}
                    availableFields={columns.availableFields}
                    selection={selection}
                    translatableFields={columns.translatableFields}
                    languages={columns.languages}
                    searchableTextProperties={columns.searchableTextProperties}
                    onSelectionChange={setSelection}
                />
            </div>
        </div>
    );
};

export default ContentTypesRoute;
