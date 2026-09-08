import {useCallback, useState} from 'react';
import {useApolloClient} from '@apollo/client';
import {shallowEqual, useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {
    CAPTURE_TIMESTAMPS,
    CAPTURE_VALUES,
    CLEAR_PROPERTY,
    CLEAR_PROPERTY_I18N,
    SET_PROPERTY,
    SET_PROPERTY_I18N,
    SET_PROPERTY_VALUES,
    SET_PROPERTY_VALUES_I18N
} from './ContentTypes.gql';
import {mutationKind} from './ContentTypesBulkEdit';
import {cellEditVariables} from './ContentTypesCellEdit';
import {buildSnapshot, snapshotEntries, timestampEntries} from './ContentTypesUndo';
import {recordUndo} from './useBulkUndo';
import {NAMESPACE} from '../ContentTypes.register';

/**
 * The name each mutation kind resolves to.
 *
 * Exported and imported by the bulk dialog rather than written out twice: a mutation document paired
 * with variables built for a different one is a runtime error with nothing on screen to explain it,
 * and two copies of this map are exactly how that pairing comes apart.
 */
export const MUTATIONS = {
    CLEAR_PROPERTY,
    CLEAR_PROPERTY_I18N,
    SET_PROPERTY,
    SET_PROPERTY_I18N,
    SET_PROPERTY_VALUES,
    SET_PROPERTY_VALUES_I18N
};

/**
 * Writing one cell, and recording what it held so the write can be taken back.
 *
 * The same three steps the bulk dialog takes, in the same order and for the same reasons - capture
 * the values, capture the timestamps that decide the publication flag, then write - held in a hook
 * because two surfaces now perform them: the editor inside the cell and the dialog that opens for a
 * value too big for one. Duplicating them would be duplicating the undo, which is the part most
 * easily got subtly wrong.
 *
 * The capture is best-effort on purpose: losing it costs the undo, not the edit. An editor who has
 * just corrected a value would rather have the correction saved with no way back than be told the
 * save failed because a snapshot could not be read.
 */
export const useCellEdit = () => {
    const {t} = useTranslation(NAMESPACE);
    const client = useApolloClient();
    const {language} = useSelector(state => ({language: state.language}), shallowEqual);
    const [isSaving, setIsSaving] = useState(false);
    const [failed, setFailed] = useState(null);

    const clearFailure = useCallback(() => setFailed(null), []);

    /**
     * Writes the value, answering whether it landed.
     *
     * A boolean rather than a thrown error, because both callers do the same two things with the
     * answer and neither can act on the exception itself: on success they close, on failure they
     * stay open with what was typed still there and the server's own words underneath.
     */
    const save = useCallback(async ({field, row, value, isClearing}) => {
        setIsSaving(true);
        setFailed(null);

        try {
            // What this record holds now. Read from the repository rather than taken from the row,
            // which carries nothing for a column the table is not currently showing.
            let entries = null;
            try {
                const captured = await client.query({
                    query: CAPTURE_VALUES,
                    variables: {paths: [row.path], property: field.propertyName, language},
                    fetchPolicy: 'network-only'
                });
                entries = snapshotEntries(captured.data?.jcr?.nodesByPath, {isReference: false});
            } catch {
                entries = null;
            }

            // The stamps behind the publication flag, captured with the values: Jahia reads that flag
            // from jcr:lastModified against j:lastPublished, so restoring values alone would leave
            // the record still marked Modified.
            let timestamps = null;
            try {
                const stamped = await client.query({
                    query: CAPTURE_TIMESTAMPS,
                    variables: {paths: [row.path], translationPath: `j:translation_${language}`},
                    fetchPolicy: 'network-only'
                });
                timestamps = timestampEntries(stamped.data?.jcr?.nodesByPath);
            } catch {
                timestamps = null;
            }

            await client.mutate({
                mutation: MUTATIONS[mutationKind({field, isClearing})],
                variables: cellEditVariables({field, row, value, isClearing, language}),
                // The whole page rather than this one cell. Deliberate: the write moves
                // jcr:lastModified and the publication status with it, so the Modified-by, Modified
                // and Publication columns are all stale the moment it lands. Patching the one cell
                // in the cache would leave those three showing the state before the edit, which is
                // worse than a reload nobody asked about.
                refetchQueries: ['getContentByType']
            });

            if (entries) {
                recordUndo(buildSnapshot({
                    kind: 'property',
                    label: field.label,
                    property: field.propertyName,
                    type: field.requiredType,
                    // Carried only for a per-language property, so the restore puts the value back
                    // in the one language the write touched.
                    language: field.internationalized ? language : undefined,
                    multiple: field.multiple,
                    entries,
                    timestamps
                }));
            }

            return true;
        } catch (error) {
            // The server's own words where it has any - "This field is mandatory", a constraint
            // violation naming the property. It says more than a generic failure can, and a
            // property write has more ways to be refused than most operations here.
            setFailed(error?.message || t('label.cellEdit.failed'));
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [client, language, t]);

    return {save, isSaving, failed, clearFailure, language};
};

export default useCellEdit;
