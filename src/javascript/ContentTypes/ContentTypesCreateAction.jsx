import React, {useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {shallowEqual, useSelector} from 'react-redux';
import {useApolloClient, useQuery} from '@apollo/client';
import {Add, Button, Typography} from '@jahia/moonstone';
import {CREATE_CONTENT_FOLDER, GET_CONTENT_FOLDER, GET_CREATABLE_TYPES, GET_NODES_OF_TYPES, GET_TYPE_PARENTS} from './ContentTypes.gql';
import {foldersToEnsure, readCreatableTypeNames, siteContentsPath, typeFolderPath} from './ContentTypesCreate';
import {TARGET_CHOICE, TARGET_FOLDER, TARGET_NONE, TARGET_RESOLVING, TARGET_SINGLE, createRoute, parentTypeNames, targetsFrom} from './ContentTypesCreateTarget';
import {ContentTypesCreateTargetDialog} from './ContentTypesCreateTargetDialog';
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
 * What the button says about where the record will go, one per route.
 *
 * A table rather than a nested conditional in the JSX: there are four routes and the tooltip is the
 * only thing that differs between three of them. Every key is given every interpolation it might
 * want, i18next ignoring what a string does not use.
 */
const TOOLTIPS = {
    folder: 'jcontent:label.contentEditor.CMMActions.createNewContent.tooltipForType',
    single: 'label.createTarget.tooltip',
    choice: 'label.createTarget.tooltip',
    resolving: 'label.createTarget.resolving',
    none: 'label.create.refused'
};

/**
 * Create a record of the type being listed.
 *
 * **Nothing is asked.** The record goes into a folder named after its type, inside this module's own
 * folder under the site's content folder, and whichever of those two is missing is made on the way in
 * - see typeFolderPath and foldersToEnsure. One click from wanting a record to editing one, no
 * location to answer for, and nothing the editor is committed to: content moves, so a record filed
 * here can be put anywhere afterwards.
 *
 * **The creatable check is ours, and it has to be.** CE_API.create resolves what may be created at
 * the path it is given and then branches on one type and on several - and does nothing whatsoever
 * for none. A type that cannot live in a content folder therefore produces no editor, no error and no
 * callback: a button that looks broken precisely when the editor most needs to be told why. So the
 * same question is asked first, through forms.contentTypesAsTree.
 *
 * **Asked up front, and of the site's content folder rather than of the type's own.** Two reasons,
 * and they come to the same thing. The type folder does not exist until the first record of that
 * type is created, and contentTypesAsTree answers an empty list for a path that is not there - so
 * asking it of that folder means creating the folder first, which is how a refused create came to
 * leave an empty folder behind for a type that can never use it. And the answer does not depend on
 * which of the two is asked: both are jnt:contentFolder, and what decides this is the parent's
 * child node definitions. Verified against a site - estate, blogPost, agency and textIllustrated
 * each answer the same at the site content folder as at their own.
 *
 * So the question is asked once, when the type is chosen, of a folder that is always there. Nothing
 * is created before the answer is known, and a type that cannot be created here says so on a
 * disabled button rather than on a click that has already made two folders.
 *
 * **A type a content folder will not hold is filed where its own kind already live.** The refusal is
 * genuine - a type constrained to a declaring parent has no home in a content folder, and the
 * repository says so outright - but it is not the end of the question. Where records of the type
 * already exist, the KINDS of node holding them are inferred and every node of those kinds in the
 * site becomes a candidate: one is filed into without asking, several are asked about, none leaves
 * the button disabled with the reason on it. See ContentTypesCreateTarget, which carries the
 * reasoning and the one limit - a type with no records anywhere has nothing to infer from.
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

    /*
     * Whether a record of this type can be created in a content folder at all, asked of the one
     * folder that is always there. See the note above for why it is that folder and not the type's.
     *
     * A standing query rather than a call at click time: the answer decides whether the button is
     * offered, so it has to be in hand before anybody clicks.
     */
    const {data: creatable, loading: isChecking} = useQuery(GET_CREATABLE_TYPES, {
        variables: {
            nodeTypes: [contentType],
            // Explicitly false. Content Editor reads an absent value as true, and a subtype
            // resolved alongside the type asked for would open the type selector for what the
            // editor meant as one choice they had already made.
            includeSubTypes: false,
            path: siteContentsPath(site),
            uilang: uilang || 'en',
            excludedNodeTypes: EXCLUDED_NODE_TYPES
        },
        skip: !site || !contentType
    });

    const isCreatable = readCreatableTypeNames(creatable).includes(contentType);

    /*
     * Where else this type could go, asked only when a content folder will not hold it.
     *
     * Two steps, because the repository cannot be asked "what holds a luxe:estate": the records of
     * the type report their parents' kinds, and then every node of that kind in the site is a
     * candidate. Skipped entirely for the ordinary case - a droppable type costs neither request.
     */
    const {data: parentsData, loading: isFindingParents} = useQuery(GET_TYPE_PARENTS, {
        variables: {sitePath: `/sites/${site}`, type: contentType, language},
        skip: !site || !contentType || isChecking || isCreatable
    });

    const parentTypes = parentTypeNames(parentsData);

    const {data: containersData, loading: isFindingContainers} = useQuery(GET_NODES_OF_TYPES, {
        variables: {sitePath: `/sites/${site}`, type: parentTypes[0], language},
        skip: !site || parentTypes.length === 0
    });

    const targets = targetsFrom(containersData);

    // Everything the label, the tooltip, the disabled state and the click need, as one answer.
    const route = createRoute({
        isCreatable,
        isCheckingFolder: isChecking,
        isFindingParents,
        isFindingContainers,
        parentTypes,
        targets
    });

    const [isChoosing, setIsChoosing] = useState(false);

    const api = typeof window === 'undefined' ? null : window.CE_API;

    // Nothing to offer without the editor that would do the creating. Drawn as nothing rather than as
    // a disabled button: a control that can never become enabled only asks to be clicked.
    if (!api?.create) {
        return null;
    }

    /**
     * The folders the record needs, made where they are not there.
     *
     * Each is asked for and then created on the error, which is how the tasks container is handled in
     * ContentTypesAssignDialog: `nodeByPath` on a missing node is an error rather than a null. A
     * failure to create is left to the caller - a folder not being there is the one thing that makes
     * the create below pointless.
     *
     * One at a time and in order, deliberately: the type's folder cannot be created until the folder
     * it goes in exists, so there is nothing here to run in parallel.
     */
    const ensureFolders = async () => {
        for (const folder of foldersToEnsure(site, contentType)) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await client.query({
                    query: GET_CONTENT_FOLDER,
                    variables: {path: folder.path},
                    fetchPolicy: 'network-only'
                });
            } catch {
                // eslint-disable-next-line no-await-in-loop
                await client.mutate({
                    mutation: CREATE_CONTENT_FOLDER,
                    variables: {parentPath: folder.parentPath, name: folder.name}
                });
            }
        }
    };

    /**
     * Opens Content Editor on a container already known to accept the type.
     *
     * Shared by both routes that end in a create - the module's own folder, and a container found
     * for a type that folder will not hold - so the two cannot come to hand the editor different
     * things.
     */
    const openEditor = path => {
        api.create({
            path,
            nodeTypes: [contentType],
            includeSubTypes: false,
            lang: language,
            // The table is reading a page of this very type, so a record created into it belongs
            // on screen. Asked for by query name, as the undo does, rather than through the
            // refetcher registry: this is one known query, not a sweep of everything registered.
            createCallback: () => client.refetchQueries({include: ['getContentByType']})
        });
    };

    /**
     * The ordinary route: this module's own folder, made on the way in.
     *
     * Only the folders are created here, and only once the type is known to be able to live in one -
     * which is why a refusal no longer leaves an empty folder behind.
     */
    const createInFolder = async () => {
        setIsWorking(true);
        setProblem(null);

        try {
            await ensureFolders();
            openEditor(folderPath);
        } catch {
            // The folder could not be made, or the question could not be asked. Either way there is
            // no form coming, and saying so is better than a click that does nothing.
            setProblem('failed');
        } finally {
            setIsWorking(false);
        }
    };

    /**
     * What a click does, which depends on where this type can go.
     *
     * Nothing is created and nothing is asked for the ordinary case beyond what always was. The two
     * other routes belong to a type a content folder will not hold: one container is used without a
     * question, several put the question to the reader.
     */
    const create = () => {
        if (route.kind === TARGET_FOLDER) {
            createInFolder();
            return;
        }

        if (route.kind === TARGET_SINGLE) {
            // No folders to make: the container is somebody else's node, already there.
            openEditor(route.target.path);
            return;
        }

        if (route.kind === TARGET_CHOICE) {
            setIsChoosing(true);
        }
    };

    return (
        <>
            <Button
                size="default"
                // Ghost, among ghost buttons: nothing on this line claims more weight than the
                // rest of it.
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
                /*
                 * Where the record will go, said before the click rather than discovered after it.
                 * Three answers, because there are three routes: this module's folder, a container
                 * that holds this type's own kind, or nowhere - and a disabled control with no
                 * reason given is its own puzzle.
                 */
                title={t(TOOLTIPS[route.kind], {
                    typeName: contentTypeLabel,
                    type: contentTypeLabel,
                    parent: folderPath,
                    path: folderPath
                })}
                disabled={isWorking || route.kind === TARGET_RESOLVING || route.kind === TARGET_NONE}
                data-sel-role="create-action"
                data-sel-target-kind={route.kind}
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

            {isChoosing && (
                <ContentTypesCreateTargetDialog
                    contentTypeLabel={contentTypeLabel}
                    targets={targets}
                    onCancel={() => setIsChoosing(false)}
                    onConfirm={path => {
                        setIsChoosing(false);
                        openEditor(path);
                    }}
                />
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
