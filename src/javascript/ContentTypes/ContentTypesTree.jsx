import React, {useEffect, useMemo} from 'react';
import {useQuery} from '@apollo/client';
import {shallowEqual, useDispatch, useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {registry} from '@jahia/ui-extender';
import {Loader, TreeView, Typography} from '@jahia/moonstone';
import {GET_LISTED_TYPES, GET_SITE_CONTENT_TYPES} from './ContentTypes.gql';
import {ACCORDION_KEY} from './registerContentTypesAccordion';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * Navigates through jContent's own action, which turns a selection into a URL. That is what puts
 * the choice in the address bar, lets jContent remember it per site, and lets the main pane read
 * it back. jContent keeps the action private but publishes it on the registry for this use.
 */
const useGoto = site => {
    const dispatch = useDispatch();
    return typeName => {
        const goto = registry.get('redux-action', 'jcontentGoto');
        if (goto) {
            // The searchPath param rides along because jContent's search dialog takes its
            // location from it, falling back to the accordion's path - which here is a node type
            // name, not somewhere it could search. Setting it points the dialog at the site.
            dispatch(goto.action({
                mode: ACCORDION_KEY,
                path: '/' + typeName,
                params: {searchPath: `/sites/${site}`}
            }));
        }
    };
};

export const ContentTypesTree = () => {
    const {t} = useTranslation(NAMESPACE);

    // Read from the store rather than window.contextJsParameters: jContent is a single page app,
    // so the site can change without a page load, and the global would then be stale.
    const {site, language, path} = useSelector(state => ({
        site: state.site,
        language: state.language,
        path: state.jcontent.path
    }), shallowEqual);

    const goto = useGoto(site);

    const {data, loading, error} = useQuery(GET_SITE_CONTENT_TYPES, {
        variables: {siteKey: site, language},
        skip: !site
    });

    // The administrator's choice of which types to list, if one was ever made.
    const settings = useQuery(GET_LISTED_TYPES, {
        variables: {sitePath: `/sites/${site}`},
        skip: !site
    });

    const selected = (path || '/').substring(1);

    const listed = settings.data?.jcr?.nodeByPath?.listedTypes?.values;

    const types = useMemo(() => {
        const available = data?.jcr?.nodeTypes?.nodes || [];
        // With a choice stored, that choice wins outright, which is how a type Jahia does not flag
        // as editorial gets listed. With none stored, the editorial ones are the sane default.
        const chosen = listed?.length > 0 ?
            available.filter(type => listed.includes(type.name)) :
            available.filter(type => type.editorial);

        return [...chosen].sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
    }, [data, listed]);

    // Opening the accordion lands on '/' when nothing was visited before, so select the first
    // type, the way every other accordion opens on its first entry rather than on nothing.
    const first = (!loading && !error && !selected) ? types[0]?.name : undefined;

    useEffect(() => {
        if (first) {
            goto(first);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [first]);

    if (loading || settings.loading || first) {
        return <Loader size="big" classNameWrapper={styles.centered}/>;
    }

    if (error) {
        return (
            <Typography className={styles.message} variant="body">
                {t('label.typesError')}
            </Typography>
        );
    }

    if (types.length === 0) {
        return (
            <Typography className={styles.message} variant="body" data-sel-role="no-types">
                {t('label.noTypes')}
            </Typography>
        );
    }

    const treeData = types.map(type => ({
        id: type.name,
        label: type.displayName || type.name,
        isSelectable: true,
        treeItemProps: {
            'data-sel-role': 'content-type-item',
            'data-sel-content-type': type.name,
            title: type.name
        }
    }));

    return (
        <TreeView isReversed
                  data={treeData}
                  selectedItems={selected ? [selected] : []}
                  data-sel-role="content-types-tree"
                  onClickItem={type => goto(type.id)}
        />
    );
};

export default ContentTypesTree;
