import gql from 'graphql-tag';

/**
 * Every content type a site can hold, with whether Jahia considers it editorial.
 *
 * `jnt:content` rather than `jmix:editorialContent`, because a site's own main types are not
 * always flagged editorial - luxe:estate is queried and displayed rather than dropped into a page
 * - and an administrator has to be able to list them. The editorial flag is what the accordion
 * falls back to when nobody has chosen, and what the settings screen marks each type with.
 */
export const GET_SITE_CONTENT_TYPES = gql`
    query getSiteContentTypes($siteKey: String!, $language: String!) {
        jcr {
            nodeTypes(filter: {
                siteKey: $siteKey,
                includeTypes: ["jnt:content"],
                includeMixins: false,
                includeAbstract: false
            }) {
                nodes {
                    name
                    displayName(language: $language)
                    editorial: isNodeType(type: {types: ["jmix:editorialContent"]})
                    icon
                }
            }
        }
    }
`;

/**
 * A content type's own fields, for the columns picker.
 *
 * `properties` returns everything the type can carry, inherited included, which is why each entry
 * is checked against `declaringNodeType`: only the ones actually declared on the type itself are
 * its own fields. Everything else on that list - jcr:created and the rest - is common to every
 * node and is offered from a fixed catalog instead, not from here.
 */
export const GET_CONTENT_TYPE_FIELDS = gql`
    query getContentTypeFields($type: String!, $language: String!) {
        jcr {
            nodeTypeByName(name: $type) {
                name
                # What the Name column shows. Jahia draws a node's display name from its type's
                # primary item, which is a different property for every type - title on an estate,
                # lastName on a realtor - and the node's own name where a type names none. Asking
                # for it is what lets that column be filtered on the value it actually displays.
                primaryItem {
                    name
                }
                properties {
                    name
                    displayName(language: $language)
                    hidden
                    protected
                    multiple
                    requiredType
                    # Both are for bulk editing rather than for display. An internationalized
                    # property *must* be written with a language - without one the server answers
                    # ConstraintViolationException: no matching property definition found - and a
                    # mandatory one cannot be cleared, which is worth knowing before offering to.
                    internationalized
                    mandatory
                    # What a reference is allowed to point at, which is how an image column is told
                    # from a reference to anything else: an image column constrains its target to
                    # jmix:image.
                    constraints
                    declaringNodeType {
                        name
                    }
                }
            }
        }
    }
`;

/**
 * What a constrained property's stored values are called, in the reader's language.
 *
 * A choicelist keeps a code - `swimmingPool`, `house`, `AF` - and the label lives in the defining
 * module's resource bundle, not in the content, so the stored value on its own means nothing to
 * anyone who did not write the type. This is the same form Content Editor builds, asked only for its
 * value constraints, so a value reads in the table exactly as it reads in the editor.
 *
 * `createForm` rather than the node type definition because `constraints` there returns the raw
 * values and no labels at all. It answers for a type that could not actually be created under this
 * path - luxe:estate belongs under an agency - which is what makes one path serve every type.
 *
 * Fields of the type itself are the ones that matter; the rest belong to mixins the table does not
 * render, and their names could otherwise collide with a property of the same name.
 *
 * **`uiLocale` is what resolves the labels, and `locale` has no bearing on them at all** - measured
 * against a site, all four combinations of the two: `uiLocale: fr` answers Piscine whichever locale
 * accompanies it, `uiLocale: en` answers Swimming Pool. So the language the table is being read in
 * is passed as `uiLocale`, not as `locale`. Both carry it, since the form is asked for nothing but
 * its constraints and `locale` has nothing left to influence.
 */
export const GET_CONTENT_TYPE_VALUE_LABELS = gql`
    query getContentTypeValueLabels($type: String!, $language: String!, $path: String!) {
        forms {
            createForm(primaryNodeType: $type, uiLocale: $language, locale: $language, uuidOrPath: $path) {
                sections {
                    fieldSets {
                        fields {
                            name
                            declaringNodeType
                            valueConstraints {
                                value {
                                    string
                                }
                                displayValue
                            }
                        }
                    }
                }
            }
        }
    }
`;

