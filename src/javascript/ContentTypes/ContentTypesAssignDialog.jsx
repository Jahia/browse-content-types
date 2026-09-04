import React, {useMemo, useState} from 'react';
import PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {useApolloClient} from '@apollo/client';
import {Button, Input, Loader, Modal, ModalBody, ModalFooter, ModalHeader, Textarea, Typography} from '@jahia/moonstone';
import {CREATE_TASK, CREATE_TASKS_NODE, GET_TASKS_NODE} from './ContentTypes.gql';
import {TASK_NODE_NAME, assigneeSuggestions, canSubmit, taskProperties, tasksPath, userLabel} from './ContentTypesTasks';
import {useEditableUsers} from './useEditableUsers';
import {taskSnapshot} from './ContentTypesUndo';
import {recordUndo} from './useBulkUndo';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

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
    const [dueDate, setDueDate] = useState('');
    const [term, setTerm] = useState('');
    const [assignee, setAssignee] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [failed, setFailed] = useState(false);

    // Skipped while closed, so opening the bar's menu costs nothing until an editor actually asks
    // to assign something.
    const {users, loading} = useEditableUsers(siteKey, {skip: !isOpen});

    // Only what has been typed matches, and only while nobody is chosen - see assigneeSuggestions
    // for why this is an autocomplete rather than a list that opens on focus.
    const suggestions = useMemo(
        () => assigneeSuggestions(users, term, assignee),
        [users, term, assignee]
    );

    const reset = () => {
        setTitle('');
        setDescription('');
        setDueDate('');
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
                        dueDate,
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
                {/* The title goes in `title`, not in children. Moonstone's ModalHeader is
                    `({title, children}) => title && <header>...</header>`: with no `title` it
                    renders nothing at all, and children are its optional subtitle rather than its
                    heading. Passing the heading as a child therefore showed no header whatsoever -
                    silently, since a component returning false is not an error. It also builds its
                    own Typography, so wrapping the string in one is neither needed nor honoured. */}
                <ModalHeader title={t('label.assign.title')}/>
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

                    {/* A native date input: Moonstone publishes no date picker (its DatePicker
                        lives in moonstone-alpha, which this module does not depend on), and a
                        due date is a day rather than an instant. Optional - `dueDate` is not
                        mandatory on `jnt:task`, and the property is simply omitted when this is
                        left empty, the same way the description is. `min` stops yesterday being
                        chosen by accident; a due date already past helps nobody. */}
                    <label className={styles.assignField} htmlFor="assign-due-date">
                        <Typography variant="caption" weight="bold">{t('label.assign.dueDate')}</Typography>
                        <input
                            id="assign-due-date"
                            type="date"
                            className={styles.assignDueDate}
                            value={dueDate}
                            min={new Date().toISOString().slice(0, 10)}
                            data-sel-role="assign-due-date"
                            onChange={event => setDueDate(event.target.value)}
                        />
                    </label>

                    <label className={styles.assignField} htmlFor="assign-assignee">
                        <Typography variant="caption" weight="bold">{t('label.assign.assignee')}</Typography>
                        {/* The box and its list share a wrapper of their own, and it is that -
                            rather than the whole labelled field - the list is positioned against.
                            Anchored to the field group instead, an upward-opening list sits above
                            the caption, with the caption's height as a gap between it and the box
                            it belongs to, which reads as though it belongs to the field above. */}
                        <div className={styles.assignCombo}>
                            <Input
                                id="assign-assignee"
                                value={assignee ? userLabel(assignee) : term}
                                placeholder={t('label.assign.assigneePlaceholder')}
                                /*
                                    Off, or the browser offers a SECOND list of its own.
                                    Chrome remembers what has been typed into a named text box and
                                    offers it back below the field - browser chrome, not in the
                                    document, so nothing here can style or suppress it except this
                                    attribute. Two lists appeared at once, and only one of them
                                    worked: picking from Chrome's sets the text and nothing else, so
                                    `assignee` stayed null and Create task stayed disabled, while
                                    picking from ours records the person. One list, and it is ours.
                                */
                                autoComplete="off"
                                data-sel-role="assign-assignee"
                                onChange={event => {
                                    // Typing over a chosen name puts the choice back, so the box is
                                    // never showing one person while the form holds another.
                                    setAssignee(null);
                                    setTerm(event.target.value);
                                }}
                            />
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
                        </div>
                        {loading && <Loader size="small"/>}
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
                {/* Just the two buttons, as the Export dialog has: Moonstone's footer is
                    `alignCenter flexRow_reverse`, so they sit on one line at the right and the
                    footer is one control tall. It used to carry the undo promise and a spacer
                    beside them, which wrapped to two lines and took enough height off an
                    80vh-capped box to cut the form above it. */}
                <ModalFooter>
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
