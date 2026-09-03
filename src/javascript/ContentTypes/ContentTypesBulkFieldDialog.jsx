import React, {useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {useApolloClient} from '@apollo/client';
import {shallowEqual, useSelector} from 'react-redux';
import {registry} from '@jahia/ui-extender';
import {Button, Modal, ModalBody, ModalFooter, ModalHeader, Typography} from '@jahia/moonstone';
import {ContentEditorContext} from '@jahia/jcontent';
import {CAPTURE_REFERENCES, CAPTURE_TIMESTAMPS, CAPTURE_VALUES, SET_BULK_FIELD} from './ContentTypes.gql';
import {bulkFieldVariables, canApply, pickerField, recordsWithValues} from './ContentTypesBulkFields';
import {buildSnapshot, snapshotEntries, timestampEntries} from './ContentTypesUndo';
import {recordUndo} from './useBulkUndo';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * Setting the tags or the categories of every ticked row at once.
 *
 * One dialog for both, because the two differ only in which picker collects the value and which
 * property it lands in - see BULK_FIELDS.
 *
 * **The values replace what each record holds** rather than being added to it. That is the chosen
 * behaviour and it is the one that can destroy work on a record nobody looked at, so how many
 * records stand to lose something is said before the fact rather than after - the table has already
 * fetched their current values for its own columns, so saying it costs no request.
 *
 * The picker is Content Editor's own, taken from the registry rather than imported: jContent
 * federates no picker at all, but Content Editor registers its selector types on the same registry
 * this module already takes `menuAction` from. That is a registry key rather than a public API, so
 * if it is ever gone the dialog says so instead of failing on an undefined component.
 */
export const ContentTypesBulkFieldDialog = ({isOpen, field, nodes, onClose}) => {
    const {t} = useTranslation(NAMESPACE);
    const client = useApolloClient();
    const {site, language} = useSelector(state => ({
        site: state.site,
        language: state.language
    }), shallowEqual);

    const [values, setValues] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [failed, setFailed] = useState(false);

    const selector = registry.get('selectorType', field.selectorType);
    const Picker = selector?.cmp;

    const atRisk = recordsWithValues(nodes, field);

    const close = () => {
        setValues([]);
        setFailed(false);
        onClose();
    };

    const apply = async () => {
        setIsSaving(true);
        setFailed(false);
        try {
            // Read what is there before replacing it, so the operation can be taken back. A failure
            // to capture is not a reason to refuse the operation - it costs the undo, not the edit -
            // so it is caught separately and leaves the snapshot empty.
            const isReference = field.valueType === 'WEAKREFERENCE';
            let entries = null;
            try {
                const captured = await client.query({
                    query: isReference ? CAPTURE_REFERENCES : CAPTURE_VALUES,
                    variables: {
                        paths: nodes.map(node => node.path),
                        property: field.property,
                        language
                    },
                    fetchPolicy: 'network-only'
                });
                entries = snapshotEntries(captured.data?.jcr?.nodesByPath, {isReference});
            } catch {
                entries = null;
            }

            // The stamps that decide the publication flag, captured with the values. Jahia reads
            // that flag from jcr:lastModified against j:lastPublished and never from comparing the
            // two workspaces, so restoring values alone leaves the record marked Modified.
            let timestamps = null;
            try {
                const stamped = await client.query({
                    query: CAPTURE_TIMESTAMPS,
                    variables: {
                        paths: nodes.map(node => node.path),
                        translationPath: `j:translation_${language}`
                    },
                    fetchPolicy: 'network-only'
                });
                timestamps = timestampEntries(stamped.data?.jcr?.nodesByPath);
            } catch {
                timestamps = null;
            }

            await client.mutate({
                mutation: SET_BULK_FIELD,
                variables: bulkFieldVariables({field, nodes, values}),
                // The table is showing these very rows and their tag and category columns, so it has
                // to be told; the records are refetched by the table's own refetcher rather than by
                // reaching into the cache for properties this dialog does not own.
                refetchQueries: ['getContentByType']
            });

            if (entries) {
                recordUndo(buildSnapshot({
                    kind: 'property',
                    label: t(`label.bulkField.${field.key}.label`),
                    property: field.property,
                    type: field.valueType,
                    multiple: true,
                    entries,
                    timestamps
                }));
            }

            close();
        } catch {
            setFailed(true);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            size="medium"
            className={styles.dialogBox}
            data-sel-role={`bulk-field-dialog-${field.key}`}
            onOpenChange={open => !open && close()}
        >
            <>
                <ModalHeader>
                    <Typography variant="heading" weight="bold">
                        {t(`label.bulkField.${field.key}.title`)}
                    </Typography>
                </ModalHeader>
                <ModalBody>
                    <Typography className={styles.assignCount} variant="caption">
                        {t('label.bulkField.count', {count: nodes.length})}
                    </Typography>

                    <div className={styles.assignField}>
                        {Picker ? (
                            /*
                                Tag reads the site key from Content Editor's context and can render
                                nothing usable without it. The bare context is provided rather than
                                ContentEditorContextProvider, which is a component in its own right -
                                it fetches site info, reads the editor's configuration context and
                                renders a loader while it waits. All the picker wants is two values.
                            */
                            <ContentEditorContext.Provider value={{site, lang: language}}>
                                <Picker
                                    id={`bulk-${field.key}`}
                                    // Built fresh rather than memoised on purpose: Category pushes
                                    // its own selector options into whatever object it is handed,
                                    // on every render.
                                    field={pickerField(field, t(`label.bulkField.${field.key}.label`))}
                                    value={values}
                                    editorContext={{site, lang: language}}
                                    onChange={setValues}
                                    onBlur={() => {}}
                                />
                            </ContentEditorContext.Provider>
                        ) : (
                            <Typography variant="caption" data-sel-role="bulk-field-no-picker">
                                {t('label.bulkField.noPicker')}
                            </Typography>
                        )}
                    </div>

                    {/*
                        Said before the fact, not after. Replacing is what this does, and a record
                        whose tags are about to go is one the editor may never have opened.
                    */}
                    {atRisk > 0 && (
                        <Typography
                            variant="caption"
                            className={styles.bulkFieldWarning}
                            data-sel-role="bulk-field-warning"
                            data-sel-at-risk={atRisk}
                        >
                            {t(`label.bulkField.${field.key}.replaces`, {count: atRisk})}
                        </Typography>
                    )}

                    {values.length === 0 && (
                        <Typography variant="caption" data-sel-role="bulk-field-clears">
                            {t(`label.bulkField.${field.key}.clears`)}
                        </Typography>
                    )}

                    {failed && (
                        <Typography variant="caption" className={styles.assignError} data-sel-role="bulk-field-error">
                            {t('label.bulkField.failed')}
                        </Typography>
                    )}
                </ModalBody>
                <ModalFooter>
                    {/* Said before the button rather than discovered after it: an editor deciding
                        whether to change a hundred records is deciding under a different risk if
                        they know it can be taken back. */}
                    <Typography variant="caption" className={styles.undoPromise} data-sel-role="undo-promise">
                        {t('label.undo.promise')}
                    </Typography>
                    <div className={styles.toolBarSpacer}/>
                    <Button size="big" variant="ghost" label={t('label.bulkField.cancel')} onClick={close}/>
                    <Button
                        size="big"
                        variant="default"
                        color="accent"
                        label={t('label.bulkField.apply')}
                        disabled={!Picker || !canApply(nodes) || isSaving}
                        data-sel-role="bulk-field-apply"
                        onClick={apply}
                    />
                </ModalFooter>
            </>
        </Modal>
    );
};

ContentTypesBulkFieldDialog.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    /** One entry of BULK_FIELDS: which mixin, property, value kind and picker this is about. */
    field: PropTypes.object.isRequired,
    /** The ticked rows, carrying the values the table already fetched for its own columns. */
    nodes: PropTypes.array.isRequired,
    onClose: PropTypes.func.isRequired
};

export default ContentTypesBulkFieldDialog;
