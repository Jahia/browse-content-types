import React, {useRef, useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Dropdown, Input} from '@jahia/moonstone';
import {canApplyEdit, editorKind} from './ContentTypesBulkEdit';
import {currentCellValue, hasCellValueChanged} from './ContentTypesCellEdit';
import {useCellEdit} from './useCellEdit';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/** Past this many options a list is worth searching rather than scrolling. */
const SEARCHABLE_FROM = 12;

/**
 * The control that replaces one cell while it is being edited.
 *
 * Only ever the kinds that fit a cell - a value list, a boolean, a date, a number, a short text. A
 * multi-valued property and a long body go to the dialog instead; `editSurface` is what decides,
 * and the table asks it before rendering this.
 *
 * **Emptying the cell clears the property.** Typing the value away and confirming is the obvious way
 * to say "there is nothing here", so it is read as the clear rather than as an attempt to store an
 * empty string - which is what the bulk dialog has a separate checkbox for, having no cell to empty.
 * A mandatory property cannot be cleared and says so here rather than after a round trip.
 */
export const ContentTypesCellEditor = ({field, row, onClose}) => {
    const {t} = useTranslation(NAMESPACE);
    const {save, isSaving, failed} = useCellEdit();
    const stored = currentCellValue(field, row);
    const [value, setValue] = useState(stored);
    const [refused, setRefused] = useState(null);
    const kind = editorKind(field);

    /**
     * Whether this editor has already finished with the value it holds.
     *
     * Confirming and losing focus are both ways of saying "done", and one follows the other: saving
     * closes the editor, which blurs the control on its way out. Without this the value would be
     * written twice - the second time reporting a change against a record that already holds it.
     */
    const settled = useRef(false);

    const cancel = () => {
        if (settled.current) {
            return;
        }

        settled.current = true;
        onClose();
    };

    const commit = async next => {
        if (settled.current || isSaving) {
            return;
        }

        // Nothing typed differs from what is stored, so there is nothing to write. Saving anyway
        // would move jcr:lastModified and mark the record Modified because somebody pressed Enter.
        if (!hasCellValueChanged(stored, next)) {
            cancel();
            return;
        }

        const isClearing = String(next ?? '').trim() === '';
        if (!canApplyEdit({field, value: next, isClearing})) {
            // The one case that reaches here: a mandatory property emptied. The server refuses it
            // too, in the same words, but there is no reason to make the round trip to hear them.
            setRefused(t('label.cellEdit.mandatory'));
            return;
        }

        setRefused(null);
        settled.current = true;
        const saved = await save({field, row, value: next, isClearing});
        if (saved) {
            onClose();
        } else {
            // Stays open with what was typed still in it, so the refusal can be read and answered
            // rather than silently discarding the correction.
            settled.current = false;
        }
    };

    const message = refused || failed;

    const onConfirmKey = event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commit(value);
        }
    };

    /**
     * Escape, from wherever inside the editor it is pressed.
     *
     * On the wrapper rather than on the control, because a value list has no control to put it on
     * that would help: a dropdown commits when a choice is made and has nothing to blur into, so
     * without this the only way out of one opened by mistake would be to choose something.
     */
    const onCancelKey = event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
        }
    };

    const control = () => {
        // A selection from a list is the whole decision, so it is written as it is made rather than
        // asking for a confirmation of a choice already expressed.
        if (kind === 'choice') {
            const options = field.valueOptions || [];
            return (
                <Dropdown
                    hasSearch={options.length >= SEARCHABLE_FROM}
                    className={styles.cellEditorControl}
                    variant="outlined"
                    size="small"
                    isDisabled={isSaving}
                    data={options}
                    value={value}
                    label={options.find(option => option.value === value)?.label || t('label.cellEdit.choosePlaceholder')}
                    data-sel-role="cell-edit-choice"
                    onChange={(event, item) => {
                        setValue(item.value);
                        commit(item.value);
                    }}
                />
            );
        }

        if (kind === 'boolean') {
            return (
                <Dropdown
                    className={styles.cellEditorControl}
                    variant="outlined"
                    size="small"
                    isDisabled={isSaving}
                    data={[
                        {label: t('label.boolean.true'), value: 'true'},
                        {label: t('label.boolean.false'), value: 'false'}
                    ]}
                    value={value}
                    label={t(value === 'true' ? 'label.boolean.true' : 'label.boolean.false')}
                    data-sel-role="cell-edit-boolean"
                    onChange={(event, item) => {
                        setValue(item.value);
                        commit(item.value);
                    }}
                />
            );
        }

        return (
            <Input
                focusOnField
                type={kind === 'number' ? 'number' : (kind === 'date' ? 'date' : 'text')}
                value={value}
                isDisabled={isSaving}
                className={styles.cellEditorControl}
                data-sel-role="cell-edit-value"
                onChange={event => setValue(event.target.value)}
                onKeyDown={onConfirmKey}
                // Moving away is the other way of saying "done", the way it is in any table of
                // values. Escape is what discards instead, and it is the only thing that does.
                onBlur={() => commit(value)}
            />
        );
    };

    return (
        // Clicks stay inside: without this, editing a cell would also tick the row's checkbox, the
        // row being what a click on the table selects.
        <div
            className={message ? `${styles.cellEditor} ${styles.cellEditorFailed}` : styles.cellEditor}
            data-sel-role="cell-editor"
            onKeyDown={onCancelKey}
            onClick={event => event.stopPropagation()}
            onDoubleClick={event => event.stopPropagation()}
        >
            {control()}
            {message && (
                // The server's own words, which are as long as they are - so the cell shows what
                // fits and the whole message is on hover.
                <div className={styles.cellEditorError} title={message} data-sel-role="cell-edit-error">
                    {message}
                </div>
            )}
        </div>
    );
};

ContentTypesCellEditor.propTypes = {
    /** The column being edited, as useContentTypeColumns built it. */
    field: PropTypes.object.isRequired,

    /** The record whose cell this is. */
    row: PropTypes.object.isRequired,

    /** Called once the editor is finished with, whether it saved or was abandoned. */
    onClose: PropTypes.func.isRequired
};

export default ContentTypesCellEditor;
