import React, {useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {useApolloClient} from '@apollo/client';
import {shallowEqual, useSelector} from 'react-redux';
import {registry} from '@jahia/ui-extender';
import {Button, Modal, ModalBody, ModalFooter, ModalHeader, RadioGroup, RadioItem, Typography} from '@jahia/moonstone';
import {ContentEditorContext} from '@jahia/jcontent';
import {SET_BULK_FIELD} from './ContentTypes.gql';
import {
    BULK_MODES,
    addRecords,
    buildAddDocument,
    buildAddVariables,
    bulkFieldVariables,
    captureHeldValues,
    canApply,
    pickerField,
    recordsWithValues
} from './ContentTypesBulkFields';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * Setting the tags or the categories of every ticked row at once.
 *
 * One dialog for both, because the two differ only in which picker collects the value and which
 * property it lands in - see BULK_FIELDS.
 *
 * **Two modes, and Replace is the default** so the dialog behaves as it always did unless asked
 * otherwise. Replace makes each record hold exactly what was picked, which is the one behaviour that
 * can destroy work on a record nobody looked at - so how many records stand to lose something is
 * still said before the fact, from values the table already fetched for its own columns. Add keeps
 * what is there; picking something a record already carries is a silent no-op.
 *
 * The two are different writes, not one write with a flag: Replace sends one value list for the
 * whole selection in a single `mutateNodes`, while Add gives every record its own final list and so
 * needs one `mutateNode` each. See BULK_MODES.
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
    const [mode, setMode] = useState(BULK_MODES.REPLACE);
    const [isSaving, setIsSaving] = useState(false);
    const [failed, setFailed] = useState(false);

    const selector = registry.get('selectorType', field.selectorType);
    const Picker = selector?.cmp;

    const atRisk = recordsWithValues(nodes, field);

    const close = () => {
        setValues([]);
        setMode(BULK_MODES.REPLACE);
        setFailed(false);
        onClose();
    };

    const apply = async () => {
        setIsSaving(true);
        setFailed(false);
        try {
            // **Adding cannot go ahead without reading what is there first.** The values it
            // writes are each record's own plus the chosen ones, so with nothing read there is no
            // union to compute, and the only thing left to send would be the chosen values alone -
            // which is replacing. Doing that silently would destroy exactly the values the reader
            // asked to keep, so an Add whose read failed reports a failure instead.
            //
            // Replacing asks for none of it: one list goes to the whole selection either way.
            const isAdding = mode === BULK_MODES.ADD;
            const isReference = field.valueType === 'WEAKREFERENCE';
            const entries = isAdding ? await captureHeldValues(client, {
                paths: nodes.map(node => node.path),
                property: field.property,
                language,
                isReference
            }) : null;

            if (isAdding && !entries) {
                setFailed(true);
                return;
            }

            // Which records an Add actually writes, and what each ends up holding. A record that
            // already carries everything picked is not written at all - see addRecords.
            const records = isAdding ? addRecords({entries, values}) : null;

            // Nothing to do: every record already had it. Closing quietly is the honest outcome -
            // there is no edit to report.
            if (isAdding && records.length === 0) {
                close();
                return;
            }

            await client.mutate(isAdding ? {
                mutation: buildAddDocument({records}),
                variables: buildAddVariables({field, records}),
                refetchQueries: ['getContentByType']
            } : {
                mutation: SET_BULK_FIELD,
                variables: bulkFieldVariables({field, nodes, values}),
                // The table is showing these very rows and their tag and category columns, so it has
                // to be told; the records are refetched by the table's own refetcher rather than by
                // reaching into the cache for properties this dialog does not own.
                refetchQueries: ['getContentByType']
            });

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
                {/* See the note in ContentTypesBulkEditDialog: the heading is the `title`
                    prop, and passed as a child it renders nothing. */}
                <ModalHeader title={t(`label.bulkField.${field.key}.title`)}/>
                <ModalBody>
                    <Typography className={styles.assignCount} variant="caption">
                        {t('label.bulkField.count', {count: nodes.length})}
                    </Typography>

                    {/* The mode comes before the picker because it is the bigger decision: the
                        same set of categories means two different outcomes depending on it, and one
                        of them is destructive. RadioItem's own `description` carries the
                        consequence, so the choice explains itself rather than needing a note
                        underneath. */}
                    <RadioGroup
                        className={styles.bulkFieldMode}
                        name={`bulk-field-mode-${field.key}`}
                        value={mode}
                        data-sel-role="bulk-field-mode"
                        onChange={event => setMode(event.target.value)}
                    >
                        <RadioItem
                            id={`bulk-field-mode-replace-${field.key}`}
                            value={BULK_MODES.REPLACE}
                            label={t(`label.bulkField.${field.key}.mode.replace`)}
                            description={t(`label.bulkField.${field.key}.mode.replaceHint`)}
                        />
                        <RadioItem
                            id={`bulk-field-mode-add-${field.key}`}
                            value={BULK_MODES.ADD}
                            label={t(`label.bulkField.${field.key}.mode.add`)}
                            description={t(`label.bulkField.${field.key}.mode.addHint`)}
                        />
                    </RadioGroup>

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
                    {mode === BULK_MODES.REPLACE && atRisk > 0 && (
                        <Typography
                            variant="caption"
                            className={styles.bulkFieldWarning}
                            data-sel-role="bulk-field-warning"
                            data-sel-at-risk={atRisk}
                        >
                            {t(`label.bulkField.${field.key}.replaces`, {count: atRisk})}
                        </Typography>
                    )}

                    {/* Only when replacing does an empty selection mean anything: it is how a set
                        of records is cleared. Adding nothing to them is simply nothing to do, and
                        the button says as much by staying out of the way. */}
                    {mode === BULK_MODES.REPLACE && values.length === 0 && (
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
                {/* Just the two buttons. Moonstone's footer is `alignCenter flexRow_reverse`,
                    so they sit on one line at the right and the footer is one control tall. The
                    undo promise and a spacer used to sit beside them, wrapped to two lines, and
                    took enough height off an 80vh-capped box to cut the form above it. The promise
                    itself is not lost - the undo bar says the same thing after the fact. */}
                <ModalFooter>
                    <Button size="big" variant="ghost" label={t('label.bulkField.cancel')} onClick={close}/>
                    <Button
                        size="big"
                        variant="default"
                        color="accent"
                        label={t('label.bulkField.apply')}
                        disabled={
                            !Picker ||
                            !canApply(nodes) ||
                            isSaving ||
                            // Adding nothing is not an operation. Replacing with nothing is - it
                            // clears the selection - so the guard is on this mode only.
                            (mode === BULK_MODES.ADD && values.length === 0)
                        }
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
