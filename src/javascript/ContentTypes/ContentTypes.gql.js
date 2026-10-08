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
                    # Which properties have a per-language value, which is what the untranslated
                    # column counts - see ContentTypesTranslations.
                    internationalized
                    # Read by nothing today. It was what told the replace-a-value form that a
                    # property could not be cleared, and it is what that form would want first;
                    # see DEFERRED.md.
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
 * What Content Editor's own form says about a type's fields: what a stored value is called, and
 * which control the field is edited with.
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
 *
 * `selectorType` rides along for a second reason entirely: it is the only place the selector from
 * the CND - `- text (string, richtext)` - can be read at all, the node type definition above having
 * no field for it. It is what tells a rich text property from a plain string, and so what makes one
 * unselectable as a column. See notSelectableReasonFor. Asking for it here is free; asking the form
 * a second time for it alone would not be.
 */
export const GET_CONTENT_TYPE_FORM_FIELDS = gql`
    query getContentTypeFormFields($type: String!, $language: String!, $path: String!) {
        forms {
            createForm(primaryNodeType: $type, uiLocale: $language, locale: $language, uuidOrPath: $path) {
                sections {
                    fieldSets {
                        fields {
                            name
                            declaringNodeType
                            selectorType
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

/**
 * What each node in the location picker has to say for itself.
 *
 * `parent { path }` is what lets one request fill several levels of the tree: the criteria take a
 * LIST of paths, so the children of every open branch are asked for together and grouped by their
 * parent on the way back. Without it the answer is one flat list with nothing saying which branch
 * each node came from.
 */
const CONTAINER_NODE_FIELDS = `
    uuid
    name
    path
    displayName(language: $language)
    primaryNodeType {
        name
        icon
    }
    parent {
        path
    }
`;

/**
 * The children of one or more nodes, as the location picker draws them.
 *
 * **Three criteria queries rather than one**, because `nodesByCriteria` takes a single `nodeType` -
 * the same limit `GET_NODES_OF_TYPES` documents - and a location can be any of three kinds of
 * thing: a content folder, a page, or content that accepts children of its own. Aliased into one
 * document so it is still one request per expansion.
 *
 * `pathType: PARENT` is what makes these children rather than descendants. The criteria default to
 * ANCESTOR, which is what every other query here relies on - `GET_TYPE_PARENTS` asks for everything
 * under the site - so this is the same field those queries leave unset.
 *
 * Deliberately NOT asked of the whole site at once. A tree is read one branch at a time and a site's
 * content runs to thousands of nodes; fetching it all to show the half dozen a reader opens would
 * cost more than every other query in this module put together.
 */
export const GET_CHILD_CONTAINERS = gql`
    query getChildContainers($paths: [String]!, $language: String!) {
        jcr(workspace: EDIT) {
            folders: nodesByCriteria(
                criteria: {paths: $paths, pathType: PARENT, nodeType: "jnt:contentFolder", language: $language}
                offset: 0
                limit: 500
            ) {
                nodes {
                    ${CONTAINER_NODE_FIELDS}
                }
            }
            pages: nodesByCriteria(
                criteria: {paths: $paths, pathType: PARENT, nodeType: "jnt:page", language: $language}
                offset: 0
                limit: 500
            ) {
                nodes {
                    ${CONTAINER_NODE_FIELDS}
                }
            }
            content: nodesByCriteria(
                criteria: {paths: $paths, pathType: PARENT, nodeType: "jnt:content", language: $language}
                offset: 0
                limit: 500
            ) {
                nodes {
                    ${CONTAINER_NODE_FIELDS}
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
