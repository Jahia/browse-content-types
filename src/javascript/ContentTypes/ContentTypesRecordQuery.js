import {parse} from 'graphql';
import {translationAlias, translationRelPath} from './ContentTypesTranslations';

/**
 * Builds the record query at runtime, because which fields it fetches depends on which columns are
 * visible - a choice made in the browser, not something a document written once at build time can
 * know about. What narrows it is a constraint built in the browser too, so searching and filtering
 * need no query of their own.
 *
 * Fields common to every node are always fetched, whether or not their column is currently shown:
 * there are few of them and they are fixed, so asking for all of them unconditionally is simpler
 * than tracking which ones are needed. Two of them are not scalar reads - `aggregatedPublicationInfo`
 * and the category references - but the publication badge is on by default anyway, and resolving a
 * handful of category names per row costs little beside it. A content type's own fields are
 * different: there can be many and one can be a large text body, so only those actually selected as
 * visible are added to the query.
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
    # Tags and categories come from mixins any node can carry, so they are read here with the rest of
    # the common fields rather than from a type's own definition. Both answer null on a node without
    # the mixin, which is the same nothing an unset property gives and needs no special case.
    # j:tagList holds the strings themselves; j:defaultCategory holds references, resolved to the
    # category's own name rather than left as a uuid. Verified against the definitions: both are
    # multi-valued and not internationalized, and j:tags is the hidden reference form of the tag list,
    # not the one an editor sets.
    tags: property(name: "j:tagList", language: $language) {
        values
    }
    categories: property(name: "j:defaultCategory", language: $language) {
        refNodes {
            displayName(language: $language)
        }
    }
    # Whether the record is locked, which any node can be. The two fields answer different questions
    # and the column shows both: details is who holds a lock and of what kind, empty when there is
    # none, while lockedAndCannotBeEdited is whether that lock actually stands in an editor's way -
    # which it does not when the lock is their own. There is no lockOwner on JCRNode in this schema;
    # the owner exists only inside details.
    lockedAndCannotBeEdited
    lockInfo {
        details(language: $language) {
            owner
            type
        }
    }
    # Whether this reader may write this record's properties, for the inline cell editor - see
    # ContentTypesCellEdit. Asked per record rather than assumed, because a table is exactly where
    # the assumption breaks: a listing crosses a whole site, and a reader can hold permission on part
    # of it. The permission is the per-language one Content Editor itself checks
    # jcr:modifyProperties_default_<lang>, so the two agree about who may edit what. Named with
    # no backticks on purpose: this whole block is a JS template literal.
    canEdit: hasPermission(permissionName: $writePermission)
    # Which of the two publish actions the selection bar offers, asked of the same three types
    # jContent asks about. Reading them here rather than resolving the selected paths separately is
    # what keeps the bar from costing a request of its own every time a row is ticked.
    isPage: isNodeType(type: {multi: ANY, types: ["jnt:page"]})
    isFolder: isNodeType(type: {multi: ANY, types: ["jnt:contentFolder", "jnt:folder"]})
`;

/**
 * Fetched on a referenced node, so that a reference to an image can show the image.
 *
 * `thumbnailUrl` is asked with `checkIfExists`, which makes it answer null rather than a URL that
 * would 404 when the node has no rendition - and that null is also the whole is-it-an-image test.
 * A reference to ordinary content simply has no thumbnail and needs no type check to say so, which
 * is how jContent's own media list decides it too.
 *
 * The URL that comes back is used only as a yes/no, never as an address: it carries no cache buster,
 * so a browser that has already fetched a rendition keeps showing it after the image behind it is
 * re-cropped or replaced. `path` and `lastModified` are what the address is rebuilt from instead -
 * see `thumbnailFor` in ContentTypesTable, and jContent's media grid, which stamps the same date on
 * for the same reason.
 *
 * `mimeType` is here for WebP alone: the image service generates no rendition for it at all, so the
 * original file is the only preview it has.
 */