/**
 * Category labels for the content types, as Jahia groups them.
 *
 * Used only for grouping. This answers "what may be created under this path", so it is not a
 * complete list of a site's types: luxe:estate is created under an agency, not under /contents,
 * and never appears here. The complete list comes from GET_SITE_CONTENT_TYPES, and whatever this
 * tree does not account for is grouped as uncategorised.
 */
export const GET_CONTENT_TYPE_TREE = gql`
    query getContentTypeTree($path: String!, $uilang: String!) {
        forms {
            contentTypesAsTree(
                uuidOrPath: $path,
                uiLocale: $uilang,
                nodeTypes: ["jnt:content"],
                includeSubTypes: true
            ) {
                name
                label
                children {
                    name
                    label
                }
            }
        }
    }
`;

/**
 * The types an administrator chose to list, or nothing when the choice was never made.
 *
 * Access is not checked here. The settings screen is gated by the adminRoute's requiredPermission,
 * and the mutation still needs write access to the site node, which is what actually stops an
 * editor from changing a site wide setting.
 */
export const GET_LISTED_TYPES = gql`
    query getListedTypes($sitePath: String!) {
        jcr(workspace: EDIT) {
            nodeByPath(path: $sitePath) {
                uuid
                listedTypes: property(name: "ct:listedTypes") {
                    values
                }
            }
        }
    }
`;

/**
 * Stores the choice on the site node.
 *
 * The mixin is added on every save because the site will not carry it until the first one, and
 * adding it again is harmless. Saving an empty list clears the choice, which reads as "list
 * everything" rather than "list nothing".
 */
export const SET_LISTED_TYPES = gql`
    mutation setListedTypes($sitePath: String!, $types: [String]!) {
        jcr {
            mutateNode(pathOrId: $sitePath) {
                addMixins(mixins: ["ct:contentTypesListing"])
                mutateProperty(name: "ct:listedTypes") {
                    setValues(values: $types)
                }
            }
        }
    }
`;

/**
 * Who may be given a task on this site.
 *
 * Two questions in one round trip, because neither answers on its own. The site's access control
 * says which principal holds which role; the roles tree says which of those roles may actually
 * change content. `roleGroup` looks like it would answer the second and does not - `privileged` is
 * declared an `edit-role` and carries no write permission - so the permission names are read
 * instead, and the tree is read whole because a child role inherits its parent's permissions and
 * declares none of its own (`/roles/editor/editor-in-chief`).
 *
 * `aclEntries` includes entries inherited from above the site, which is how a group granted a role
 * server-wide still counts here.
 */
export const GET_EDITING_PRINCIPALS = gql`
    query getEditingPrincipals($sitePath: String!) {
        jcr(workspace: EDIT) {
            site: nodeByPath(path: $sitePath) {
                acl {
                    aclEntries {
                        aclEntryType
                        role {
                            name
                        }
                        principal {
                            name
                            displayName
                            node {
                                path
                                primaryNodeType {
                                    name
                                }
                            }
                        }
                    }
                }
            }
            roles: nodeByPath(path: "/roles") {
                descendants(typesFilter: {types: ["jnt:role"]}) {
                    nodes {
                        name
                        path
                        permissions: property(name: "j:permissionNames") {
                            values
                        }
                    }
                }
            }
        }
    }
`;

/**
 * The users inside a set of groups.
 *
 * A group's membership is kept as `jnt:member` child nodes, each pointing at the principal through
 * `j:member` - so the member's own node, and with it the path a task needs, only exists once the
 * reference is resolved. `descendants` rather than `children` because a group's members are nested
 * one level down when the group holds sub groups.
 *
 * Asked separately from the query above rather than folded into it: which groups to expand is only
 * known once that one has answered.
 */
export const GET_GROUP_MEMBERS = gql`
    query getGroupMembers($paths: [String!]!) {
        jcr(workspace: EDIT) {
            nodesByPath(paths: $paths) {
                path
                members: descendants(typesFilter: {types: ["jnt:member"]}) {
                    nodes {
                        member: property(name: "j:member") {
                            refNode {
                                path
                                name
                                primaryNodeType {
                                    name
                                }
                                firstName: property(name: "j:firstName") {
                                    value
                                }
                                lastName: property(name: "j:lastName") {
                                    value
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`;

