import React, {useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Button, Dropdown, Modal, ModalBody, ModalFooter, ModalHeader, Typography} from '@jahia/moonstone';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/** Past this many containers a list is worth searching rather than scrolling. */
const SEARCHABLE_FROM = 12;

/**
 * Which container a new record of a constrained type goes into.
 *
 * Asked only where there is a genuine choice. A type a content folder will hold is filed without a
 * question at all, and one with a single possible container is filed into it - see
 * `targetDecision`. This is the remaining case: which agency this estate belongs to is not
 * something the module can work out, and guessing would put the record somewhere plausible and
 * wrong.
 *
 * A chosen container's full path is shown under the list: two of them can carry the same name - two
 * agencies named after the same city - and the path is what settles which is which.
 */
export const ContentTypesCreateTargetDialog = ({contentTypeLabel, targets, onCancel, onConfirm}) => {
    const {t} = useTranslation(NAMESPACE);
    const [path, setPath] = useState(null);
    const chosen = targets.find(target => target.path === path);

    return (
        <Modal
            isOpen
            size="medium"
            className={styles.dialogBox}
            data-sel-role="create-target-dialog"
            onOpenChange={open => !open && onCancel()}
        >
            <>
                {/* The heading is ModalHeader's `title` PROP: Moonstone renders a header only when
                    that is set, so a heading passed as a child draws nothing at all, silently. */}
                <ModalHeader title={t('label.createTarget.title', {type: contentTypeLabel})}/>
                <ModalBody>
                    <Typography variant="caption" className={styles.subtitle}>
                        {t('label.createTarget.explanation', {type: contentTypeLabel})}
                    </Typography>

                    <div className={styles.assignField}>
                        <Typography variant="caption" weight="bold">
                            {t('label.createTarget.container')}
                        </Typography>
                        <Dropdown
                            hasSearch={targets.length >= SEARCHABLE_FROM}
                            className={styles.bulkEditControl}
                            variant="outlined"
                            size="medium"
                            data={targets.map(target => ({label: target.label, value: target.path}))}
                            value={path}
                            label={chosen?.label || t('label.createTarget.placeholder')}
                            data-sel-role="create-target-choice"
                            onChange={(event, item) => setPath(item.value)}
                        />
                        {chosen && (
                            // Two containers can carry the same name - two agencies named after the
                            // same city - so the path is what settles which one this is. In full,
                            // there being room for it here, where the Path column has to trim.
                            <Typography variant="caption" className={styles.subtitle} data-sel-role="create-target-path">
                                {chosen.path}
                            </Typography>
                        )}
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button size="big" variant="ghost" label={t('label.bulkEdit.cancel')} onClick={onCancel}/>
                    <Button
                        size="big"
                        variant="default"
                        color="accent"
                        label={t('label.createTarget.confirm')}
                        disabled={!chosen}
                        data-sel-role="create-target-confirm"
                        onClick={() => onConfirm(chosen.path)}
                    />
                </ModalFooter>
            </>
        </Modal>
    );
};

ContentTypesCreateTargetDialog.propTypes = {
    /** The type being created, as the heading names it. */
    contentTypeLabel: PropTypes.string.isRequired,

    /** The containers to choose from, as `targetsFrom` built them: a path and a label each. */
    targets: PropTypes.array.isRequired,

    onCancel: PropTypes.func.isRequired,

    /** Given the chosen container's path. */
    onConfirm: PropTypes.func.isRequired
};

export default ContentTypesCreateTargetDialog;
