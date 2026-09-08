import React, {useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Button, Checkbox, Modal, ModalBody, ModalFooter, ModalHeader, Textarea, Typography} from '@jahia/moonstone';
import {canApplyEdit} from './ContentTypesBulkEdit';
import {currentCellValue, hasCellValueChanged} from './ContentTypesCellEdit';
import {useCellEdit} from './useCellEdit';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * Editing one cell of one record, for a value a cell could not hold.
 *
 * Two kinds reach this rather than the inline editor: a multi-valued property, whose control is a
 * list typed one per line, and a text value long enough that a one-line input would be a worse way
 * to read it than to write it. `editSurface` decides which, from the value itself.
 *
 * Prefilled with what the record holds, which is the whole difference from the bulk dialog next to
 * it. That one deliberately starts empty - it replaces a value across a selection, so showing one
 * record's value would suggest the others held it too. Here there is one record and the point is to
 * amend what it has.
 */
export const ContentTypesCellEditDialog = ({field, row, onClose}) => {
    const {t} = useTranslation(NAMESPACE);
    const {save, isSaving, failed, language} = useCellEdit();
    const stored = currentCellValue(field, row);
    const [value, setValue] = useState(stored);
    const [isClearing, setIsClearing] = useState(false);

    const apply = async () => {
        // Unchanged and not being emptied: nothing to write, and writing anyway would mark the
        // record Modified for no reason.
        if (!isClearing && !hasCellValueChanged(stored, value)) {
            onClose();
            return;
        }

        const saved = await save({field, row, value, isClearing});
        if (saved) {
            onClose();
        }
    };

    return (
        <Modal
            isOpen
            size="medium"
            className={styles.dialogBox}
            data-sel-role="cell-edit-dialog"
            onOpenChange={open => !open && onClose()}
        >
            <>
                {/* The heading is ModalHeader's `title` PROP, not a child: Moonstone's component is
                    `({title, children}) => title && <header>`, so a heading passed as a child
                    renders nothing at all, silently. */}
                <ModalHeader title={t('label.cellEdit.title', {column: field.label})}/>
                <ModalBody>
                    <Typography className={styles.assignCount} variant="caption">
                        {row.displayName || row.name}
                    </Typography>

                    <div className={styles.assignField}>
                        <Typography variant="caption" weight="bold">{field.label}</Typography>

                        {!isClearing && (field.multiple ? (
                            <>
                                <Textarea
                                    id="cell-edit-values"
                                    rows={6}
                                    value={(value || []).join('\n')}
                                    data-sel-role="cell-edit-values"
                                    onChange={event => setValue(event.target.value.split('\n').map(line => line.trim()).filter(Boolean))}
                                />
                                <Typography variant="caption" className={styles.subtitle}>
                                    {t('label.bulkEdit.onePerLine')}
                                </Typography>
                            </>
                        ) : (
                            <Textarea
                                id="cell-edit-value"
                                rows={8}
                                value={value}
                                data-sel-role="cell-edit-long-value"
                                onChange={event => setValue(event.target.value)}
                            />
                        ))}

                        {/* Not offered where the definition forbids it: the server answers "This
                            field is mandatory" and refuses the whole mutation. */}
                        {!field.mandatory && (
                            <Checkbox
                                checked={isClearing}
                                label={t('label.cellEdit.clear')}
                                data-sel-role="cell-edit-clear"
                                onChange={() => setIsClearing(current => !current)}
                            />
                        )}

                        {field.internationalized && (
                            <Typography variant="caption" className={styles.subtitle}>
                                {t('label.bulkEdit.languageOnly', {language})}
                            </Typography>
                        )}
                    </div>

                    {failed && (
                        <Typography variant="caption" className={styles.assignError} data-sel-role="cell-edit-dialog-error">
                            {failed}
                        </Typography>
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button size="big" variant="ghost" label={t('label.bulkEdit.cancel')} onClick={onClose}/>
                    <Button
                        size="big"
                        variant="default"
                        color="accent"
                        label={isClearing ? t('label.bulkEdit.applyClear') : t('label.cellEdit.apply')}
                        disabled={!canApplyEdit({field, value, isClearing}) || isSaving}
                        data-sel-role="cell-edit-apply"
                        onClick={apply}
                    />
                </ModalFooter>
            </>
        </Modal>
    );
};

ContentTypesCellEditDialog.propTypes = {
    /** The column being edited, as useContentTypeColumns built it. */
    field: PropTypes.object.isRequired,

    /** The record whose cell this is. */
    row: PropTypes.object.isRequired,

    onClose: PropTypes.func.isRequired
};

export default ContentTypesCellEditDialog;