/**
 * The details a directly granted user needs before they can be offered in the list.
 *
 * The ACL answers with a principal and its node, which carries the path but not the name a colleague
 * is recognised by - those are properties of the user node and have to be asked for.
 */
export const GET_USERS_BY_PATH = gql`
    query getUsersByPath($paths: [String!]!) {
        jcr(workspace: EDIT) {
            nodesByPath(paths: $paths) {
                path
                name
                firstName: property(name: "j:firstName") {
                    value
                }
                lastName: property(name: "j:lastName") {
                    value
                }
            }
        }
    }
`;

/**
 * The languages a site has switched on, for the missing-translations column.
 *
 * `activeInEdit` rather than every language declared: a language that has been turned off is not one
 * anybody is expected to have translated into, and counting it would flag every record on the site.
 * Ordered as the site orders them, so the column reads in the same order everywhere.
 */
export const GET_SITE_LANGUAGES = gql`
    query getSiteLanguages($sitePath: String!) {
        jcr {
            nodeByPath(path: $sitePath) {
                site {
                    defaultLanguage
                    languages {
                        language
                        displayName
                        activeInEdit
                    }
                }
            }
        }
    }
`;

/**
 * The signed-in person, and whether they may write on this site.
 *
 * Needed because the ACL is not the whole answer to "who may edit". `root` holds
 * `jcr:write_default` on every site and appears in **no** ACL entry anywhere - not on the site and
 * not on the repository root, whose only grants are `reader` and `privileged`. Its rights come from
 * being the JCR super-user, which no query over access control can discover. So the site's own
 * grants under-report the editors by exactly the people whose rights do not come from a grant.
 *
 * `hasPermission` is asked of the site node instead: it is the server's own answer, arrived at
 * however the reader's rights happen to arise, so it covers the super-user and any future
 * server-level role without this module having to model either.
 *
 * Only the current user is resolved this way, not every administrator. Asking the same question of
 * somebody else is not possible - `hasPermission` answers for the session making the call - so a
 * second administrator who holds no site grant is still missing from the list. That is a known
 * limit, written down in useEditableUsers.
 */
export const GET_CURRENT_ASSIGNEE = gql`
    query getCurrentAssignee($sitePath: String!) {
        currentUser {
            username
            firstname
            lastname
            node {
                path
                name
            }
        }
        jcr(workspace: EDIT) {
            site: nodeByPath(path: $sitePath) {
                hasPermission(permissionName: "jcr:write_default")
            }
        }
    }
`;

/**
 * Whether the site already has somewhere to keep its tasks.
 *
 * Asked rather than assumed, because `addNode` on an existing node fails and the container is
 * created by whoever raises the first task on a site. `nodeByPath` on a missing node is an error
 * rather than a null, so the caller reads the error as "not there yet" - see useAssignTask.
 */
export const GET_TASKS_NODE = gql`
    query getTasksNode($path: String!) {
        jcr(workspace: EDIT) {
            nodeByPath(path: $path) {
                uuid
            }
        }
    }
`;

/** The container a site keeps its tasks in, created on the first task raised there. */
export const CREATE_TASKS_NODE = gql`
    mutation createTasksNode($sitePath: String!) {
        jcr(workspace: EDIT) {
            addNode(parentPathOrId: $sitePath, name: "tasks", primaryNodeType: "jnt:tasks") {
                uuid
            }
        }
    }
`;

/**
 * The task itself, in one call.
 *
 * `ct:taskTarget` is this module's own mixin and is what carries the records the task was raised
 * for; `jnt:task` has no property for that, core linking a task to content only on the workflow
 * subtype. The references travel in `properties` like everything else, typed WEAKREFERENCE so the
 * server resolves each uuid to the node rather than storing the string - which is what an untyped
 * entry would do, leaving a reference property holding text that points at nothing.
 *
 * `useAvailableNodeName` lets the server settle the collision, so raising a second task on a site
 * does not fail on the name of the first.
 */
