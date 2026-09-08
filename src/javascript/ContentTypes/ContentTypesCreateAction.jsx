import React, {useMemo, useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {shallowEqual, useSelector} from 'react-redux';
import {useApolloClient, useQuery} from '@apollo/client';
import {Add, Button, Typography} from '@jahia/moonstone';
import {GET_CREATABLE_TYPES, GET_RECORD_PARENTS} from './ContentTypes.gql';
import {typeCountQuery} from './ContentTypesCounts';
import {proposeParentPath, readCreatableTypeNames} from './ContentTypesCreate';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * How many existing records are read to work out where this type tends to live.
 *
 * A sample, not the set: the answer wanted is the common parent, which a few dozen paths already
 * show. Reading every record of a type that has thousands would be a page of work thrown away.
 */
const PARENT_SAMPLE_SIZE = 50;

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
 * **The location is chosen, not inferred.** Why, and how the proposal is arrived at, is in
 * ContentTypesCreate - the short of it being that a record's path is meaningful in a way a task's is
 * not, and that this table cannot show a mistake about it, because it lists by type and not by
 * place. So the picker opens, positioned on where records of this type already sit, and the editor
 * confirms with one click or moves it with two.
 *
 * **The creatable check is ours, and it has to be.** CE_API.create resolves what may be created at
 * the path it is given and then branches on one type and on several - and does nothing whatsoever
 * for none. A type that cannot live at the chosen path therefore produces no editor, no error and no
 * callback: a button that looks broken precisely when the editor most needs to be told why. So the
 * same question is asked first, through forms.contentTypesAsTree, and the refusal is said out loud.
 *
 * Content Editor does the creating. It owns the mandatory fields, the system name, the
 * unsaved-changes guard and the translations of all of it; a create form of this module's own would
 * be a second one to keep in step. The API for that is window.CE_API, which is a window global
 * rather than published API - so, as with the selector types the bulk dialog borrows, its absence is
 * something to say rather than to crash on.
 */
export const ContentTypesCreateAction = ({contentType}) => {
    const {t} = useTranslation(NAMESPACE);
    const client = useApolloClient();
    const {site, language, uilang} = useSelector(state => ({
        site: state.site,
        language: state.language,
        uilang: state.uilang
    }), shallowEqual);

    const [isResolving, setIsResolving] = useState(false);
    // The path a create was refused at, which is the only thing worth saying about the refusal - the
    // type is already the heading of the page.
    const [refusedAt, setRefusedAt] = useState(null);

    const {data} = useQuery(GET_RECORD_PARENTS, {
        variables: {
            query: typeCountQuery(contentType, `/sites/${site}`),
            limit: PARENT_SAMPLE_SIZE
        },
        skip: !site || !contentType
    });

    const proposedPath = useMemo(
        () => proposeParentPath((data?.jcr?.nodesByQuery?.nodes || []).map(node => node.path), site),
        [data, site]
    );

    const api = typeof window === 'undefined' ? null : window.CE_API;

    // Nothing to offer without the editor that would do the creating. Drawn as nothing rather than as
    // a disabled button: a control that can never become enabled only asks to be clicked.
    if (!api?.create || !api?.openPicker) {
        return null;
    }

    const createAt = async parentPath => {
        setIsResolving(true);
        setRefusedAt(null);

        try {
            const {data: creatable} = await client.query({
                query: GET_CREATABLE_TYPES,
                variables: {
                    nodeTypes: [contentType],
                    // Explicitly false. Content Editor reads an absent value as true, and a subtype
                    // resolved alongside the type asked for would open the type selector for what the
                    // editor meant as one choice they had already made.
                    includeSubTypes: false,
                    path: parentPath,
                    uilang: uilang || 'en',
                    excludedNodeTypes: EXCLUDED_NODE_TYPES
                },
                // The answer depends on what is at that path now, and a stale yes would be spent on
                // the silent branch of CE_API.create.
                fetchPolicy: 'network-only'
            });

            if (!readCreatableTypeNames(creatable).includes(contentType)) {
                setRefusedAt(parentPath);
                return;
            }

            api.create({
                path: parentPath,
                nodeTypes: [contentType],
                includeSubTypes: false,
                lang: language,
                // The table is reading a page of this very type, so a record created into it belongs
                // on screen. Asked for by query name, as the undo does, rather than through the
                // refetcher registry: this is one known query, not a sweep of everything registered.
                createCallback: () => client.refetchQueries({include: ['getContentByType']})
            });
        } catch {
            // Treated as a refusal rather than as its own kind of failure. Both leave the editor
            // without a form, and "not here" is the actionable half of either message.
            setRefusedAt(parentPath);
        } finally {
            setIsResolving(false);
        }
    };

    const chooseLocation = () => {
        setRefusedAt(null);
        api.openPicker({
            // Pages and content folders both, because a type listed here may be dropped into a page
            // or kept as shared content, and the module has no way to know which this one is for.
            type: 'editorial',
            value: proposedPath,
            isMultiple: false,
            site,
            lang: language,
            uilang,
            setValue: picked => {
                const target = Array.isArray(picked) ? picked[0] : picked;
                if (target?.path) {
                    createAt(target.path);
                }
            }
        });
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
                label={t('label.create.action')}
                title={t('label.create.actionAt', {path: proposedPath})}
                disabled={isResolving}
                data-sel-role="create-action"
                onClick={chooseLocation}
            />
            {refusedAt && (
                <Typography
                    variant="caption"
                    className={styles.createRefused}
                    data-sel-role="create-refused"
                >
                    {t('label.create.refused', {path: refusedAt})}
                </Typography>
            )}
        </>
    );
};

ContentTypesCreateAction.propTypes = {
    /** The type being listed, which is the type that gets created. */
    contentType: PropTypes.string.isRequired
};

export default ContentTypesCreateAction;