const REFERENCED_NODE_FIELDS = `
    uuid
    path
    displayName(language: $language)
    hasThumbnail: thumbnailUrl(name: "thumbnail", checkIfExists: true)
    # Where a reference points at a link, so the cell can point there too. j:url is the property both
    # of Jahia's external link definitions carry - jnt:externalLink and the jmix:externalLink mixin -
    # and it is a plain string on each: JCR has a URI type, but nothing that ships uses it. A node
    # that is not a link has no such property and answers null, which is the whole test.
    linkUrl: property(name: "j:url", language: $language) {
        value
    }
    lastModified: property(name: "jcr:lastModified", language: $language) {
        value
    }
    content: descendant(relPath: "jcr:content") {
        mimeType: property(name: "jcr:mimeType") {
            value
        }
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
        (field.multiple ? `refNodes { ${REFERENCED_NODE_FIELDS} }` : `refNode { ${REFERENCED_NODE_FIELDS} }`) :
        '';

    return `${field.key}: property(name: "${field.propertyName}", language: $language) { ${valuePart} ${refPart} }`;
};

/**
 * One selection per active language, for the "missing translations" column.
 *
 * An internationalized property is not on the record: it lives on a hidden `j:translation_<lang>`
 * subnode, so the only way to know what French holds while looking at English is to read those
 * subnodes. `descendants(typesFilter:)` cannot see them; `descendant(relPath:)` can.
 *
 * Folded into this query rather than fetched separately, which is what makes the column free: the
 * table already runs one request per page, and these ride along in it. Measured against a site,
 * 299 records with two languages came back in 0.58s in a single request - a page of 25 is nothing.
 * The cost is linear in the number of languages, so a ten-language site asks for ten subnodes a row.
 *
 * `properties` is fetched whole rather than property by property: which ones matter depends on the
 * type's definition, that list is already in hand on the client, and naming each one here would mean
 * rebuilding this query whenever the column choice changes.
 *
 * Nothing is asked for when the site has fewer than two languages - there is no translation to be
 * missing - and the column is not offered either.
 */
const translationFields = languages => ((languages || []).length < 2 ? '' : languages.map(language => `
    ${translationAlias(language)}: descendant(relPath: "${translationRelPath(language)}") {
        properties {
            name
            value
        }
    }
`).join(''));

const recordFields = (dynamicFields, languages) => COMMON_RECORD_FIELDS +
    translationFields(languages) +
    dynamicFields.map(dynamicFieldSelection).join('');

/**
 * Every record of one content type in a site, narrowed by whatever is being asked of it.
 *
 * One query rather than two. Searching and filtering are both just constraints on the same criteria
 * query, so the shape they arrive in - `$nodeConstraint`, built in the browser and null when nothing
 * is being asked - is the only thing that differs between "everything of this type" and any narrowing
 * of it. That also means a filter and a search compose without either knowing about the other.
 *
 * Sorting and paging both happen on the server. Sorting one page in the browser would order only the
 * rows already fetched while presenting it as the whole set, so the sort has to travel with the
 * query; `totalCount` is what lets the table page without fetching everything.
 *
 * A type filter in JCR matches sub types too, so selecting a type also lists its sub types.
 *
 * Built on `nodesByCriteria` rather than on the site node's `descendants` because only the criteria
 * query carries an `ordering` - a sort the repository performs against the property itself, which is
 * the one that puts numbers in numeric order. `descendants` offers `fieldSorter` alone, which compares
 * the text a field returned. The two return the same rows: checked against a site, 161 records of one
 * type either way.
 */
export const buildRecordQuery = (dynamicFields, languages) => parse(`
    query getContentByType(
        $sitePath: String!,
        $type: String!,
        $language: String!,
        $writePermission: String!,
        $offset: Int!,
        $limit: Int!,
        $fieldSorter: InputFieldSorterInput,
        $ordering: InputGqlOrdering,
        $nodeConstraint: InputGqlJcrNodeConstraintInput
    ) {
        jcr(workspace: EDIT) {
            nodesByCriteria(
                criteria: {
                    language: $language,
                    nodeType: $type,
                    paths: [$sitePath],
                    ordering: $ordering,
                    nodeConstraint: $nodeConstraint
                },
                offset: $offset,
                limit: $limit,
                fieldSorter: $fieldSorter
            ) {
                pageInfo {
                    totalCount
                }
                nodes {
                    ${recordFields(dynamicFields, languages)}
                }
            }
        }
    }
`);
