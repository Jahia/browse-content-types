/**
 * Raising a task from the selection, and working out who may be given one.
 *
 * Free of React, of the registry and of Apollo, the way ContentTypesFilters and ContentTypesCsv are:
 * what is worth getting right here is which users count as editors and what a task node is made of,
 * and both are pure functions of what the queries answered. The queries themselves are in
 * ContentTypes.gql, and the hook that runs them is useEditableUsers.
 */

/**
 * The permission that means "may change content", and the whole test for whether a role is an
 * editing role.
 *
 * Not the role's `roleGroup`, which is the obvious-looking answer and the wrong one: measured
 * against a site, `privileged` is declared `edit-role` and carries no write permission at all, so
 * filtering on the group would offer every logged-in user of the site as an editor. `reader` is
 * `live-role` and `site-administrator` is `site-role`, so the group separates those correctly and
 * hides the one case that matters.
 */
export const WRITE_PERMISSION = 'jcr:write_default';

/**
 * Roles are a tree, and a child role holds its parent's permissions.
 *
 * `/roles/editor/editor-in-chief` is how the repository says editor-in-chief is an editor: the child
 * node carries only what it adds, and `editor-in-chief` adds no `jcr:write_default` of its own
 * because it already has one. Reading a role's own property alone therefore reports the most senior
 * editing role on a site as unable to edit - checked against a site, where it is exactly the role the
 * one direct grant carries.
 *
 * So a role may edit when it, or any role above it, holds the write permission. Matched on the path,
 * which is where the repository keeps that relationship.
 */
export const rolesThatMayEdit = roleNodes => {
    const writers = (roleNodes || []).filter(
        role => (role.permissions?.values || []).includes(WRITE_PERMISSION)
    );

    return new Set((roleNodes || [])
        .filter(role => writers.some(
            writer => role.path === writer.path || role.path?.startsWith(`${writer.path}/`)
        ))
        .map(role => role.name));
};

/**
 * Which principals a site's own access control grants an editing role to.
 *
 * `DENY` entries are dropped: an entry that takes a role away is not one that gives it. `GRANT` and
 * `EXTERNAL` both give - the second is how a role reaches a principal through an external provider,
 * which on a site is the ordinary way a group is granted one, so ignoring it would miss most of the
 * editors on a site that manages access by group.
 */
export const editingPrincipals = (aclEntries, editingRoles) => (aclEntries || [])
    .filter(entry => entry.aclEntryType !== 'DENY')
    .filter(entry => editingRoles.has(entry.role?.name))
    .map(entry => entry.principal)
    .filter(Boolean);

/**
 * A principal is either the user themselves or a group standing in for its members.
 *
 * Split rather than resolved in one pass, because the two are answered by different queries: a user
 * principal already carries the node whose path a task needs, while a group has to be asked for its
 * membership. Deduplicated by path, since a site commonly grants the same person a role directly and
 * again through a group.
 */
export const splitPrincipals = principals => {
    const users = new Map();
    const groups = new Map();

    (principals || []).forEach(principal => {
        const node = principal.node;
        if (!node?.path) {
            return;
        }

        const bucket = node.primaryNodeType?.name === 'jnt:group' ? groups : users;
        bucket.set(node.path, {name: principal.name, displayName: principal.displayName, path: node.path});
    });

    return {users: [...users.values()], groups: [...groups.values()]};
};

/**
 * Everyone who may edit, as one list: those granted a role directly, and the members of every group
 * that was granted one.
 *
 * A group's membership arrives as `jnt:member` nodes pointing at the real principal, which may
 * itself be a group - a group inside a group is legal, and its members are members of both. Only
 * users are kept here: a task is assigned to a person, and the nested group's own members arrive
 * through the same expansion when that group is queried.
 *
 * Sorted by the name that is shown, so the list reads the same however the grants happen to be
 * ordered in the repository.
 */
export const editableUsers = (directUsers, groupMembers) => {
    const byPath = new Map();

    const keep = user => {
        if (user?.path) {
            byPath.set(user.path, user);
        }
    };

    (directUsers || []).forEach(keep);
    (groupMembers || []).forEach(keep);

    return [...byPath.values()].sort((a, b) => label(a).localeCompare(label(b)));
};

