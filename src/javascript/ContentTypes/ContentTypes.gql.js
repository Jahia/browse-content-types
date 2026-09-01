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
                properties {
                    name
                    displayName(language: $language)
                    hidden
                    protected
                    multiple
                    requiredType
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
