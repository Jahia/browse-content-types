import React, {useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {shallowEqual, useSelector} from 'react-redux';
import {useApolloClient} from '@apollo/client';
import {Add, Button, Typography} from '@jahia/moonstone';
import {CREATE_CONTENT_FOLDER, GET_CONTENT_FOLDER, GET_CREATABLE_TYPES} from './ContentTypes.gql';
import {readCreatableTypeNames, siteContentsPath, typeFolderName, typeFolderPath} from './ContentTypesCreate';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The types Content Editor leaves out of a create by default.
 *
 * Named here rather than left to Content Editor's own default because the creatability question is
 * asked by this module, in its own query, and answered by Content Editor in the call that follows.
 * Two defaults that have to agree, in two codebases, is how they come to disagree.
 */
const EXCLUDED_NODE_TYPES = ['jmix:studioOnly', 'jmix:hiddenType'];

/**
 * Create a record of the type being listed.
 *
 * **Nothing is asked.** The record goes into a folder named after its type, under the site's content
 * folder, and that folder is made on the way in if it is not there yet - see typeFolderPath. One
 * click from wanting a record to editing one, no location to answer for, and nothing the editor is
 * committed to: content moves, so a record filed here can be put anywhere afterwards.
 *
 * **The creatable check is ours, and it has to be.** CE_API.create resolves what may be created at
 * the path it is given and then branches on one type and on several - and does nothing whatsoever
 * for none. A type that cannot live in a content folder therefore produces no editor, no error and no
 * callback: a button that looks broken precisely when the editor most needs to be told why. So the
 * same question is asked first, through forms.contentTypesAsTree, and the refusal is said out loud.
 *
 * Content Editor does the creating. It owns the mandatory fields, the system name, the
 * unsaved-changes guard and the translations of all of it; a create form of this module's own would
 * be a second one to keep in step. The API for that is window.CE_API, which is a window global
 * rather than published API - so, as with the selector types the bulk dialog borrows, its absence is
 * something to say rather than to crash on.
 */
export const ContentTypesCreateAction = ({contentType, contentTypeLabel}) => {
    const {t} = useTranslation(NAMESPACE);
    const client = useApolloClient();
    const {site, language, uilang} = useSelector(state => ({
        site: state.site,
        language: state.language,
        uilang: state.uilang
    }), shallowEqual);

    const [isWorking, setIsWorking] = useState(false);
    // One of 'refused' or 'failed', or nothing. Two messages rather than one because they ask
    // different things of the reader: a refusal is about this type and will not come right on a
    // second click, where a failure might.
    const [problem, setProblem] = useState(null);

    const folderPath = typeFolderPath(site, contentType);

    const api = typeof window === 'undefined' ? null : window.CE_API;

    // Nothing to offer without the editor that would do the creating. Drawn as nothing rather than as
    // a disabled button: a control that can never become enabled only asks to be clicked.
    if (!api?.create) {
        return null;
    }

    /**
     * The type's folder, made if it is not there.
     *
     * Asked for and then created on the error, which is how the tasks container is handled in
     * ContentTypesAssignDialog: `nodeByPath` on a missing node is an error rather than a null. A
     * failure to create is left to the caller - the folder not being there is the one thing that
     * makes the create below pointless.
     */
    const ensureFolder = async () => {
        try {
            await client.query({
                query: GET_CONTENT_FOLDER,
                variables: {path: folderPath},
                fetchPolicy: 'network-only'
            });
        } catch {
            await client.mutate({
                mutation: CREATE_CONTENT_FOLDER,
                variables: {
                    parentPath: siteContentsPath(site),
                    name: typeFolderName(contentType)
                }
            });
        }
    };

    const create = async () => {
        setIsWorking(true);
        setProblem(null);

        try {
            await ensureFolder();

            const {data: creatable} = await client.query({
                query: GET_CREATABLE_TYPES,
                variables: {
                    nodeTypes: [contentType],
                    // Explicitly false. Content Editor reads an absent value as true, and a subtype
                    // resolved alongside the type asked for would open the type selector for what the
                    // editor meant as one choice they had already made.
                    includeSubTypes: false,
                    path: folderPath,
                    uilang: uilang || 'en',
                    excludedNodeTypes: EXCLUDED_NODE_TYPES
                },
                // Asked of the folder as it stands, which a moment ago may not have existed at all.
                fetchPolicy: 'network-only'
            });

            if (!readCreatableTypeNames(creatable).includes(contentType)) {
                setProblem('refused');
                return;
            }

            api.create({
                path: folderPath,
                nodeTypes: [contentType],
                includeSubTypes: false,
                lang: language,
                // The table is reading a page of this very type, so a record created into it belongs
                // on screen. Asked for by query name, as the undo does, rather than through the
                // refetcher registry: this is one known query, not a sweep of everything registered.
                createCallback: () => client.refetchQueries({include: ['getContentByType']})
            });
        } catch {
            // The folder could not be made, or the question could not be asked. Either way there is
            // no form coming, and saying so is better than a click that does nothing.
            setProblem('failed');
        } finally {
            setIsWorking(false);
        }
    };

    return (
        <>
            <Button
                size="default"
                // Ghost, among ghost buttons, on purpose: the one filled control on this line is the
                // undo, which is an offer that expires and has to be seen while it stands. See
                // ContentTypesUndoAction.
                variant="ghost"
                icon={<Add/>}
                /*
                 * The wording is jContent's, and so are the keys. A content folder restricted to one
                 * type offers "New <type>", and this is the same offer about the same thing, so it
                 * says the same words - and picks up the translations that string already has rather
                 * than starting a second set here. The selection bar borrows from that namespace for
                 * the same reason.
                 */
                label={t('jcontent:label.contentManager.create.contentOfType', {typeName: contentTypeLabel})}
                title={t('jcontent:label.contentEditor.CMMActions.createNewContent.tooltipForType', {
                    typeName: contentTypeLabel,
                    parent: folderPath
                })}
                disabled={isWorking}
                data-sel-role="create-action"
                onClick={create}
            />
            {problem && (
                <Typography
                    variant="caption"
                    className={styles.createProblem}
                    data-sel-role="create-problem"
                    data-sel-problem={problem}
                >
                    {t(`label.create.${problem}`, {path: folderPath})}
                </Typography>
            )}
        </>
    );
};

ContentTypesCreateAction.propTypes = {
    /** The type being listed, which is the type that gets created. */
    contentType: PropTypes.string.isRequired,
    /**
     * The same type as the heading names it - its display name, falling back to the type name. Only
     * the button says it; everything else here works from `contentType`, the name being a label and
     * not an identifier.
     */
    contentTypeLabel: PropTypes.string.isRequired
};

export default ContentTypesCreateAction;
