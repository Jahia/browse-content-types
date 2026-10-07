import React, {useCallback, useEffect, useState} from 'react';
import {useQuery} from '@apollo/client';
import {shallowEqual, useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {Chip, CustomDropdown, Header} from '@jahia/moonstone';
import {ColumnsIcon} from './ColumnsIcon';
import {ContentTypesColumnsPicker} from './ContentTypesColumnsPicker';
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

    if (!contentType) {
        return <div className={styles.mainPane} data-sel-role="content-types-route"/>;
    }

    const type = data?.jcr?.nodeTypes?.nodes?.find(candidate => candidate.name === contentType);
    // What to call this type on screen, worked out once: the heading shows it and the create button
    // offers it by name, and the two must not disagree.
    const typeLabel = type?.displayName || contentType;

    return (
        <div className={styles.mainPane} data-sel-role="content-types-route">
            {/*
                Moonstone's own Header, which is what jContent's content list uses - see its
                ContentHeader. Taking the component rather than drawing a title and a row of
                controls by hand is what puts the rules in the same places on this screen as on
                every other one: one under the title, one under the toolbar. They are the Header's,
                not this module's, so they follow it rather than drifting from it.

                The type's system name goes in `contentType`, the slot jContent puts the node type
                chip in, rather than under the title as a caption - same information, same place
                a reader of the content list already looks for it.
            */}
            <Header
                title={typeLabel}
                contentType={<Chip color="accent" label={contentType}/>}
                toolbarLeft={
                    <ContentTypesToolBar
                        search={search}
                        contentType={contentType}
                        contentTypeLabel={typeLabel}
                        selection={selection}
                        onSearchChange={setSearch}
                        onClearSelection={clearSelection}
                    />
                }
                toolbarRight={
                    <CustomDropdown
                        variant="ghost"
                        icon={<ColumnsIcon/>}
                        aria-label={t('label.toolbar.columns')}
                        title={t('label.toolbar.columns')}
                        data-sel-role="toolbar-columns"
                    >
                        <ContentTypesColumnsPicker
                            lockedLabel={t('label.table.name')}
                            availableFields={columns.availableFields}
                            visibleFields={columns.visibleFields}
                            toggleField={columns.toggleField}
                            moveField={columns.moveField}
                            resetToDefaults={columns.resetToDefaults}
                        />
                    </CustomDropdown>
                }
            />
            {/*
                The table sits on its own surface, inset from a grey ground - jContent's own
                arrangement, where ContentLayout paints `--color-gray_light` and puts the table in
                a Paper over it. The grey showing around the edge is what separates the list from
                the chrome above it.

                This layer also holds the table to the height the header leaves rather than letting
                it run past the bottom of the pane, which is what `flex: 1 1 0` with `min-height: 0`
                is for.
            */}
            <div className={styles.contentArea}>
                <div className={styles.tablePaper}>
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
        </div>
    );
};

export default ContentTypesRoute;
