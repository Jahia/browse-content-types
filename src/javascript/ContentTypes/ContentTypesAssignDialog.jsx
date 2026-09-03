import React, {useMemo, useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {useApolloClient} from '@apollo/client';
import {Button, Input, Loader, Modal, ModalBody, ModalFooter, ModalHeader, Textarea, Typography} from '@jahia/moonstone';
import {CREATE_TASK, CREATE_TASKS_NODE, GET_TASKS_NODE} from './ContentTypes.gql';
import {TASK_NODE_NAME, canSubmit, matchesTerm, taskProperties, tasksPath, userLabel} from './ContentTypesTasks';
import {useEditableUsers} from './useEditableUsers';
import {taskSnapshot} from './ContentTypesUndo';
import {recordUndo} from './useBulkUndo';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/** How many names the box offers at once, so a large site does not drop a list over the form. */
const MAX_SUGGESTIONS = 8;

/**
 * Raising one task for the ticked rows.
 *
 * One task rather than one per record: the form asks for a title and a description once, and that
 * describes a job rather than a record. Which records the job is about is carried two ways - as
 * references on this module's own `ct:taskTarget` mixin, which a tool can follow, and as paths in
 * the description, which is what the person opening it in the My Tasks dashboard actually sees,
 * that dashboard knowing nothing of the mixin.
 *
 * The assignee box is an autocomplete rather than a dropdown because the list is a site's editors,
 * which is a handful on some sites and a long list on others, and typing a surname is how somebody
 * is found in either case. The whole list is fetched once and filtered here - see useEditableUsers
 * for why that is not a query per keystroke.
 */
export const ContentTypesAssignDialog = ({isOpen, nodes, siteKey, onClose}) => {
    const {t} = useTranslation(NAMESPACE);
    const client = useApolloClient();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [term, setTerm] = useState('');
    const [assignee, setAssignee] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [failed, setFailed] = useState(false);

    // Skipped while closed, so opening the bar's menu costs nothing until an editor actually asks
    // to assign something.
    const {users, loading} = useEditableUsers(siteKey, {skip: !isOpen});

    // The box shows the chosen person's own label once somebody is chosen, and no list with it:
    // suggestions under a filled box invite a second choice nobody asked to make.
    const suggestions = useMemo(
        () => (assignee ? [] : users.filter(user => matchesTerm(user, term)).slice(0, MAX_SUGGESTIONS)),
        [users, term, assignee]
    );

    const reset = () => {
        setTitle('');
        setDescription('');
        setTerm('');
        setAssignee(null);
        setFailed(false);
    };

    const close = () => {
        reset();
        onClose();
    };

    /**
     * Creating the container, then the task.
     *
     * The container is created only where it is missing, which is the first task raised on a site.
     * Asking for it is the test: `nodeByPath` errors on a node that is not there rather than
     * answering null, so the failure of that query is what says it has to be made - not an error
     * worth reporting.
     */
    const submit = async () => {
        setIsSaving(true);
        setFailed(false);

        const path = tasksPath(siteKey);
        try {
            try {
                await client.query({query: GET_TASKS_NODE, variables: {path}, fetchPolicy: 'network-only'});
            } catch {
                await client.mutate({
                    mutation: CREATE_TASKS_NODE,
                    variables: {sitePath: `/sites/${siteKey}`}
                });
            }

            const created = await client.mutate({
                mutation: CREATE_TASK,
                variables: {
                    tasksPath: path,
                    name: TASK_NODE_NAME,
                    properties: taskProperties({
                        title,
                        description,
                        assigneePath: assignee.path,
                        paths: nodes.map(node => node.path),
                        uuids: nodes.map(node => node.uuid).filter(Boolean)
                    })
                }
            });

            // Undoing a task is removing it again - there is no previous value to restore, the
            // operation having created something rather than replaced anything.
            const uuid = created?.data?.jcr?.addNode?.uuid;
            if (uuid) {
                recordUndo(taskSnapshot({label: t('label.assign.title'), uuid, count: nodes.length}));
            }

            close();
        } catch {
            // Left open with the form as it was: retyping a description because a save failed is
            // the worst thing a dialog can ask of somebody.
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
            data-sel-role="assign-dialog"
            onOpenChange={open => !open && close()}
        >
            <>
                <ModalHeader>
                    <Typography variant="heading" weight="bold">{t('label.assign.title')}</Typography>
                </ModalHeader>
                <ModalBody>
                    <Typography className={styles.assignCount} variant="caption">
                        {t('label.assign.count', {count: nodes.length})}
                    </Typography>

                    <label className={styles.assignField} htmlFor="assign-title">
                        <Typography variant="caption" weight="bold">{t('label.assign.taskTitle')}</Typography>
                        <Input
                            id="assign-title"
                            value={title}
                            data-sel-role="assign-title"
                            onChange={event => setTitle(event.target.value)}
                        />
                    </label>

                    <label className={styles.assignField} htmlFor="assign-description">
                        <Typography variant="caption" weight="bold">{t('label.assign.description')}</Typography>
                        <Textarea
                            id="assign-description"
                            value={description}
                            rows={4}
                            data-sel-role="assign-description"
                            onChange={event => setDescription(event.target.value)}
                        />
                    </label>

                    <label className={styles.assignField} htmlFor="assign-assignee">
                        <Typography variant="caption" weight="bold">{t('label.assign.assignee')}</Typography>
                        <Input
                            id="assign-assignee"
                            value={assignee ? userLabel(assignee) : term}
                            placeholder={t('label.assign.assigneePlaceholder')}
                            data-sel-role="assign-assignee"
                            onChange={event => {
                                // Typing over a chosen name puts the choice back, so the box is
                                // never showing one person while the form holds another.
                                setAssignee(null);
                                setTerm(event.target.value);
                            }}
                        />
                        {loading && <Loader size="small"/>}
                        {!loading && suggestions.length > 0 && (
                            <ul className={styles.assignSuggestions} data-sel-role="assign-suggestions">
                                {suggestions.map(user => (
                                    <li key={user.path}>
                                        <button
                                            type="button"
                                            className={styles.assignSuggestion}
                                            data-sel-user={user.name}
                                            onClick={() => {
                                                setAssignee(user);
                                                setTerm('');
                                            }}
                                        >
                                            {userLabel(user)}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {/* Only once the list has arrived: "nobody can edit this site" is a strong
                            thing to say while the answer is still being fetched. */}
                        {!loading && users.length === 0 && (
                            <Typography variant="caption" data-sel-role="assign-no-editors">
                                {t('label.assign.noEditors')}
                            </Typography>
                        )}
                    </label>

                    {failed && (
                        <Typography variant="caption" data-sel-role="assign-error" className={styles.assignError}>
                            {t('label.assign.failed')}
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
                    <Button size="big" variant="ghost" label={t('label.assign.cancel')} onClick={close}/>
                    <Button
                        size="big"
                        variant="default"
                        color="accent"
                        label={t('label.assign.submit')}
                        disabled={!canSubmit({title, assignee}) || isSaving}
                        data-sel-role="assign-submit"
                        onClick={submit}
                    />
                </ModalFooter>
            </>
        </Modal>
    );
};

ContentTypesAssignDialog.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    /** The ticked rows the task is being raised for. Never empty while the dialog is reachable. */
    nodes: PropTypes.array.isRequired,
    siteKey: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired
};

export default ContentTypesAssignDialog;
