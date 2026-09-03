import React from 'react';
import {useTranslation} from 'react-i18next';
import {useQuery} from '@apollo/client';
import {shallowEqual, useDispatch, useSelector} from 'react-redux';
import {Button, Close, Loader, Typography} from '@jahia/moonstone';
import {GET_PREVIEW_TARGET} from './ContentTypes.gql';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The action that opens this writes a path into jContent's own redux, and this is what reads it.
 *
 * `cmSetSidePanelSelection` is not exported, so the action type is dispatched by name to close the
 * panel again - it is `CM_SET_SIDE_PANEL_SELECTION` with the path as its payload, and null to clear.
 * jContent's reducer for it is registered on the shared store, so the two sides agree without this
 * module importing anything private.
 */
const CLOSE_ACTION = {type: 'CM_SET_SIDE_PANEL_SELECTION', payload: null};

/**
 * What jContent's Preview action shows, in an accordion that has no preview drawer of its own.
 *
 * jContent's action dispatches a path into redux and its own `ContentRoute` renders the drawer that
 * answers. That drawer is not part of jContent's federated surface, so in this accordion the action
 * used to fire into nothing at all - the menu entry appeared to do nothing. This is the other half
 * of it.
 *
 * **What actually gets rendered is the node's `displayableNode`, not always the node itself.** The
 * render servlet answers for content that can stand on its own and **404s for anything that cannot**
 * - measured on a site, an estate in the Content branch renders in full while a highlight number
 * living inside a page's area answers 404. `displayableNode` is core's own probe for that question,
 * and for the sub-component it resolves to the page hosting it, which renders. Where a node is
 * displayable in its own right the two are the same path and this changes nothing.
 */
export const ContentTypesPreviewPanel = () => {
    const {t} = useTranslation(NAMESPACE);
    const dispatch = useDispatch();
    const {path, language} = useSelector(state => ({
        path: state.jcontent.sidePanelSelection,
        language: state.language
    }), shallowEqual);

    const {data, loading} = useQuery(GET_PREVIEW_TARGET, {
        variables: {path, language},
        skip: !path
    });

    if (!path) {
        return null;
    }

    const node = data?.jcr?.nodeByPath;
    const target = node?.displayableNode?.path;

    // The context path rather than a bare absolute URL: Jahia is not always at the root, and the
    // app shell publishes where it is.
    const contextPath = window.contextJsParameters?.contextPath ?? '';
    const source = target && `${contextPath}/cms/render/default/${language}${target}.html`;

    return (
        <aside className={styles.previewPanel} data-sel-role="preview-panel">
            <header className={styles.previewHeader}>
                <Typography isNowrap variant="subheading" weight="bold" title={node?.displayName || path}>
                    {node?.displayName || path.split('/').pop()}
                </Typography>
                <div className={styles.toolBarSpacer}/>
                <Button
                    variant="ghost"
                    size="default"
                    icon={<Close/>}
                    title={t('label.preview.close')}
                    data-sel-role="preview-close"
                    onClick={() => dispatch(CLOSE_ACTION)}
                />
            </header>

            {/* Said plainly when the thing on screen is the page around the record rather than the
                record itself, so nobody reads a whole page as being the row they clicked. */}
            {target && target !== path && (
                <Typography variant="caption" className={styles.previewNote} data-sel-role="preview-in-page">
                    {t('label.preview.inPage')}
                </Typography>
            )}

            {loading && <Loader size="big" classNameWrapper={styles.centered}/>}

            {!loading && !source && (
                <Typography variant="body" className={styles.message} data-sel-role="preview-unavailable">
                    {t('label.preview.unavailable')}
                </Typography>
            )}

            {!loading && source && (
                <iframe
                    className={styles.previewFrame}
                    src={source}
                    title={node?.displayName || path}
                    data-sel-role="preview-frame"
                />
            )}
        </aside>
    );
};

export default ContentTypesPreviewPanel;
