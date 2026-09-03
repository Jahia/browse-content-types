import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useApolloClient} from '@apollo/client';
import {Button, Close, Undo} from '@jahia/moonstone';
import {DELETE_TASK} from './ContentTypes.gql';
import {
    buildRestoreDocument,
    buildRestoreVariables,
    buildTimestampDocument,
    buildTimestampVariables,
    undoMessageKey
} from './ContentTypesUndo';
import {clearUndo, useBulkUndo} from './useBulkUndo';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The offer to take back the last bulk operation, in the toolbar beside the menu that raised it.
 *
 * Beside the Bulk menu rather than floating over the table: the operation was started from that
 * line, so that is where an editor looks to take it back, and a control in the flow of the toolbar
 * is read as part of the interface rather than as a notice that might vanish on its own. Nothing
 * here does vanish on its own - there is no timer, because a safety net that quietly expires is one
 * nobody can rely on.
 *
 * Drawn in two places, which are mutually exclusive: in the selection bar while rows are ticked, and
 * in the browse controls once the selection is cleared. Without the second, dismissing a selection
 * would silently throw away the only way back from what was just done to it.
 *
 * The snapshot comes from a module-level store rather than from props - see useBulkUndo for why
 * three levels of prop threading were not worth it for two consumers.
 *
 * **It restores what was there, not what has happened since.** Nothing here notices another editor
 * changing the same records in between, which is the honest limit of one snapshot taken at one
 * moment - and the reason this is one level rather than a stack.
 */
export const ContentTypesUndoAction = () => {
    const {t} = useTranslation(NAMESPACE);
    const client = useApolloClient();
    const snapshot = useBulkUndo();
    const [isUndoing, setIsUndoing] = useState(false);
    const [failed, setFailed] = useState(false);

    if (!snapshot) {
        return null;
    }

    const message = t(undoMessageKey(snapshot), {label: snapshot.label, count: snapshot.count});

    const undo = async () => {
        setIsUndoing(true);
        setFailed(false);
        try {
            if (snapshot.kind === 'task') {
                await client.mutate({mutation: DELETE_TASK, variables: {uuid: snapshot.uuid}});
            } else {
                // One aliased mutateNode per record, because each goes back to its own previous
                // value - which is exactly what a single mutateNodes cannot do.
                await client.mutate({
                    mutation: buildRestoreDocument(snapshot),
                    variables: buildRestoreVariables(snapshot)
                });

                // Second, and only once the values are back. Restoring a value is itself a write
                // and moves jcr:lastModified forward again, so doing both in one document would
                // leave the stamp pointing at the moment of the undo - which is exactly the state
                // this exists to correct.
                if (snapshot.timestamps?.length > 0) {
                    await client.mutate({
                        mutation: buildTimestampDocument(snapshot.timestamps),
                        variables: buildTimestampVariables(snapshot.timestamps)
                    });
                }

                // Asked for once, at the end, so the table reads the record as it finally stands
                // rather than between the two writes.
                await client.refetchQueries({include: ['getContentByType']});
            }

            clearUndo();
        } catch {
            // The control stays, so a failure that was momentary can simply be tried again.
            // Clearing it here would take away the only way back.
            setFailed(true);
        } finally {
            setIsUndoing(false);
        }
    };

    return (
        <div className={styles.undoAction} data-sel-role="undo-action-group" data-sel-undo-kind={snapshot.kind}>
            <Button
                size="default"
                // Filled rather than outlined, and the only filled control on this line: an offer
                // that expires when the next operation supersedes it has to be seen while it stands,
                // and a ghost button among ghost buttons is not seen.
                variant="default"
                color={failed ? 'danger' : 'accent'}
                icon={<Undo/>}
                // What was done, on the control that takes it back - the label alone would leave an
                // editor guessing which of several operations they are about to reverse.
                label={failed ? t('label.undo.failed') : t('label.undo.actionWith', {message})}
                title={message}
                disabled={isUndoing}
                data-sel-role="undo-action"
                onClick={undo}
            />
            <Button
                size="default"
                variant="ghost"
                icon={<Close/>}
                title={t('label.undo.dismiss')}
                data-sel-role="undo-dismiss"
                onClick={clearUndo}
            />
        </div>
    );
};

export default ContentTypesUndoAction;
