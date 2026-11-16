import React, {useMemo} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Button, ButtonGroup, Cancel, ChevronDown, Separator, Typography} from '@jahia/moonstone';
import {DisplayAction, DisplayActions} from '@jahia/ui-extender';
import {BulkActionsMenu, ButtonRenderer, ButtonRendererNoLabel, ButtonRendererShortLabel} from '@jahia/jcontent';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';
import {exportColumnsFor} from './ContentTypesExportColumns';

/**
 * Whether the selection publishes as it stands, or has to take its subtree with it.
 *
 * A folder's own node holds nothing an editor sees, so publishing it alone would report success
 * while leaving its contents unpublished - jContent answers that with publishAll, and decides it by
 * asking about the same three types. A page is exempt because publishing one is already understood
 * to mean the page rather than the site beneath it. The two flags come from the rows the table has
 * already fetched, so choosing between the two costs no request of its own.
 */
const publishActionFor = nodes => (
    nodes.every(node => node.isPage || !node.isFolder) ? 'publish' : 'publishAll'
);

/**
 * What can be done to the rows currently ticked.
 *
 * The actions are jContent's own, taken from the same `selectedContentActions` target its content
 * list fills its own bulk bar from, so copy, cut, export, zip, delete and the rest behave here
 * exactly as they do there, and gain whatever is added to that target later. Only the arrangement is
 * this module's: the target is a registry key rather than an imported component, and jContent's bar
 * is not part of its public API.
 *
 * Each of jContent's actions goes and fetches whatever it needs to know about the nodes itself,
 * given nothing but the paths below - which is why the selection needs to carry nothing on their
 * account.
 *
 * The Bulk menu is jContent's too: its `BulkActionsMenu`, filled from the `bulkActions` registry
 * target any module can register into. Its entries are handed more than the paths, because
 * re-reading the rows from their paths would be a second query whose answer could differ from what
 * the reader is looking at:
 *
 *   nodes        the selected rows, in the shape ContentTypesRecordQuery fetched them
 *   contentType  the type being listed
 *
 * jContent draws the menu's button only while an entry applies to the selection, and a jContent
 * that does not export the menu yet leaves this bar without one.
 */
export const ContentTypesSelectionBar = ({nodes, contentType, visibleFields, onClear}) => {
    const {t} = useTranslation(NAMESPACE);

    // Every action branches on which of these two it was handed: a single `path` for one row, or
    // `paths` for several. Passing an array of one is not the same thing and makes some of them
    // treat one row as a bulk operation, which is how jContent draws the same distinction.
    //
    // Both are memoised because each action component is a PureComponent that re-runs its own node
    // lookups when its props change by identity. Rebuilt on every render, they would put every
    // action back to work each time anything above this re-rendered. jContent gets that for free:
    // its selection is an array held in redux, not one derived per render.
    const paths = useMemo(() => nodes.map(node => node.path), [nodes]);
    const exportColumns = useMemo(() => exportColumnsFor(visibleFields), [visibleFields]);
    const context = useMemo(
        () => (paths.length === 1 ? {path: paths[0]} : {paths}),
        [paths]
    );

    return (
        <div className={styles.selectionBar} data-sel-role="selection-actions-bar">
            {/*
                A count, where jContent puts a dropdown listing each selected node by name. It
                needs that list because its own selection outlives what is on screen - it survives
                expanding the tree and switching view - so a row can be selected with no checkbox in
                sight to untick. Here the selection is only ever the rows of the page being looked
                at, by construction, so the list would name what is already visible and ticked, and
                the count is the part that is actually worth saying. The wording is jContent's own,
                plural forms included.
            */}
            <Typography
                variant="body"
                data-sel-role="selection-infos"
                data-sel-selection-size={paths.length}
            >
                {t('jcontent:label.contentManager.selection.itemsSelected', {count: paths.length})}
            </Typography>
            <Button
                variant="ghost"
                size="default"
                icon={<Cancel/>}
                label={t('jcontent:label.contentManager.selection.clearMultipleSelection')}
                data-sel-role="clearSelection"
                onClick={onClear}
            />

            {/* Everything that acts on the selection without publishing it: jContent's own
                actions as loose buttons, then its Bulk menu. */}
            <div className={styles.selectionActions}>
                <Separator variant="vertical"/>
                <DisplayActions
                    target="selectedContentActions"
                    {...context}
                    // Publishing and permanent deletion are laid out on their own below, where they
                    // read as the decisions they are rather than as two more buttons in the row.
                    // Without this they would each render twice.
                    filter={action => action.key !== 'deletePermanently' && action.key !== 'export' && !action.key.includes('publish')}
                    buttonProps={{size: 'default', variant: 'ghost'}}
                    render={ButtonRenderer}
                />
                {/* jContent's export, started from the columns the table shows. Rendered on its own
                    so that only the export receives these props. */}
                <DisplayAction
                    actionKey="export"
                    {...context}
                    contentType={contentType}
                    exportColumns={exportColumns}
                    buttonProps={{size: 'default', variant: 'ghost'}}
                    render={ButtonRenderer}
                />
                {BulkActionsMenu && (
                    <BulkActionsMenu
                        paths={paths}
                        nodes={nodes}
                        contentType={contentType}
                    />
                )}
            </div>

            <Separator variant="vertical"/>
            <ButtonGroup size="default" variant="outlined" color="accent">
                <DisplayAction
                    isMediumLabel
                    actionKey={publishActionFor(nodes)}
                    {...context}
                    render={ButtonRendererShortLabel}
                />
                <DisplayAction
                    menuUseElementAnchor
                    actionKey="publishMenu"
                    buttonProps={{icon: <ChevronDown/>}}
                    {...context}
                    render={ButtonRendererNoLabel}
                />
            </ButtonGroup>
            <DisplayAction actionKey="publishDeletion" {...context} render={ButtonRendererShortLabel}/>
            <DisplayAction actionKey="deletePermanently" {...context} render={ButtonRendererShortLabel}/>
        </div>
    );
};

ContentTypesSelectionBar.propTypes = {
    /** The rows currently ticked, in the shape the table fetched them. Never empty: the bar is not
     *  rendered without a selection, and the publish choice below has no answer for no rows. */
    nodes: PropTypes.array.isRequired,
    /** The type being listed, for the entries of the Bulk menu and the export file name. */
    contentType: PropTypes.string.isRequired,
    /** The columns the table shows, in the reader's order. */
    visibleFields: PropTypes.array,
    onClear: PropTypes.func.isRequired
};

export default ContentTypesSelectionBar;
