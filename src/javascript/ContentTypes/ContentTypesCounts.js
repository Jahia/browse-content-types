import {parse} from 'graphql';

/**
 * How many records of each content type the site actually holds.
 *
 * Free of React and of Apollo, like the other logic modules here: what is worth getting right is the
 * query each type needs and how the answers are read back, and both are pure functions of a list of
 * type names. The hook that runs it is useTypeCounts.
 *
 * **Why this exists.** The settings panel offers every content type the site *could* hold, which on
 * a real site is far more than it does hold - measured against one, 36 of the 57 on offer had no
 * records at all. An administrator choosing which types the accordion lists had no way to tell the
 * 21 that matter from the 36 that would only clutter it.
 */

/**
 * The query that counts one type.
 *
 * **Exactly this type, not this type and its subtypes.** `select * from [T]` matches every subtype
 * of T as well, which for a base type means it matches most of the site: asked that way,
 * `jnt:content` answered 299 on a site holding 299 records of a hundred different types. A count
 * that says "299" against a type nobody has ever used is worse than no count. Adding
 * `[jcr:primaryType] = 'T'` makes it the number of records that ARE this type, which is the number
 * the reader is deciding on. Verified against a site: `luxe:blogPost` answers 4 and the four blog
 * posts are the four that exist, while `jnt:content` correctly answers 0.
 *
 * Scoped to the site by `isdescendantnode`, since the choice being made is per site.
 *
 * Built as a string and passed as a **variable** rather than interpolated into the document, so a
 * type name is data rather than query text.
 */
export const typeCountQuery = (typeName, sitePath) =>
    `select * from [${typeName}] where isdescendantnode("${sitePath}") ` +
    `and [jcr:primaryType] = "${typeName}"`;

/**
 * The alias one type's count is returned under.
 *
 * Positional rather than the type name itself: a GraphQL alias may hold letters, digits and
 * underscores, and a type name is `prefix:local` - the colon is not legal and the prefix would
 * collide once stripped (`jnt:text` and `luxe:text` both becoming `text`).
 */
export const countAlias = index => `t${index}`;

/**
 * One document that counts every type, rather than one request per type.
 *
 * 57 aliased `nodesByQuery` selections came back in **250ms** against a real site - a request per
 * type would have been 57 round trips for the same answer. `limit: 1` because nothing here reads a
 * node: the whole answer is `pageInfo.totalCount`, and fetching a page of results to count them
 * would be work the server does and this throws away.
 *
 * An empty list yields no document at all - `null` - because a GraphQL document with no selections
 * is a parse error, and "no types" is a legitimate state while the type list is still loading.
 */
export const buildTypeCountDocument = typeNames => {
    const names = typeNames || [];
    if (names.length === 0) {
        return null;
    }

    const declarations = names.map((name, index) => `$${countAlias(index)}: String!`);
    const selections = names.map((name, index) =>
        `${countAlias(index)}: nodesByQuery(query: $${countAlias(index)}, limit: 1) { pageInfo { totalCount } }`
    );

    return parse(`
        query getTypeCounts(${declarations.join(', ')}) {
            jcr {
                ${selections.join('\n                ')}
            }
        }
    `);
};

/** The variables that go with it, named to match. */
export const buildTypeCountVariables = (typeNames, sitePath) => {
    const variables = {};
    (typeNames || []).forEach((name, index) => {
        variables[countAlias(index)] = typeCountQuery(name, sitePath);
    });

    return variables;
};

/**
 * The answers, back against the names that asked for them.
 *
 * A Map rather than an object, so a type name containing a colon is a plain key and nothing has to
 * be escaped or parsed back out of it.
 *
 * A type whose alias is missing or null is left out of the map entirely rather than recorded as 0.
 * The two mean different things to a reader - "no records" against "not counted" - and the panel
 * shows nothing at all for the second rather than claiming a type is unused when the count simply
 * has not arrived.
 */
export const readTypeCounts = (data, typeNames) => {
    const counts = new Map();
    const jcr = data?.jcr;
    if (!jcr) {
        return counts;
    }

    (typeNames || []).forEach((name, index) => {
        const total = jcr[countAlias(index)]?.pageInfo?.totalCount;
        if (typeof total === 'number') {
            counts.set(name, total);
        }
    });

    return counts;
};
