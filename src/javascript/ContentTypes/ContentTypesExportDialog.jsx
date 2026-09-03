import React, {useCallback, useMemo, useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Button, Modal, ModalBody, ModalFooter, ModalHeader, Typography} from '@jahia/moonstone';
import {ContentTypesColumnsPicker} from './ContentTypesColumnsPicker';
import {EXPORT_FORMATS, EXPORT_FORMAT_KEYS, exportFields, exportFileName, initialExportKeys} from './ContentTypesExport';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * Hands the browser a file it did not fetch.
 *
 * A Blob, an object URL and an anchor clicked from script, which is the only way to name a download
 * generated in the page. The anchor is never added to the document: a click dispatched on a detached
 * element still triggers the download in every browser Jahia supports.
 *
 * The URL is revoked afterwards, since it pins the whole Blob in memory until the tab closes.
 * Deferred, because revoking synchronously after `click()` races the download in Firefox, which has
 * not read the Blob when the call returns.
 */
const downloadFile = (text, fileName, mimeType) => {
    const url = URL.createObjectURL(new Blob([text], {type: mimeType}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Exporting the ticked rows: in which format, and with which columns.
 *
 * The export needs no request. Every value it writes is already in the rows the table fetched, which
 * is why the whole thing is synchronous and why it agrees with the screen it came from.
 *
 * The columns start as the ones the table is showing, since that is the set the reader arranged, and
 * are then the export's own: adding one here does not show it in the table, and the table's own
 * picker is left alone. Both use the same component - it is fully controlled, so it serves a local
 * selection as readily as the table's persisted one.
 */
export const ContentTypesExportDialog = ({isOpen, nodes, contentType, visibleFields, availableFields, fieldsByKey, onClose}) => {
    const {t} = useTranslation(NAMESPACE);

    const [format, setFormat] = useState('csv');
    const [keys, setKeys] = useState(() => initialExportKeys(visibleFields));

    // The picker wants fields, in order; it is given the export's own selection rather than the
    // table's, which is the whole point of choosing columns here.
    const chosen = useMemo(() => exportFields(keys, fieldsByKey), [keys, fieldsByKey]);

    const toggleField = useCallback(key => setKeys(current => (
        current.includes(key) ? current.filter(candidate => candidate !== key) : [...current, key]
    )), []);

    const moveField = useCallback((key, direction) => setKeys(current => {
        const index = current.indexOf(key);
        const next = index + direction;
        if (index === -1 || next < 0 || next >= current.length) {
            return current;
        }

        const reordered = [...current];
        [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
        return reordered;
    }), []);

    // Back to what the table is showing, which is the set this started from - not to the module's
    // built-in defaults, which would be a set the reader never asked for in either place.
    const resetToDefaults = useCallback(
        () => setKeys(initialExportKeys(visibleFields)),
        [visibleFields]
    );

    const download = () => {
        const chosenFormat = EXPORT_FORMATS[format];
        const text = chosenFormat.build({
            nodes,
            fields: chosen,
            nameLabel: t('label.table.name'),
            t
        });

        downloadFile(text, exportFileName(contentType, chosenFormat.extension), chosenFormat.mimeType);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            size="medium"
            className={styles.dialogBoxWide}
            data-sel-role="export-dialog"
            onOpenChange={open => !open && onClose()}
        >
            <>
                <ModalHeader>
                    <Typography variant="heading" weight="bold">{t('label.export.title')}</Typography>
                </ModalHeader>
                <ModalBody>
                    <Typography className={styles.assignCount} variant="caption">
                        {t('label.export.count', {count: nodes.length})}
                    </Typography>

                    <Typography className={styles.exportSectionLabel} variant="caption" weight="bold">
                        {t('label.export.format')}
                    </Typography>
                    <div className={styles.exportFormats} data-sel-role="export-formats">
                        {EXPORT_FORMAT_KEYS.map(key => (
                            <label key={key} className={styles.exportFormat}>
                                <input
                                    type="radio"
                                    name="export-format"
                                    value={key}
                                    checked={format === key}
                                    data-sel-format={key}
                                    onChange={() => setFormat(key)}
                                />
                                <span>
                                    <Typography weight="bold">{t(`label.export.${key}.name`)}</Typography>
                                    <Typography variant="caption" className={styles.subtitle}>
                                        {t(`label.export.${key}.hint`)}
                                    </Typography>
                                </span>
                            </label>
                        ))}
                    </div>

                    <Typography className={styles.exportSectionLabel} variant="caption" weight="bold">
                        {t('label.export.columns')}
                    </Typography>
                    <ContentTypesColumnsPicker
                        lockedLabel={t('label.table.name')}
                        availableFields={availableFields}
                        visibleFields={chosen}
                        footerNoteKey="label.export.columnsNote"
                        resetLabelKey="label.export.columnsReset"
                        toggleField={toggleField}
                        moveField={moveField}
                        resetToDefaults={resetToDefaults}
                    />
                </ModalBody>
                <ModalFooter>
                    <Button size="big" variant="ghost" label={t('label.export.cancel')} onClick={onClose}/>
                    <Button
                        size="big"
                        variant="default"
                        color="accent"
                        label={t('label.export.download')}
                        data-sel-role="export-download"
                        onClick={download}
                    />
                </ModalFooter>
            </>
        </Modal>
    );
};

ContentTypesExportDialog.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    /** The ticked rows, in the shape the table fetched them - which is why no request is needed. */
    nodes: PropTypes.array.isRequired,
    /** The type being listed, which names the file. */
    contentType: PropTypes.string.isRequired,
    /** What the table is showing, which is what the export starts from. */
    visibleFields: PropTypes.array.isRequired,
    /** The whole catalog, so a column can be exported without being shown first. */
    availableFields: PropTypes.array.isRequired,
    fieldsByKey: PropTypes.instanceOf(Map).isRequired,
    onClose: PropTypes.func.isRequired
};

export default ContentTypesExportDialog;
