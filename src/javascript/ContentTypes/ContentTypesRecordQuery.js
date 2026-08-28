import {parse} from 'graphql';

/**
 * Builds the two record queries (the full listing and the search) at runtime, because which
 * fields they fetch depends on which columns are visible - a choice made in the browser, not
 * something a document written once at build time can know about.
 *
 * Fields common to every node are always fetched, whether or not their column is currently shown:
 * there are few of them and each is a cheap scalar read, so asking for all of them unconditionally
 * is simpler and no more costly than tracking which ones are needed. A content type's own fields
 * are different - there can be many, and one can be a large text body - so only the ones actually
 * selected as visible are added to the query.
 */

/**
 * Fetched on every node regardless of which columns are visible.
 *
 * `primaryNodeType` backs the Content Type column: a type filter matches sub types too, so a
 * listing can hold rows of more than one type. `createdDate`/`lastModifiedBy`/`publishedOn`/
 * `publishedBy` are the same properties jContent's own content view already reads elsewhere in
 * the product, just not previously exposed as columns here.
 */
const COMMON_RECORD_FIELDS = `
    uuid
    name
    path
    displayName(language: $language)
    primaryNodeType {
        name
        displayName(language: $language)
    }
    # references/subNodes false: the badge reports this record's own state, not a roll-up of
    # everything it points at, which is what the list view shows too.
    aggregatedPublicationInfo(language: $language, references: false, subNodes: false) {
        publicationStatus
        existsInLive
    }
    createdBy: property(name: "jcr:createdBy", language: $language) {
        value
    }
    createdDate: property(name: "jcr:created", language: $language) {
        value
    }
    lastModified: property(name: "jcr:lastModified", language: $language) {
        value
    }
    lastModifiedBy: property(name: "jcr:lastModifiedBy", language: $language) {
        value
    }
    publishedOn: property(name: "j:lastPublished", language: $language) {
        value
    }
    publishedBy: property(name: "j:lastPublishedBy", language: $language) {
        value
    }
`;

/**
 * One selection per visible content-type field, aliased to the column's own key.
 *
 * `refNode`/`refNodes` are requested only for a genuine REFERENCE or WEAKREFERENCE property, never
 * unconditionally for every field. Verified against a live instance: asking for `refNodes` on a
 * multiple property that is not a reference (a plain multi-valued STRING, e.g. a list of language
 * codes) makes the server report "Internal Server Error(s) while executing query" - the field
 * still resolves to null and the rest of the response comes back intact, so it is easy to miss,
 * but it is a real error the platform logs on every single request. `refNode` (singular) on the
 * same kind of property does not fail the same way, which is what made the fault easy to miss
 * with a smaller field set. Restricting the two to properties actually typed as references avoids
 * the case entirely, and is also simply the more correct query: nothing else asks a scalar
 * property to resolve as a node reference.
 */
const dynamicFieldSelection = field => {
    const isReference = field.requiredType === 'REFERENCE' || field.requiredType === 'WEAKREFERENCE';
    const valuePart = field.multiple ? 'values' : 'value';
    const refPart = isReference ?
        (field.multiple ? 'refNodes { displayName(language: $language) }' : 'refNode { displayName(language: $language) }') :
        '';

    return `${field.key}: property(name: "${field.propertyName}", language: $language) { ${valuePart} ${refPart} }`;
};

const recordFields = dynamicFields => COMMON_RECORD_FIELDS + dynamicFields.map(dynamicFieldSelection).join('');

/**
 * Every record of one content type in a site, for when nothing is being searched for.
 *
 * Sorting and paging both happen on the server. Sorting one page in the browser would order only
 * the rows already fetched while presenting it as the whole set, so the sort has to travel with
 * the query; `totalCount` is what lets the table page without fetching everything.
 *
 * A type filter in JCR matches sub types too, so selecting a type also lists its sub types.
 */
export const buildListingQuery = dynamicFields => parse(`
    query getContentByType(
        $sitePath: String!,
        $type: String!,
        $language: String!,
        $offset: Int!,
        $limit: Int!,
        $fieldSorter: InputFieldSorterInput
    ) {
        jcr(workspace: EDIT) {
            nodeByPath(path: $sitePath) {
                uuid
                descendants(
                    typesFilter: {types: [$type]},
                    offset: $offset,
                    limit: $limit,
                    fieldSorter: $fieldSorter
                ) {
                    pageInfo {
                        totalCount
                    }
                    nodes {
                        ${recordFields(dynamicFields)}
                    }
                }
            }
        }
    }
`);

/**
 * The records of one content type in a site that match a search.
 *
 * Uses the same criteria search jContent's own search screen runs, so results and ranking behave
 * the way they already do elsewhere in the product. It returns the same
 * `pageInfo.totalCount` + `nodes` shape as the listing above, which is what lets the table page
 * and sort a search exactly as it pages and sorts the full set.
 *
 * The three constraints are an OR: full text anywhere in the record, the tag list, and the node
 * name. `contains` runs against the search index, so it matches whole words; the node name arm is
 * what gives substring matching, and is why a partial word still finds something.
 */
export const buildSearchQuery = dynamicFields => parse(`
    query searchContentByType(
        $sitePath: String!,
        $type: String!,
        $terms: String!,
        $nameTerms: String!,
        $language: String!,
        $offset: Int!,
        $limit: Int!,
        $fieldSorter: InputFieldSorterInput
    ) {
        jcr(workspace: EDIT) {
            nodesByCriteria(
                criteria: {
                    language: $language,
                    nodeType: $type,
                    paths: [$sitePath],
                    nodeConstraint: {
                        any: [
                            {contains: $terms}
                            {contains: $terms, property: "j:tagList"}
                            {like: $nameTerms, property: "j:nodename", function: LOWER_CASE}
                        ]
                    }
                },
                offset: $offset,
                limit: $limit,
                fieldSorter: $fieldSorter
            ) {
                pageInfo {
                    totalCount
                }
                nodes {
                    ${recordFields(dynamicFields)}
                }
            }
        }
    }
`);
