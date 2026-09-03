import {
    TASK_NODE_NAME,
    canSubmit,
    editableUsers,
    editingPrincipals,
    matchesTerm,
    rolesThatMayEdit,
    splitPrincipals,
    taskDescription,
    taskProperties,
    tasksPath,
    userLabel
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
        it('follows what was typed with the records it was raised for', () => {
            expect(taskDescription('Please review', ['/a', '/b'])).toBe('Please review\n\n/a\n/b');
        });

        // The description is optional; the paths alone already say what the task is about.
        it('is just the records when nothing was typed', () => {
            expect(taskDescription('', ['/a'])).toBe('/a');
        });

        it('is just the text when there are no records', () => {
            expect(taskDescription('Please review', [])).toBe('Please review');
        });
    });

    describe('taskProperties', () => {
        const form = {
            title: 'Check these',
            description: 'Before Friday',
            assigneePath: '/users/jb/ac/eh/pam',
            paths: ['/sites/luxe/contents/a'],
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
            const properties = taskProperties({...form, description: '', paths: []});
            expect(byName(properties).description).toBeUndefined();
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

    it('names the node recognisably, the server settling any collision', () => {
        expect(TASK_NODE_NAME).toBe('assigned-task');
    });
});
