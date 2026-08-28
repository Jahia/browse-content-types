import React, {useEffect, useState} from 'react';
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
    const {site, language, path} = useSelector(state => ({
        site: state.site,
        language: state.language,
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
        variables: {siteKey: site, language},
        skip: !site
    });

    // Owned here rather than inside the table or the toolbar: the toolbar renders the picker, the
    // table renders the columns it chose, and neither can do that from the other's own state.
    const columns = useContentTypeColumns(contentType);

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
                lockedLabel={t('label.table.name')}
                availableFields={columns.availableFields}
                visibleFields={columns.visibleFields}
                isDirty={columns.isDirty}
                toggleField={columns.toggleField}
                moveField={columns.moveField}
                saveAsDefault={columns.saveAsDefault}
                onSearchChange={setSearch}
            />
            <ContentTypesTable contentType={contentType} search={search} visibleFields={columns.visibleFields}/>
        </div>
    );
};

export default ContentTypesRoute;
