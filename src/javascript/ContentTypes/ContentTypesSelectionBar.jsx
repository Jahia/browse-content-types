import React, {useCallback, useMemo, useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Button, ButtonGroup, Cancel, ChevronDown, Separator, Typography} from '@jahia/moonstone';
import {DisplayAction, DisplayActions} from '@jahia/ui-extender';
import {ButtonRenderer, ButtonRendererNoLabel, ButtonRendererShortLabel} from '@jahia/jcontent';
import {ContentTypesBulkEditDialog} from './ContentTypesBulkEditDialog';
import {ContentTypesExportDialog} from './ContentTypesExportDialog';
import {BULK_MENU_ACTION} from './registerContentTypesBulkActions';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

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
 * account. This module's own bulk menu is handed more, since exporting the table means exporting it
 * as displayed; see `bulkContext` below and the contract in registerContentTypesBulkActions.
 */
export const ContentTypesSelectionBar = ({
    nodes,
    fields,
    availableFields,
    fieldsByKey,
    contentType,
    translatableFields,
    languages,
    onClear
}) => {
    const {t} = useTranslation(NAMESPACE);

    // Each entry in the menu opens a form, and an action's onClick has no React of its own to
    // render one in. So the bar owns the dialogs and hands each action the way to ask for one -
    // which keeps every entry in the menu a plain onClick rather than making one of them a
    // component and the rest not.
    const [isExporting, setIsExporting] = useState(false);
    const openExport = useCallback(() => setIsExporting(true), []);
    const closeExport = useCallback(() => setIsExporting(false), []);

    const [isEditing, setIsEditing] = useState(false);
    const openBulkEdit = useCallback(() => setIsEditing(true), []);
    const closeBulkEdit = useCallback(() => setIsEditing(false), []);

    // Every action branches on which of these two it was handed: a single `path` for one row, or
    // `paths` for several. Passing an array of one is not the same thing and makes some of them
    // treat one row as a bulk operation, which is how jContent draws the same distinction.
    //
    // Both are memoised because each action component is a PureComponent that re-runs its own node
    // lookups when its props change by identity. Rebuilt on every render, they would put every
    // action back to work each time anything above this re-rendered. jContent gets that for free:
    // its selection is an array held in redux, not one derived per render.
    const paths = useMemo(() => nodes.map(node => node.path), [nodes]);
    const context = useMemo(
        () => (paths.length === 1 ? {path: paths[0]} : {paths}),
        [paths]
    );

    // What this module's own operations get on top of the paths, and only they: jContent's actions
    // below are handed the plain context, since an action written against its bar has no idea what
    // these are and there is nothing to gain from surprising it with the extra props.
    //
    // Memoised for the same reason `paths` is - the menu is a PureComponent, and an object rebuilt
    // on every render would reopen its whole item list each time anything above this re-rendered.
    const bulkContext = useMemo(
        () => ({...context, nodes, fields, contentType, t, openExport, openBulkEdit}),
        [context, nodes, fields, contentType, t, openExport, openBulkEdit]
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

            {/* Everything that acts on the selection without publishing it: jContent's own actions
                as loose buttons, then this module's, gathered behind one trigger rather than laid
                out beside them, where they would bury the two that matter most. */}
            <div className={styles.selectionActions}>
                <Separator variant="vertical"/>
                <DisplayActions
                    target="selectedContentActions"
                    {...context}
                    // Publishing and permanent deletion are laid out on their own below, where they
                    // read as the decisions they are rather than as two more buttons in the row.
                    // Without this they would each render twice.
                    filter={action => action.key !== 'deletePermanently' && !action.key.includes('publish')}
                    buttonProps={{size: 'default', variant: 'ghost'}}
                    render={ButtonRenderer}
                />
                {/*
                    This module's own bulk operations, which are registered actions in a target of
                    its own rather than a list written out here - so another module can add to the
                    menu once this one is deployed. `iconEnd` goes through `buttonProps` because the
                    exported ButtonRenderer drops the `buttonIconEnd` that jContent's composed
                    menuAction sets, and the trigger needs to look like the menu it is.
                */}
                <DisplayAction
                    menuUseElementAnchor
                    actionKey={BULK_MENU_ACTION}
                    {...bulkContext}
                    render={ButtonRenderer}
                    buttonProps={{
                        size: 'default',
                        variant: 'ghost',
                        iconEnd: <ChevronDown/>,
                        'data-sel-role': 'bulk-actions'
                    }}
                />
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

            {/* Mounted only while open, so the queries behind it are not run for a menu nobody
                opened, and so a cancelled form does not keep what was typed into it. */}
            {isEditing && (
                <ContentTypesBulkEditDialog
                    isOpen
                    nodes={nodes}
                    availableFields={availableFields}
                    visibleFields={fields}
                    onClose={closeBulkEdit}
                />
            )}
            {isExporting && (
                <ContentTypesExportDialog
                    isOpen
                    nodes={nodes}
                    contentType={contentType}
                    visibleFields={fields}
                    availableFields={availableFields}
                    fieldsByKey={fieldsByKey}
                    translatableFields={translatableFields}
                    languages={languages}
                    onClose={closeExport}
                />
            )}
        </div>
    );
};

ContentTypesSelectionBar.propTypes = {
    translatableFields: PropTypes.array,
    languages: PropTypes.array,
    /** The rows currently ticked, in the shape the table fetched them. Never empty: the bar is not
     *  rendered without a selection, and the publish choice below has no answer for no rows. */
    nodes: PropTypes.array.isRequired,
    /** The visible columns, in the reader's order - what an export starts from. */
    fields: PropTypes.array.isRequired,
    /** The whole catalog, so a column can be exported without being shown in the table first. */
    availableFields: PropTypes.array.isRequired,
    fieldsByKey: PropTypes.instanceOf(Map).isRequired,
    /** The type being listed, which names an exported file. */
    contentType: PropTypes.string.isRequired,
    onClear: PropTypes.func.isRequired
};

export default ContentTypesSelectionBar;
