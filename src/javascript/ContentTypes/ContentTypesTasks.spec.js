import {
    MAX_SUGGESTIONS,
    TASK_NODE_NAME,
    assigneeSuggestions,
    canSubmit,
    dueDateValue,
    editableUsers,
    editingPrincipals,
    matchesTerm,
    rolesThatMayEdit,
    splitPrincipals,
    taskDescription,
    taskProperties,
    tasksPath,
    userLabel,
    withCurrentUser
} from './ContentTypesTasks';

/** A role node as the roles query returns one. */
const role = (name, path, permissions) => ({name, path, permissions: permissions ? {values: permissions} : null});

/** The roles tree as it stands on a stock instance, trimmed to what the cases need. */
const STOCK_ROLES = [
    role('reader', '/roles/reader', ['jcr:read_default']),
    role('privileged', '/roles/privileged', ['api-access']),
    role('editor', '/roles/editor', ['jcr:read_default', 'jcr:write_default', 'move']),
    role('editor-in-chief', '/roles/editor/editor-in-chief', null),
    role('translator', '/roles/translator', ['jcr:read_default']),
    role('translator-fr', '/roles/translator/translator-fr', null),
    role('site-administrator', '/roles/site-administrator', ['siteAdminOptions'])
];

const entry = (type, roleName, principal) => ({aclEntryType: type, role: {name: roleName}, principal});

const userPrincipal = (name, path) => ({name, displayName: name, node: {path, primaryNodeType: {name: 'jnt:user'}}});
const groupPrincipal = (name, path) => ({name, displayName: name, node: {path, primaryNodeType: {name: 'jnt:group'}}});