export const CREATE_TASK = gql`
    mutation createTask($tasksPath: String!, $name: String!, $properties: [InputJCRProperty]!) {
        jcr(workspace: EDIT) {
            addNode(
                parentPathOrId: $tasksPath,
                name: $name,
                primaryNodeType: "jnt:task",
                useAvailableNodeName: true,
                mixins: ["ct:taskTarget"],
                properties: $properties
            ) {
                uuid
                node {
                    path
                }
            }
        }
    }
`;

/**
 * Setting one multi-valued property across every ticked row, in one call.
 *
 * `mutateNodes` takes the whole selection, so a hundred records cost one round trip rather than a
 * hundred. The mixin is added on the way past: a node that has never carried a tag has neither the
 * mixin nor the property, and setting a property its type does not declare is an error.
 *
 * `setValues` rather than `addValues` - partly because replacing is what the dialog offers, and
 * partly because `addValues` on a property that does not exist yet fails outright, the mixin having
 * defined the property without creating it.
 */
export const SET_BULK_FIELD = gql`
    mutation setBulkField(
        $paths: [String]!,
        $mixins: [String]!,
        $property: String!,
        $type: JCRPropertyType!,
        $values: [String]!
    ) {
        jcr(workspace: EDIT) {
            mutateNodes(pathsOrIds: $paths) {
                addMixins(mixins: $mixins)
                mutateProperty(name: $property) {
                    setValues(type: $type, values: $values)
                }
            }
        }
    }
`;

/**
 * Replacing one of a content type's own properties across every ticked row.
 *
 * Four documents rather than one with optional arguments, because the two axes that vary cannot be
 * expressed as a nullable variable:
 *
 * - **single against multiple** is `setValue` against `setValues`, two different fields;
 * - **per-language against not** is whether `language` is passed at all. Passing it as null is not
 *   the same as omitting it: an internationalized property has one definition per language and the
 *   server answers `ConstraintViolationException: no matching property definition found` without
 *   one, while a property that is not internationalized has no per-language definition to find.
 *
 * `mutateNodes` takes the whole selection, so the cost is one round trip whatever the size of it.
 * Clearing is its own mutation below - `delete` takes no value and no type.
 */
export const SET_PROPERTY = gql`
    mutation setProperty($paths: [String]!, $property: String!, $type: JCRPropertyType!, $value: String!) {
        jcr(workspace: EDIT) {
            mutateNodes(pathsOrIds: $paths) {
                mutateProperty(name: $property) {
                    setValue(type: $type, value: $value)
                }
            }
        }
    }
`;

export const SET_PROPERTY_I18N = gql`
    mutation setPropertyI18n($paths: [String]!, $property: String!, $type: JCRPropertyType!, $value: String!, $language: String!) {
        jcr(workspace: EDIT) {
            mutateNodes(pathsOrIds: $paths) {
                mutateProperty(name: $property) {
                    setValue(type: $type, value: $value, language: $language)
                }
            }
        }
    }
`;

export const SET_PROPERTY_VALUES = gql`
    mutation setPropertyValues($paths: [String]!, $property: String!, $type: JCRPropertyType!, $values: [String]!) {
        jcr(workspace: EDIT) {
            mutateNodes(pathsOrIds: $paths) {
                mutateProperty(name: $property) {
                    setValues(type: $type, values: $values)
                }
            }
        }
    }
`;

export const SET_PROPERTY_VALUES_I18N = gql`
    mutation setPropertyValuesI18n($paths: [String]!, $property: String!, $type: JCRPropertyType!, $values: [String]!, $language: String!) {
        jcr(workspace: EDIT) {
            mutateNodes(pathsOrIds: $paths) {
                mutateProperty(name: $property) {
                    setValues(type: $type, values: $values, language: $language)
                }
            }
        }
    }
`;

/**
 * Emptying a property across the selection.
 *
 * The server refuses this on a property the definition makes mandatory - it answers "This field is
 * mandatory" and rejects the whole mutation - so the dialog does not offer it there. See
 * `canApplyEdit`.
 */
export const CLEAR_PROPERTY = gql`
    mutation clearProperty($paths: [String]!, $property: String!) {
        jcr(workspace: EDIT) {
            mutateNodes(pathsOrIds: $paths) {
                mutateProperty(name: $property) {
                    delete
                }
            }
        }
    }
`;