/**
 * How a person is named in the list.
 *
 * Their real name where the repository has one, since that is what a colleague is recognised by, and
 * the login beside it because two people can share a name and the login is what the task records.
 * A user with no first or last name - a technical account, most often - is named by their login
 * alone rather than by an empty string followed by a bracket.
 */
export const userLabel = user => {
    const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    return full ? `${full} (${user.name})` : (user?.name || '');
};

/** The same, for sorting - so that a name with no real name behind it still falls in order. */
const label = user => userLabel(user).toLowerCase();

/**
 * Whether a user answers what has been typed into the box.
 *
 * Matched on the login and on the real name, because a reader looking for a colleague types whichever
 * of the two they know. Case-insensitive, and anywhere in the value rather than at its start: a
 * surname typed on its own should find someone whose entry begins with their first name.
 */
export const matchesTerm = (user, term) => {
    const needle = String(term || '').trim().toLowerCase();
    if (!needle) {
        return true;
    }

    return userLabel(user).toLowerCase().includes(needle);
};

/**
 * Where a site keeps the tasks raised on it.
 *
 * Under the site rather than under the person the task is for, which is the decision the whole
 * feature rests on. Core's own TaskService puts a task at `<userPath>/tasks` and writes it with a
 * system session, because no ordinary editor may write inside another user's node - which would put
 * this operation out of reach of a module with no server side. The content-review module keeps its
 * tasks at `/sites/<site>/tasks` instead, which is ordinary site content, and the My Tasks dashboard
 * finds them all the same because it matches on `assigneeUserKey` rather than on where the node sits.
 *
 * Verified against a site: an editor with no administrative rights created a task there for another
 * user through a plain mutation.
 */
export const tasksPath = siteKey => `/sites/${siteKey}/tasks`;

/**
 * A name for the task node that says where it came from.
 *
 * The node name is not shown anywhere - the title is - so this only has to be recognisable in a JCR
 * browser and legal as a name. The server makes it unique on its own, the way every other node this
 * module creates is named.
 */
export const TASK_NODE_NAME = 'assigned-task';

/**
 * What the description records beyond what the reader typed.
 *
 * The paths are written into the text as well as being referenced by the mixin, because the two are
 * read by different things: the reference is what a tool can follow, and the text is what the person
 * opening the task in the My Tasks dashboard actually sees - that dashboard knows nothing of this
 * module's mixin and would show a task naming no content at all.
 */
export const taskDescription = (description, paths) => {
    const body = String(description || '').trim();
    const listed = (paths || []).join('\n');
    return [body, listed].filter(Boolean).join('\n\n');
};

/**
 * The properties of the task node, ready for the mutation.
 *
 * `assigneeUserKey` holds the assignee's **path**, despite the name - which is what core writes into
 * it and what the dashboard matches on. `assignee` is deliberately absent: it is the reference that
 * would say the same thing more precisely, and it is declared protected, so a mutation cannot set it
 * and does not need to.
 *
 * `state` and `priority` take the values the definition constrains them to - `active` and `normal`.
 * Worth stating because core's own TaskService writes `medium`, which is not among the three the
 * definition allows: its `Priority` enum was never reconciled with the CND, and the service is
 * deprecated for removal.
 *
 * `targetNode` is typed rather than left to default. It is a weak reference and its values are
 * uuids, and an untyped entry would store them as the strings they arrived as - a reference property
 * holding text that resolves to nothing, which reads as a set reference until something follows it.
 *
 * A property is omitted rather than sent empty when there is nothing to put in it, so a task with no
 * description carries no description instead of carrying an empty one.
 */
export const taskProperties = ({title, description, assigneePath, paths, uuids}) => {
    const properties = [
        {name: 'jcr:title', value: String(title || '').trim()},
        {name: 'state', value: 'active'},
        {name: 'priority', value: 'normal'},
        {name: 'assigneeUserKey', value: assigneePath}
    ];

    const body = taskDescription(description, paths);
    if (body) {
        properties.push({name: 'description', value: body});
    }

    if (uuids?.length > 0) {
        properties.push({name: 'targetNode', type: 'WEAKREFERENCE', values: uuids});
    }

    return properties;
};

/**
 * Whether the form holds enough to raise a task.
 *
 * A title and somebody to give it to. The description is optional - the paths alone already say what
 * the task is about - and the selection cannot be empty, the bar not being rendered without one.
 */
export const canSubmit = ({title, assignee}) => Boolean(String(title || '').trim()) && Boolean(assignee?.path);
