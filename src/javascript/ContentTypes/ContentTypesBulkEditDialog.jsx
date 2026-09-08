import React, {useMemo, useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {useApolloClient} from '@apollo/client';
import {shallowEqual, useSelector} from 'react-redux';
import {Button, Checkbox, Dropdown, Input, Modal, ModalBody, ModalFooter, ModalHeader, Textarea, Typography} from '@jahia/moonstone';
import {CAPTURE_TIMESTAMPS, CAPTURE_VALUES} from './ContentTypes.gql';
import {
    bulkEditVariables,
    canApplyEdit,
    editableFields,
    editorKind,
    initialValue,
    mutationKind,
    recordsWithValue
} from './ContentTypesBulkEdit';
import {buildSnapshot, snapshotEntries, timestampEntries} from './ContentTypesUndo';
import {MUTATIONS} from './useCellEdit';
import {recordUndo} from './useBulkUndo';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/** Past this many options a list is worth searching rather than scrolling. */
const SEARCHABLE_FROM = 12;

/**
 * Replacing one column's value across every ticked row.
 *
 * Only a content type's **own** properties are offered. The metadata every node carries - who
 * created it, when it was last modified, whether it is published - is maintained by the repository,
 * and a column like Path or Content Type is not a property at all; writing to those would be either
 * refused or a falsification of what actually happened. See `isEditable`.
 *
 * The control that collects the value follows the same five kinds the filter form distinguishes, so
 * a value list is chosen from and a date gets a date control, and the two cannot come to disagree
 * about what a column holds.
 */
export const ContentTypesBulkEditDialog = ({isOpen, nodes, availableFields, visibleFields, onClose}) => {
    const {t} = useTranslation(NAMESPACE);
    const client = useApolloClient();
    const {language} = useSelector(state => ({language: state.language}), shallowEqual);

    const fields = useMemo(() => editableFields(availableFields), [availableFields]);
    const [fieldKey, setFieldKey] = useState(null);
    const [value, setValue] = useState('');
    const [isClearing, setIsClearing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [failed, setFailed] = useState(null);

    const field = useMemo(() => fields.find(candidate => candidate.key === fieldKey), [fields, fieldKey]);
    const kind = field && editorKind(field);

    // Only a column the table is showing has had its values fetched, so only for one of those can
    // the warning be truthful. See recordsWithValue.
    const isVisible = Boolean(field && visibleFields.some(candidate => candidate.key === field.key));
    const atRisk = field ? recordsWithValue(nodes, field, isVisible) : null;

    const chooseField = key => {
        const next = fields.find(candidate => candidate.key === key);
        setFieldKey(key);
        setValue(initialValue(next));
        setIsClearing(false);
        setFailed(null);
    };

    const close = () => {
        setFieldKey(null);
        setValue('');
        setIsClearing(false);
        setFailed(null);
        onClose();
    };

    const apply = async () => {
        setIsSaving(true);
        setFailed(null);
        try {
            // What the records hold now, so this can be taken back. Read rather than taken from the
            // rows, which carry nothing for a column the table is not showing. Losing the capture
            // costs the undo, not the edit.
            let entries = null;
            try {
                const captured = await client.query({
                    query: CAPTURE_VALUES,
                    variables: {
                        paths: nodes.map(node => node.path),
                        property: field.propertyName,
                        language
                    },
                    fetchPolicy: 'network-only'
                });
                entries = snapshotEntries(captured.data?.jcr?.nodesByPath, {isReference: false});
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
                mutation: MUTATIONS[mutationKind({field, isClearing})],
                variables: bulkEditVariables({field, nodes, value, isClearing, language}),
                refetchQueries: ['getContentByType']
            });

            if (entries) {
                recordUndo(buildSnapshot({
                    kind: 'property',
                    label: field.label,
                    property: field.propertyName,
                    type: field.requiredType,
                    // Carried only for a per-language property, and the restore reads it the same
                    // way the write did - putting a value back in one language and not the others.
                    language: field.internationalized ? language : undefined,
                    multiple: field.multiple,
                    entries,
                    timestamps
                }));
            }

            close();
        } catch (error) {
            // The server's own words where it has any - "This field is mandatory", a constraint
            // violation naming the property - since they say more than a generic failure can, and
            // this operation has more ways to be refused than the others.
            setFailed(error?.message || t('label.bulkEdit.failed'));
        } finally {
            setIsSaving(false);
        }
    };

    /** The control for the chosen column's kind. Nothing at all while clearing - there is no value. */
    const renderEditor = () => {
        if (!field || isClearing) {
            return null;
        }

        if (kind === 'choice') {
            const options = field.valueOptions || [];
            return (
                <Dropdown
                    isMultiple={field.multiple}
                    hasSearch={options.length >= SEARCHABLE_FROM}
                    className={styles.bulkEditControl}
                    variant="outlined"
                    size="medium"
                    data={options}
                    value={field.multiple ? undefined : value}
                    values={field.multiple ? value : undefined}
                    label={field.multiple ?
                        (value.length > 0 ? String(value.length) : t('label.bulkEdit.choosePlaceholder')) :
                        (options.find(option => option.value === value)?.label || t('label.bulkEdit.choosePlaceholder'))}
                    data-sel-role="bulk-edit-choice"
                    onChange={(event, item) => setValue(field.multiple ?
                        (value.includes(item.value) ? value.filter(entry => entry !== item.value) : [...value, item.value]) :
                        item.value)}
                />
            );
        }

        if (kind === 'boolean') {
            return (
                <Dropdown
                    className={styles.bulkEditControl}
                    variant="outlined"
                    size="medium"
                    data={[
                        {label: t('label.boolean.true'), value: 'true'},
                        {label: t('label.boolean.false'), value: 'false'}
                    ]}
                    value={value}
                    label={t(value === 'true' ? 'label.boolean.true' : 'label.boolean.false')}
                    data-sel-role="bulk-edit-boolean"
                    onChange={(event, item) => setValue(item.value)}
                />
            );
        }

        // A multi-valued property that is not a value list has no list to offer, so the values are
        // typed one per line - the same idiom a list of strings is edited with everywhere, and one
        // that needs no control of its own.
        if (field.multiple) {
            return (
                <>
                    <Textarea
                        id="bulk-edit-values"
                        rows={4}
                        value={(value || []).join('\n')}
                        data-sel-role="bulk-edit-values"
                        onChange={event => setValue(event.target.value.split('\n').map(line => line.trim()).filter(Boolean))}
                    />
                    <Typography variant="caption" className={styles.subtitle}>
                        {t('label.bulkEdit.onePerLine')}
                    </Typography>
                </>
            );
        }

        return (
            <Input
                id="bulk-edit-value"
                type={kind === 'number' ? 'number' : (kind === 'date' ? 'date' : 'text')}
                value={value}
                className={styles.bulkEditControl}
                data-sel-role="bulk-edit-value"
                onChange={event => setValue(event.target.value)}
            />
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            size="medium"
            className={styles.dialogBox}
            data-sel-role="bulk-edit-dialog"
            onOpenChange={open => !open && close()}
        >
            <>
                {/* The heading is ModalHeader's `title` PROP. Moonstone's component is
                    `({title, children}) => title && <header>`, so a heading passed as a child
                    renders nothing at all - silently, a component returning false being no error. */}
                <ModalHeader title={t('label.bulkEdit.title')}/>
                <ModalBody>
                    <Typography className={styles.assignCount} variant="caption">
                        {t('label.bulkEdit.count', {count: nodes.length})}
                    </Typography>

                    {fields.length === 0 ? (
                        // A type whose every property is a reference, or one with no properties of
                        // its own at all - which the accordion does list.
                        <Typography variant="caption" data-sel-role="bulk-edit-no-fields">
                            {t('label.bulkEdit.noFields')}
                        </Typography>
                    ) : (
                        <>
                            <div className={styles.assignField}>
                                <Typography variant="caption" weight="bold">{t('label.bulkEdit.column')}</Typography>
                                <Dropdown
                                    hasSearch={fields.length >= SEARCHABLE_FROM}
                                    className={styles.bulkEditControl}
                                    variant="outlined"
                                    size="medium"
                                    data={fields.map(candidate => ({label: candidate.label, value: candidate.key}))}
                                    value={fieldKey}
                                    label={field?.label || t('label.bulkEdit.columnPlaceholder')}
                                    data-sel-role="bulk-edit-column"
                                    onChange={(event, item) => chooseField(item.value)}
                                />
                                <Typography variant="caption" className={styles.subtitle}>
                                    {t('label.bulkEdit.ownPropertiesOnly')}
                                </Typography>
                            </div>

                            {field && (
                                <div className={styles.assignField}>
                                    <Typography variant="caption" weight="bold">
                                        {t('label.bulkEdit.newValue')}
                                    </Typography>
                                    {renderEditor()}

                                    {/* A per-language property is written in the language the table
                                        is being read in, and only that one. Said plainly, because
                                        nothing else on screen implies it. */}
                                    {field.internationalized && (
                                        <Typography
                                            variant="caption"
                                            className={styles.subtitle}
                                            data-sel-role="bulk-edit-language"
                                        >
                                            {t('label.bulkEdit.languageOnly', {language})}
                                        </Typography>
                                    )}

                                    {/* Not offered where the definition forbids it: the server
                                        answers "This field is mandatory" and refuses the whole
                                        mutation, which is an error worth not provoking. */}
                                    {!field.mandatory && (
                                        <Checkbox
                                            checked={isClearing}
                                            label={t('label.bulkEdit.clear')}
                                            data-sel-role="bulk-edit-clear"
                                            onChange={() => setIsClearing(current => !current)}
                                        />
                                    )}
                                </div>
                            )}

                            {atRisk > 0 && (
                                <Typography
                                    variant="caption"
                                    className={styles.bulkFieldWarning}
                                    data-sel-role="bulk-edit-warning"
                                    data-sel-at-risk={atRisk}
                                >
                                    {t('label.bulkEdit.replaces', {count: atRisk})}
                                </Typography>
                            )}

                            {/* A column that is not on screen has had no values fetched, so how many
                                records would lose one is genuinely unknown. Saying so beats a
                                reassuring zero. */}
                            {field && atRisk === null && (
                                <Typography
                                    variant="caption"
                                    className={styles.bulkFieldWarning}
                                    data-sel-role="bulk-edit-unknown"
                                >
                                    {t('label.bulkEdit.replacesUnknown')}
                                </Typography>
                            )}
                        </>
                    )}

                    {failed && (
                        <Typography variant="caption" className={styles.assignError} data-sel-role="bulk-edit-error">
                            {failed}
                        </Typography>
                    )}
                </ModalBody>
                {/* Just the two buttons. Moonstone's footer is `alignCenter flexRow_reverse`,
                    so they sit on one line at the right and the footer is one control tall. The
                    undo promise and a spacer used to sit beside them, wrapped to two lines, and
                    took enough height off an 80vh-capped box to cut the form above it. The promise
                    itself is not lost - the undo bar says the same thing after the fact. */}
                <ModalFooter>
                    <Button size="big" variant="ghost" label={t('label.bulkEdit.cancel')} onClick={close}/>
                    <Button
                        size="big"
                        variant="default"
                        color="accent"
                        label={isClearing ? t('label.bulkEdit.applyClear') : t('label.bulkEdit.apply')}
                        disabled={!canApplyEdit({field, value, isClearing}) || isSaving}
                        data-sel-role="bulk-edit-apply"
                        onClick={apply}
                    />
                </ModalFooter>
            </>
        </Modal>
    );
};

ContentTypesBulkEditDialog.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    /** The ticked rows, carrying the values the table already fetched for its visible columns. */
    nodes: PropTypes.array.isRequired,
    /** The whole catalog: a column may be written without being shown in the table. */
    availableFields: PropTypes.array.isRequired,
    /** What is on screen, which decides whether the overwrite warning can be truthful. */
    visibleFields: PropTypes.array.isRequired,
    onClose: PropTypes.func.isRequired
};

export default ContentTypesBulkEditDialog;