export const CLEAR_PROPERTY_I18N = gql`
    mutation clearPropertyI18n($paths: [String]!, $property: String!, $language: String!) {
        jcr(workspace: EDIT) {
            mutateNodes(pathsOrIds: $paths) {
                mutateProperty(name: $property) {
                    delete(language: $language)
                }
            }
        }
    }
`;

/**
 * The name each mutation kind resolves to.
 *
 * Written once and looked up by name rather than spelled out at each call site: a mutation document
 * paired with variables built for a different one is a runtime error with nothing on screen to
 * explain it, and two copies of this map are exactly how that pairing comes apart. Kept here, with
 * the documents themselves, because every surface that writes a property needs the same six and
 * none of them owns the set.
 */
export const MUTATIONS = {
    CLEAR_PROPERTY,
    CLEAR_PROPERTY_I18N,
    SET_PROPERTY,
    SET_PROPERTY_I18N,
    SET_PROPERTY_VALUES,
    SET_PROPERTY_VALUES_I18N
};

/**
 * What the selected records hold, read just before a bulk operation replaces it.
 *
 * The snapshot an undo is written from. Read from the repository rather than taken from the rows on
 * screen, because the table cannot answer two of the cases: a column the reader has hidden has no
 * values in the rows at all, and the category column carries display names where a restore needs
 * uuids.
 *
 * `value` and `values` are both asked for and one of them answers - checked against a site, a
 * single-valued property returns its `value` with `values` null. That is what lets one document
 * serve both shapes instead of the caller having to know which it is asking about.
 *
 * The language is always passed. It is what an internationalized property is read through, and it is
 * simply ignored by one that is not - the record query already reads every common property this way.
 */
export const CAPTURE_VALUES = gql`
    query captureValues($paths: [String!]!, $property: String!, $language: String!) {
        jcr(workspace: EDIT) {
            nodesByPath(paths: $paths) {
                path
                property(name: $property, language: $language) {
                    value
                    values
                }
            }
        }
    }
`;

/**
 * The same, for a property that holds references.
 *
 * Separate because `refNodes` cannot simply be added to the query above: asking it of a property
 * that is not a reference makes the server report an internal error on every request - the field
 * still resolves to null and the response arrives intact, so it is easy to miss and is a real error
 * the platform logs. See the same note in ContentTypesRecordQuery.
 *
 * The uuid is what is captured, since that is what the property stores and what putting it back
 * means; the display names the table shows would restore nothing.
 */
export const CAPTURE_REFERENCES = gql`
    query captureReferences($paths: [String!]!, $property: String!, $language: String!) {
        jcr(workspace: EDIT) {
            nodesByPath(paths: $paths) {
                path
                property(name: $property, language: $language) {
                    refNodes {
                        uuid
                    }
                }
            }
        }
    }
`;

/** Removing the task an Assign to raised, which is how that operation is taken back. */
export const DELETE_TASK = gql`
    mutation deleteTask($uuid: String!) {
        jcr(workspace: EDIT) {
            deleteNode(pathOrId: $uuid)
        }
    }
`;

export const CAPTURE_TIMESTAMPS = gql`
    query captureTimestamps($paths: [String!]!, $translationPath: String!) {
        jcr(workspace: EDIT) {
            nodesByPath(paths: $paths) {
                path
                lastModified: property(name: "jcr:lastModified") {
                    value
                }
                lastModifiedBy: property(name: "jcr:lastModifiedBy") {
                    value
                }
                lastPublished: property(name: "j:lastPublished") {
                    value
                }
                translation: descendant(relPath: $translationPath) {
                    path
                    lastModified: property(name: "jcr:lastModified") {
                        value
                    }
                    lastModifiedBy: property(name: "jcr:lastModifiedBy") {
                        value
                    }
                    lastPublished: property(name: "j:lastPublished") {
                        value
                    }
                }
            }
        }
    }
`;

