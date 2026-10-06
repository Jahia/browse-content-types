import {useCallback, useState} from 'react';
import {useApolloClient} from '@apollo/client';
import {shallowEqual, useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {MUTATIONS} from './ContentTypes.gql';
import {mutationKind} from './ContentTypesBulkEdit';
import {cellEditVariables} from './ContentTypesCellEdit';
import {NAMESPACE} from '../ContentTypes.register';

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