describe('ContentTypesTasks', () => {
    describe('rolesThatMayEdit', () => {
        it('keeps a role that holds the write permission', () => {
            expect(rolesThatMayEdit(STOCK_ROLES).has('editor')).toBe(true);
        });

        // The site's one direct grant on a live site is editor-in-chief, and it declares no
        // permissions of its own - it is an editor by sitting under /roles/editor. Reading each
        // role's own property alone reports the most senior editing role as unable to edit.
        it('keeps a child role, which inherits its parent\'s permissions', () => {
            expect(rolesThatMayEdit(STOCK_ROLES).has('editor-in-chief')).toBe(true);
        });

        it('drops a role that only reads', () => {
            expect(rolesThatMayEdit(STOCK_ROLES).has('reader')).toBe(false);
        });

        // The trap this whole approach exists to avoid: privileged is declared an edit-role and
        // grants no write at all, so filtering on roleGroup would offer every logged-in user.
        it('drops privileged, which is an edit-role that cannot write', () => {
            expect(rolesThatMayEdit(STOCK_ROLES).has('privileged')).toBe(false);
        });

        it('drops a child of a role that cannot write', () => {
            expect(rolesThatMayEdit(STOCK_ROLES).has('translator-fr')).toBe(false);
        });

        // A path prefix is not a parent: /roles/editor-in-chief would be a sibling of /roles/editor.
        it('does not treat a name that merely starts the same as a child', () => {
            const roles = [role('editor', '/roles/editor', ['jcr:write_default']), role('editorial', '/roles/editorial', null)];
            expect(rolesThatMayEdit(roles).has('editorial')).toBe(false);
        });

        it('has nothing to offer for no roles', () => {
            expect(rolesThatMayEdit([]).size).toBe(0);
            expect(rolesThatMayEdit(undefined).size).toBe(0);
        });
    });

    describe('editingPrincipals', () => {
        const editing = rolesThatMayEdit(STOCK_ROLES);

        it('keeps a direct grant of an editing role', () => {
            const entries = [entry('GRANT', 'editor-in-chief', userPrincipal('pam', '/users/jb/ac/eh/pam'))];
            expect(editingPrincipals(entries, editing).map(p => p.name)).toEqual(['pam']);
        });

        // EXTERNAL is how a role reaches a principal through a provider, and on a live site it is
        // how the one group that can edit is granted its role. Ignoring it loses most of the editors
        // on any site that manages access by group.
        it('keeps an EXTERNAL grant, which is how a group is usually granted its role', () => {
            const entries = [entry('EXTERNAL', 'editor', groupPrincipal('realtors', '/sites/luxe/groups/realtors'))];
            expect(editingPrincipals(entries, editing).map(p => p.name)).toEqual(['realtors']);
        });

        it('drops a DENY, which takes a role away rather than giving it', () => {
            const entries = [entry('DENY', 'editor', userPrincipal('pam', '/users/pam'))];
            expect(editingPrincipals(entries, editing)).toEqual([]);
        });

        it('drops a grant of a role that cannot edit', () => {
            const entries = [entry('GRANT', 'reader', userPrincipal('guest', '/users/guest'))];
            expect(editingPrincipals(entries, editing)).toEqual([]);
        });
    });

    describe('splitPrincipals', () => {
        it('tells a group apart from a user', () => {
            const {users, groups} = splitPrincipals([
                userPrincipal('pam', '/users/jb/ac/eh/pam'),
                groupPrincipal('realtors', '/sites/luxe/groups/realtors')
            ]);

            expect(users.map(u => u.name)).toEqual(['pam']);
            expect(groups.map(g => g.name)).toEqual(['realtors']);
        });

        // A site commonly grants the same person a role directly and again through a group, which on
        // a live site shows up as pam holding both a GRANT and an EXTERNAL entry.
        it('keeps one entry for a principal granted twice', () => {
            const {users} = splitPrincipals([
                userPrincipal('pam', '/users/jb/ac/eh/pam'),
                userPrincipal('pam', '/users/jb/ac/eh/pam')
            ]);

            expect(users).toHaveLength(1);
        });

        it('ignores a principal with no node behind it', () => {
            const {users, groups} = splitPrincipals([{name: 'ghost', node: null}]);
            expect(users).toEqual([]);
            expect(groups).toEqual([]);
        });
    });

    describe('editableUsers', () => {
        const pam = {name: 'pam', path: '/users/jb/ac/eh/pam', firstName: 'Pam', lastName: 'Pasteur'};
        const penny = {name: 'penny', path: '/users/hj/di/ac/penny', firstName: 'Penny', lastName: 'Galileo'};

        it('gathers those granted directly and those reached through a group', () => {
            expect(editableUsers([pam], [penny]).map(u => u.name)).toEqual(['pam', 'penny']);
        });

        it('keeps one entry for someone reached both ways', () => {
            expect(editableUsers([pam], [pam])).toHaveLength(1);
        });

        it('orders by the name that is shown, not by how the grants happened to arrive', () => {
            const zoe = {name: 'zoe', path: '/users/zoe', firstName: 'Zoe', lastName: 'Adams'};
            const abe = {name: 'abe', path: '/users/abe', firstName: 'Abe', lastName: 'Young'};
            expect(editableUsers([zoe, abe], []).map(u => u.name)).toEqual(['abe', 'zoe']);
        });

        it('has nothing to offer where nothing was granted', () => {
            expect(editableUsers([], [])).toEqual([]);
        });
    });

    describe('userLabel', () => {
        it('names a person by their real name, with the login that the task records', () => {
            expect(userLabel({name: 'pam', firstName: 'Pam', lastName: 'Pasteur'})).toBe('Pam Pasteur (pam)');
        });

        // A technical account has neither, and "  (jobs)" would read as a missing name rather than
        // as an account that simply has none.
        it('names an account with no real name by its login alone', () => {
            expect(userLabel({name: 'jobs'})).toBe('jobs');
        });

        it('copes with only one of the two names', () => {
            expect(userLabel({name: 'pam', firstName: 'Pam'})).toBe('Pam (pam)');
        });
    });

    describe('matchesTerm', () => {
        const pam = {name: 'pam', firstName: 'Pam', lastName: 'Pasteur'};

        it('offers everyone before anything is typed', () => {
            expect(matchesTerm(pam, '')).toBe(true);
            expect(matchesTerm(pam, '   ')).toBe(true);
        });

        it('matches the login', () => {
            expect(matchesTerm(pam, 'pam')).toBe(true);
        });

        // Typed by someone who knows the surname and not the login, which is the common case.
        it('matches a surname on its own, part way through the label', () => {
            expect(matchesTerm(pam, 'pasteur')).toBe(true);
        });

        it('ignores case', () => {
            expect(matchesTerm(pam, 'PASTEUR')).toBe(true);
        });

        it('rejects what nobody answers', () => {
            expect(matchesTerm(pam, 'zzz')).toBe(false);
        });
    });

    describe('tasksPath', () => {
        // Under the site, not under the assignee: a task under another user's node needs a system
        // session, which a module with no server side does not have.
        it('puts a site\'s tasks under the site', () => {
            expect(tasksPath('luxe')).toBe('/sites/luxe/tasks');
        });
    });

    describe('taskDescription', () => {
        // The paths used to be appended here so the task board could name the content. It reads
        // targetNode now, so the description is only what the person wrote.
        it('is what the person typed', () => {
            expect(taskDescription('Please review')).toBe('Please review');
        });

        it('trims it', () => {
            expect(taskDescription('  Please review  ')).toBe('Please review');
        });

        it('is empty when nothing was typed', () => {
            expect(taskDescription('')).toBe('');
            expect(taskDescription(null)).toBe('');
            expect(taskDescription(undefined)).toBe('');
        });
    });

    describe('taskProperties', () => {
        const form = {
            title: 'Check these',
            description: 'Before Friday',
            assigneePath: '/users/jb/ac/eh/pam',
            uuids: ['uuid-a', 'uuid-b']
        };

        const byName = properties => Object.fromEntries(properties.map(p => [p.name, p]));

        it('sets the title, trimmed', () => {
            expect(byName(taskProperties({...form, title: '  Check these  '}))['jcr:title'].value).toBe('Check these');
        });

        // The assignee's path, despite the property being named for a key - it is what core writes
        // and what the My Tasks dashboard matches on.
        it('records the assignee by path', () => {
            expect(byName(taskProperties(form)).assigneeUserKey.value).toBe('/users/jb/ac/eh/pam');
        });

        // Declared protected, so a mutation cannot set it - and does not need to.
        it('does not try to set the protected assignee reference', () => {
            expect(byName(taskProperties(form)).assignee).toBeUndefined();
        });

        // Core's own TaskService writes "medium", which is not one of the three the definition
        // allows: its Priority enum was never reconciled with the CND.
        it('uses the state and priority the definition constrains it to', () => {
            const properties = byName(taskProperties(form));
            expect(properties.state.value).toBe('active');
            expect(properties.priority.value).toBe('normal');
        });

        // Untyped, the uuids would be stored as the strings they arrived as - a reference property
        // holding text that resolves to nothing.
        it('types the references so the server resolves them to nodes', () => {
            const target = byName(taskProperties(form)).targetNode;
            expect(target.type).toBe('WEAKREFERENCE');
            expect(target.values).toEqual(['uuid-a', 'uuid-b']);
        });

        it('omits the description rather than sending an empty one', () => {
            const properties = taskProperties({...form, description: ''});
            expect(byName(properties).description).toBeUndefined();
        });

        it('sends the due date as a typed DATE when one was chosen', () => {
            const due = byName(taskProperties({...form, dueDate: '2026-09-15'})).dueDate;
            expect(due.type).toBe('DATE');
            expect(due.value).toBe('2026-09-15T12:00:00.000Z');
        });

        // The Due column on the tasks dashboard was empty for every task this module raised,
        // because the CND's now()+1day default is an initial value the content UI offers rather
        // than an autocreated one - a mutation has to send the property itself.
        it('omits the due date rather than sending an empty one', () => {
            expect(byName(taskProperties({...form, dueDate: ''})).dueDate).toBeUndefined();
            expect(byName(taskProperties(form)).dueDate).toBeUndefined();
        });

        it('omits a due date that is not a real day', () => {
            expect(byName(taskProperties({...form, dueDate: '2026-02-31'})).dueDate).toBeUndefined();
        });

        it('omits the references when there is nothing to point at', () => {
            expect(byName(taskProperties({...form, uuids: []})).targetNode).toBeUndefined();
        });
    });

    describe('canSubmit', () => {
        const assignee = {path: '/users/pam'};

        it('needs a title and somebody to give it to', () => {
            expect(canSubmit({title: 'Check these', assignee})).toBe(true);
        });

        it('refuses a title that is only spaces', () => {
            expect(canSubmit({title: '   ', assignee})).toBe(false);
        });

        it('refuses with nobody chosen', () => {
            expect(canSubmit({title: 'Check these', assignee: null})).toBe(false);
        });
    });

    describe('withCurrentUser', () => {
        const pam = {name: 'pam', path: '/users/jb/ac/eh/pam', firstName: 'Pam', lastName: 'Beesly'};
        const root = {name: 'root', path: '/users/root', firstName: 'Klem', lastName: 'Root'};

        // The reason this exists: root may write on every site and is in no ACL entry anywhere, so
        // a list built from the site's grants leaves out the very person usually raising the task.
        it('adds the reader when the site granted them nothing', () => {
            // Ordered by the label shown, so "Klem Root (root)" sorts before "Pam Beesly (pam)".
            expect(withCurrentUser([pam], root).map(user => user.name)).toEqual(['root', 'pam']);
        });

        it('does not list somebody twice when they are also a granted editor', () => {
            expect(withCurrentUser([pam], pam).map(user => user.path)).toEqual([pam.path]);
        });

        it('keeps the list in name order rather than appending', () => {
            const zoe = {name: 'zoe', path: '/users/zoe'};
            const amy = {name: 'amy', path: '/users/amy'};
            expect(withCurrentUser([zoe], amy).map(user => user.name)).toEqual(['amy', 'zoe']);
        });

        // Nothing is added when the server said the reader may not write here.
        it('leaves the list alone when there is no current user to add', () => {
            expect(withCurrentUser([pam], null).map(user => user.name)).toEqual(['pam']);
        });

        it('survives an empty granted list', () => {
            expect(withCurrentUser([], root).map(user => user.name)).toEqual(['root']);
        });
    });

    describe('dueDateValue', () => {
        // The one format the repository accepts, verified live: an offset form and a bare day are
        // both refused with ValueFormatException.
        it('turns a picked day into midday UTC in the accepted format', () => {
            expect(dueDateValue('2026-09-15')).toBe('2026-09-15T12:00:00.000Z');
        });

        // Midday rather than midnight so the stored instant names the same calendar day for a
        // reader in any timezone, rather than the day before east of UTC.
        it('names the same calendar day it was given', () => {
            expect(dueDateValue('2026-09-15').slice(0, 10)).toBe('2026-09-15');
        });

        it('handles the turn of a year', () => {
            expect(dueDateValue('2026-12-31')).toBe('2026-12-31T12:00:00.000Z');
        });

        it('accepts a real leap day', () => {
            expect(dueDateValue('2028-02-29')).toBe('2028-02-29T12:00:00.000Z');
        });

        // Date.UTC rolls an impossible day into the next month rather than refusing it, which
        // would store a due date that is not the one asked for.
        it('refuses a day that does not exist', () => {
            expect(dueDateValue('2026-02-31')).toBeNull();
        });

        it('refuses anything that is not a plain day', () => {
            expect(dueDateValue('2026-09-15T12:00:00.000Z')).toBeNull();
            expect(dueDateValue('15/09/2026')).toBeNull();
            expect(dueDateValue('not a date')).toBeNull();
        });

        it('treats nothing chosen as nothing to store', () => {
            expect(dueDateValue('')).toBeNull();
            expect(dueDateValue(null)).toBeNull();
            expect(dueDateValue(undefined)).toBeNull();
        });
    });

    describe('assigneeSuggestions', () => {
        const users = [
            {name: 'pam', path: '/users/pam', firstName: 'Pam', lastName: 'Pasteur'},
            {name: 'penny', path: '/users/penny', firstName: 'Penny', lastName: 'Galileo'},
            {name: 'root', path: '/users/root', firstName: 'Klem', lastName: 'Root'}
        ];

        // The point of the change: focusing the box used to drop the whole list over the form.
        it('offers nothing until something has been typed', () => {
            expect(assigneeSuggestions(users, '', null)).toEqual([]);
            expect(assigneeSuggestions(users, '   ', null)).toEqual([]);
            expect(assigneeSuggestions(users, null, null)).toEqual([]);
        });

        it('offers what the typed text matches', () => {
            expect(assigneeSuggestions(users, 'pen', null).map(u => u.name)).toEqual(['penny']);
        });

        it('matches a real name, not only the login', () => {
            expect(assigneeSuggestions(users, 'galileo', null).map(u => u.name)).toEqual(['penny']);
        });

        it('offers nothing once somebody is chosen', () => {
            expect(assigneeSuggestions(users, 'pen', users[1])).toEqual([]);
        });

        it('caps how many it offers, so the list cannot cover the form', () => {
            const many = Array.from({length: 40}, (_, i) => ({name: `user${i}`, path: `/users/user${i}`}));
            expect(assigneeSuggestions(many, 'user', null)).toHaveLength(MAX_SUGGESTIONS);
        });

        it('survives having no users to offer', () => {
            expect(assigneeSuggestions([], 'pam', null)).toEqual([]);
            expect(assigneeSuggestions(null, 'pam', null)).toEqual([]);
        });
    });

    it('names the node recognisably, the server settling any collision', () => {
        expect(TASK_NODE_NAME).toBe('assigned-task');
    });
});
