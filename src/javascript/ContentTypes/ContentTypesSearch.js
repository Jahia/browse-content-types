/**
 * What a reader typed, on its way to being searched for.
 *
 * The search box above the table is its own way of narrowing, independent of anything a column
 * offers: it matches across the record rather than against one named property. Kept in its own
 * module for that reason - two places need the same answer about a typed term, the table to build
 * the query and the toolbar to say whether there is enough of it to search on yet.
 */

/**
 * Characters the full text parser reads as syntax. Left in a term they change the query, and a
 * stray quote makes it invalid outright: the server answers with a RepositoryException rather
 * than an empty result.
 *
 * `_` is in the set for a different reason from the rest. The full text parser makes nothing of it,
 * but the same words are also used as the pattern of a `LIKE`, where it is the wildcard matching
 * any single character - so a search for `a_c` quietly also finds `abc`, which reads as the search
 * being wrong rather than as a pattern doing its job.
 */
const FULLTEXT_OPERATORS = /["'()[\]^~?:\\*%_]/g;

/** Words the parser reads as operators rather than as something to look for. */
const BOOLEAN_WORDS = new Set(['and', 'or', 'not']);

/**
 * A typed term as the words that will actually be searched for.
 *
 * Here rather than in the table because two places need the same answer: the table, to build the
 * query, and the toolbar, to say whether what has been typed is long enough to search at all.
 */
export const sanitiseTokens = term => String(term || '')
    .split(/\s+/)
    .map(token => token.replace(FULLTEXT_OPERATORS, '').replace(/^-+/, ''))
    .filter(token => token.length > 0 && !BOOLEAN_WORDS.has(token.toLowerCase()));

/**
 * How many characters a term must have before anything is searched for.
 *
 * Short terms are held back so they cost no query - a two-letter prefix on a real site matches most
 * of it. The cost is that typing one looks like nothing happening, which is why the toolbar says so
 * rather than leaving the table unchanged and unexplained.
 */
export const MIN_SEARCH_LENGTH = 4;

/**
 * Whether something has been typed but not yet enough of it.
 *
 * Distinct from "nothing typed": an empty box is not waiting on the reader, and saying anything
 * under it would be noise. Punctuation alone sanitises away to nothing and counts as typed-but-not-
 * enough, which is honest - it is not going to be searched for either.
 */
export const isSearchTooShort = term => {
    const typed = String(term || '').trim();
    if (typed.length === 0) {
        return false;
    }

    return sanitiseTokens(typed).join(' ').length < MIN_SEARCH_LENGTH;
};
