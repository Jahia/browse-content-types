import React, {useCallback, useEffect, useMemo, useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {useApolloClient, useQuery} from '@apollo/client';
import {Button, Folder, Layers, Loader, Modal, ModalBody, ModalFooter, ModalHeader, TreeView, Typography, toIconComponent} from '@jahia/moonstone';
import {GET_CHILD_CONTAINERS, GET_CREATABLE_TYPES, GET_EXISTING_PATHS} from './ContentTypes.gql';
import {readCreatableTypeNames} from './ContentTypesCreate';
import {branchesTo, childrenByParent, creatabilityPath, locationLabel, pickerRootPath} from './ContentTypesLocation';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The types Content Editor leaves out of a create by default.
 *
 * The same list the create action asks with, and for the same reason: the creatability question is
 * asked by this module and answered by Content Editor in the call that follows, so the two have to
 * agree. Named in both places rather than imported from one into the other because they are two
 * different questions about the same thing - may this type go here, and may it go there.
 */
const EXCLUDED_NODE_TYPES = ['jmix:studioOnly', 'jmix:hiddenType'];

/**
 * A node's own icon, or a generic one.
 *
 * The same reading `ContentTypesTree` does of a content type's icon, for the same reason: Jahia
 * answers with a path carrying no extension and with `nt_base` for anything nobody gave an icon to.
 * A folder falls back to a folder rather than to `Layers`, since that is what it is and the tree is
 * mostly folders.
 */
const nodeIcon = node => {
    const icon = node?.primaryNodeType?.icon;
    const url = icon ? `${icon}.png` : null;

    if (url && !url.endsWith('/nt_base.png')) {
        return toIconComponent(url);
    }

    return node?.primaryNodeType?.name === 'jnt:contentFolder' ? <Folder/> : <Layers/>;
};

/**
 * Where to store a new record, chosen out of the site's own content.
 *
 * **Opens on the convention folder and selects it**, so the reader who has no opinion confirms and
 * is where they always were - one extra keystroke, not a navigation task. Everything else in the
 * tree is there for the reader who does have an opinion, which is the whole point: a record's path
 * decides what can render it, who may edit it and where a colleague finds it, and this table shows
 * none of that because it lists by type.
 *
 * **Validated per selection rather than per node.** Whether a type may be created somewhere is
 * `forms.contentTypesAsTree`'s answer about that path, which is one request - so asking it of every
 * node on screen would be a request per row, on every expansion. It is asked about the one node the
 * reader actually picked, and Continue stays disabled until it comes back yes. That is also the same
 * question Content Editor itself will answer, so the picker cannot offer a location the editor then
 * refuses.
 *
 * **Lazily loaded, one branch at a time.** A site's content runs to thousands of nodes and a reader
 * opens a handful, so each expansion asks for just that branch - except the first, which asks for
 * every branch between the root and the convention folder at once, the criteria taking a list of
 * paths. See GET_CHILD_CONTAINERS.
 */
export const ContentTypesLocationPicker = ({
    contentType,
    contentTypeLabel,
    siteKey,
    language,
    uilang,
    defaultPath,
    onCancel,
    onConfirm
}) => {
    const {t} = useTranslation(NAMESPACE);
    const client = useApolloClient();
    const rootPath = pickerRootPath(siteKey);

    const [childrenOf, setChildrenOf] = useState({});
    const [loadingPaths, setLoadingPaths] = useState([]);
    const [failed, setFailed] = useState(false);
    const [selectedPath, setSelectedPath] = useState(defaultPath || null);
    const [openedItems, setOpenedItems] = useState(() => [rootPath, ...branchesTo(defaultPath, rootPath)]);

    /**
     * Fetches the children of some branches and files them under the branch each belongs to.
     *
     * Takes a list because the first load wants several at once - every branch between the root and
     * the convention folder - and an expansion wants exactly one. Branches already in hand are
     * dropped rather than asked for again, which is what stops a re-expansion costing a request.
     *
     * A branch that answers nothing is still recorded, as an empty list. That is what tells the tree
     * it is a leaf; without it an empty folder would keep its expand arrow for ever.
     */
    const loadBranches = useCallback(async paths => {
        const wanted = [...new Set(paths.filter(Boolean))].filter(path => !(path in childrenOf));
        if (wanted.length === 0) {
            return;
        }

        setLoadingPaths(current => [...current, ...wanted]);

        try {
            /*
             * Which of these are actually there, before anything is asked about their children.
             *
             * A branch the tree has never drawn may not exist: the picker opens on the convention
             * folder, and that folder is created with the first record of its type, so on a site
             * where none has been created it is a path rather than a place. Asking
             * nodesByCriteria about a parent that is not there does not answer empty - its
             * jnt:content arm raises PathNotFoundException, which nulls that arm for EVERY path
             * in the batch and, thrown, took the whole tree down with it. That is the "locations
             * could not be read" on a site that simply had nothing of this type yet.
             *
             * See GET_EXISTING_PATHS for why this reads the error rather than failing on it.
             */
            const {data: existing} = await client.query({
                query: GET_EXISTING_PATHS,
                variables: {paths: wanted},
                fetchPolicy: 'network-only',
                errorPolicy: 'all'
            });

            const present = new Set(
                (existing?.jcr?.nodesByPath || []).map(node => node?.path).filter(Boolean)
            );
            const askable = wanted.filter(path => present.has(path));

            // Nothing to ask about is not a failure - it is a branch with nothing under it, which
            // is recorded below exactly as an existing but empty one is.
            let found = {};
            if (askable.length > 0) {
                const {data} = await client.query({
                    query: GET_CHILD_CONTAINERS,
                    variables: {paths: askable, language: language || uilang || 'en'},
                    fetchPolicy: 'network-only'
                });

                found = childrenByParent(data);
            }

            setChildrenOf(current => {
                const next = {...current};
                // Every branch asked about is recorded, answered or not - see above. A branch that
                // does not exist is recorded too, as empty: it is a leaf, and leaving it out would
                // have the tree ask about it again on every render.
                wanted.forEach(path => {
                    next[path] = found[path] || [];
                });
                return next;
            });
        } catch {
            // The tree cannot be read. Said once, rather than leaving an expansion spinning for
            // ever with nothing to explain it.
            setFailed(true);
        } finally {
            setLoadingPaths(current => current.filter(path => !wanted.includes(path)));
        }
    }, [client, childrenOf, language, uilang]);

    // The first load: the root, and every branch down to whatever the picker opens on, in one
    // request. Runs once - `loadBranches` drops what it already holds, so a later render asking
    // again costs nothing.
    useEffect(() => {
        loadBranches([rootPath, ...branchesTo(defaultPath, rootPath)]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rootPath, defaultPath]);

    /*
     * Whether the chosen location will have this type.
     *
     * Asked of `creatabilityPath` rather than of the selection itself, because the convention folder
     * may not exist yet and an absent path answers "no" about the one place this module was always
     * going to use. See ContentTypesLocation.
     */
    const askAbout = creatabilityPath(selectedPath, {
        conventionPath: defaultPath,
        contentsPath: `${rootPath}/contents`
    });

    const {data: creatable, loading: isChecking} = useQuery(GET_CREATABLE_TYPES, {
        variables: {
            nodeTypes: [contentType],
            includeSubTypes: false,
            path: askAbout,
            uilang: uilang || 'en',
            excludedNodeTypes: EXCLUDED_NODE_TYPES
        },
        skip: !askAbout
    });

    const isAllowed = Boolean(askAbout) && !isChecking &&
        readCreatableTypeNames(creatable).includes(contentType);

    /**
     * The tree as Moonstone draws it, built from the branches loaded so far.
     *
     * `hasChildren` is true for anything not yet loaded, so every node offers an expand arrow until
     * it is opened and found to be a leaf. The alternative - asking each node whether it has
     * children before drawing it - is the per-node request this picker exists to avoid.
     */
    const treeData = useMemo(() => {
        const build = path => (childrenOf[path] || []).map(node => {
            const loaded = node.path in childrenOf;

            return {
                id: node.path,
                label: locationLabel(node),
                iconStart: nodeIcon(node),
                hasChildren: !loaded || childrenOf[node.path].length > 0,
                isLoading: loadingPaths.includes(node.path),
                children: loaded ? build(node.path) : [],
                treeItemProps: {
                    'data-sel-role': 'location-item',
                    'data-sel-location': node.path,
                    title: node.path
                }
            };
        });

        return build(rootPath);
    }, [childrenOf, loadingPaths, rootPath]);

    const isLoadingRoot = loadingPaths.includes(rootPath);

    /** What the footer says about the selection, which is the only thing that can block Continue. */
    const status = () => {
        if (!selectedPath) {
            return t('label.location.none');
        }

        if (isChecking) {
            return t('label.location.checking');
        }

        return isAllowed ?
            selectedPath :
            t('label.location.refused', {type: contentTypeLabel});
    };

    return (
        <Modal
            isOpen
            size="medium"
            className={styles.dialogBox}
            data-sel-role="location-dialog"
            onOpenChange={open => !open && onCancel()}
        >
            <>
                {/* The heading is ModalHeader's `title` PROP: Moonstone renders a header only when
                    that is set, so a heading passed as a child draws nothing at all, silently. */}
                <ModalHeader title={t('label.location.title', {type: contentTypeLabel})}/>
                <ModalBody>
                    <Typography variant="caption" className={styles.subtitle}>
                        {t('label.location.explanation', {type: contentTypeLabel})}
                    </Typography>

                    <div className={styles.locationTree} data-sel-role="location-tree">
                        {isLoadingRoot && <Loader size="big" classNameWrapper={styles.centered}/>}
                        {!isLoadingRoot && failed && (
                            <Typography variant="body" className={styles.message} data-sel-role="location-error">
                                {t('label.location.failed')}
                            </Typography>
                        )}
                        {!isLoadingRoot && !failed && (
                            <TreeView
                                data={treeData}
                                selectedItems={selectedPath ? [selectedPath] : []}
                                openedItems={openedItems}
                                size="small"
                                onOpenItem={node => {
                                    setOpenedItems(current => [...new Set([...current, node.id])]);
                                    loadBranches([node.id]);
                                }}
                                onCloseItem={node => setOpenedItems(current => current.filter(id => id !== node.id))}
                                onClickItem={node => setSelectedPath(node.id)}
                            />
                        )}
                    </div>

                    {/*
                        The path in full, and the reason when there is one. The same line does both
                        because they answer one question - can this go where you have pointed - and a
                        separate error line would leave the reader comparing two places on screen to
                        find out.
                    */}
                    <Typography
                        variant="caption"
                        className={styles.subtitle}
                        data-sel-role="location-selected"
                        data-sel-allowed={selectedPath ? String(isAllowed) : undefined}
                    >
                        {status()}
                    </Typography>
                </ModalBody>
                <ModalFooter>
                    <Button size="big" variant="ghost" label={t('label.location.cancel')} onClick={onCancel}/>
                    <Button
                        size="big"
                        variant="default"
                        color="accent"
                        label={t('label.location.confirm')}
                        disabled={!isAllowed}
                        data-sel-role="location-confirm"
                        onClick={() => onConfirm(selectedPath)}
                    />
                </ModalFooter>
            </>
        </Modal>
    );
};

ContentTypesLocationPicker.propTypes = {
    /** The type being created, which is what the creatable check asks about. */
    contentType: PropTypes.string.isRequired,

    /** The same type as the heading names it. */
    contentTypeLabel: PropTypes.string.isRequired,

    siteKey: PropTypes.string.isRequired,

    /** The language the records are being read in, which is what names the nodes in the tree. */
    language: PropTypes.string,

    /** The language of the interface, which is what the creatable check answers in. */
    uilang: PropTypes.string,

    /**
     * Where the picker opens, selected. The convention folder for a type that can live in one, and
     * nothing at all for a type that cannot - see ContentTypesCreateAction.
     */
    defaultPath: PropTypes.string,

    onCancel: PropTypes.func.isRequired,

    /** Given the chosen path, which is known to accept the type by the time this can be called. */
    onConfirm: PropTypes.func.isRequired
};

export default ContentTypesLocationPicker;