/**
 * Which types may be created at a given path, as Content Editor itself resolves it.
 *
 * `forms.contentTypesAsTree` is the API behind Content Editor's own create flow, so asking it is how
 * this module gets the same answer the editor would act on rather than a second opinion of its own.
 * Only the names are selected - the labels and icons the editor's type selector draws are of no use
 * to a caller that just needs to know whether the answer is empty.
 *
 * `excludedNodeTypes` is passed explicitly rather than left to default, because the default lives in
 * Content Editor and this query is asked separately from the call that uses its answer; the two
 * would drift apart the moment one of them changed.
 */
export const GET_CREATABLE_TYPES = gql`
    query getCreatableTypes(
        $nodeTypes: [String],
        $includeSubTypes: Boolean,
        $path: String!,
        $uilang: String!,
        $excludedNodeTypes: [String]
    ) {
        forms {
            contentTypesAsTree(
                nodeTypes: $nodeTypes,
                includeSubTypes: $includeSubTypes,
                uuidOrPath: $path,
                uiLocale: $uilang,
                excludedNodeTypes: $excludedNodeTypes
            ) {
                name
                children {
                    name
                }
            }
        }
    }
`;

/**
 * Whether a type's folder is already there.
 *
 * The same shape as GET_TASKS_NODE and for the same reason: `addNode` on an existing node fails, and
 * the folder is created by whoever adds the first record of that type. `nodeByPath` on a missing node
 * answers with an error rather than a null, so the caller reads the error as "not there yet".
 */
/**
 * Where records of one type already live, so a home can be found for a new one.
 *
 * Only the parents' TYPES are wanted, but a type cannot be asked "what holds you" - there is no such
 * field - so the records are asked instead and their parents reported. See
 * ContentTypesCreateTarget for why the type is what gets inferred rather than the parents
 * themselves.
 *
 * A small page of records is enough: what is being looked for is which KINDS of node hold this type,
 * and a type held by two kinds will show both within a handful of rows. Reading every record of the
 * type to answer that would be a page of hundreds for one distinct value.
 */
export const GET_TYPE_PARENTS = gql`
    query getTypeParents($sitePath: String!, $type: String!, $language: String!) {
        jcr(workspace: EDIT) {
            nodesByCriteria(criteria: {language: $language, nodeType: $type, paths: [$sitePath]}, offset: 0, limit: 50) {
                nodes {
                    parent {
                        primaryNodeType {
                            name
                        }
                    }
                }
            }
        }
    }
`;

/**
 * Every node of one type in the site, as the containers a record could be filed into.
 *
 * Asked for the type rather than for the parents already in use, which is what makes a container
 * holding none of this type yet reachable - the empty agency somebody is about to file their first
 * estate into.
 *
 * **One type, because the criteria take one.** `nodesByCriteria` has a single `nodeType`, so where a
 * type is held by more than one kind of node this asks about the first kind found and the others go
 * unoffered. Left as it is deliberately: a type constrained to a declaring parent normally has
 * exactly one, and building a document with an alias per type - the way buildRecordQuery does - is
 * the answer if a real case ever turns up rather than a complication to carry for a hypothetical
 * one. A subtype is matched too, so a family of container types with a common supertype is already
 * covered by its supertype.
 */
export const GET_NODES_OF_TYPES = gql`
    query getNodesOfTypes($sitePath: String!, $type: String!, $language: String!) {
        jcr(workspace: EDIT) {
            nodesByCriteria(criteria: {language: $language, nodeType: $type, paths: [$sitePath]}, offset: 0, limit: 200) {
                nodes {
                    name
                    path
                    displayName(language: $language)
                }
            }
        }
    }
`;

export const GET_CONTENT_FOLDER = gql`
    query getContentFolder($path: String!) {
        jcr(workspace: EDIT) {
            nodeByPath(path: $path) {
                uuid
            }
        }
    }
`;

/**
 * The folder a type's records live in, created on the first record of that type.
 *
 * Name and primary type only. The tasks container is created the same way, and a folder that carries
 * nothing but its name has nothing in it to keep in step with the type it was named after.
 */
export const CREATE_CONTENT_FOLDER = gql`
    mutation createContentFolder($parentPath: String!, $name: String!) {
        jcr(workspace: EDIT) {
            addNode(parentPathOrId: $parentPath, name: $name, primaryNodeType: "jnt:contentFolder") {
                uuid
            }
        }
    }
`;
