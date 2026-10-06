import {MIN_SEARCH_LENGTH, isSearchTooShort, sanitiseTokens} from './ContentTypesSearch';

/**
 * What a typed term becomes, and when there is enough of it to be worth asking.
 *
 * No renderer, store or schema: the module is a pair of pure functions over what the reader typed.
 */

describe('sanitiseTokens', () => {
    it('keeps the words', () => {
        expect(sanitiseTokens('villa provence')).toEqual(['villa', 'provence']);
    });

    // Left in, these change the query; a stray quote makes it invalid outright and the server
    // answers with a RepositoryException rather than an empty result.
    it('strips the characters the full text parser reads as syntax', () => {
        expect(sanitiseTokens('"villa" (provence)')).toEqual(['villa', 'provence']);
        expect(sanitiseTokens('50%')).toEqual(['50']);
    });

    it('drops the words the parser reads as operators', () => {
        expect(sanitiseTokens('villa and provence')).toEqual(['villa', 'provence']);
        expect(sanitiseTokens('NOT villa')).toEqual(['villa']);
    });

    it('drops a leading minus, which negates a term', () => {
        expect(sanitiseTokens('-villa')).toEqual(['villa']);
    });

    it('survives nothing at all', () => {
        expect(sanitiseTokens('')).toEqual([]);
        expect(sanitiseTokens(null)).toEqual([]);
    });
});

describe('isSearchTooShort', () => {
    // An empty box is not waiting on the reader, so there is nothing to say under it.
    it('says nothing about an empty box', () => {
        expect(isSearchTooShort('')).toBe(false);
        expect(isSearchTooShort('   ')).toBe(false);
        expect(isSearchTooShort(null)).toBe(false);
    });

    it('is true while the term is shorter than the minimum', () => {
        expect(isSearchTooShort('vil')).toBe(true);
        expect(isSearchTooShort('a')).toBe(true);
    });

    it('is false once the term is long enough', () => {
        expect(isSearchTooShort('vill')).toBe(false);
        expect(isSearchTooShort('villa provence')).toBe(false);
    });

    // Measured on what will actually be searched for, not on what was typed: punctuation
    // sanitises away to nothing and is not going to be searched for either.
    it('measures the sanitised term, not the typed one', () => {
        expect(isSearchTooShort('"""""""')).toBe(true);
        expect(isSearchTooShort('and or not')).toBe(true);
    });

    it('agrees with the minimum it is documented against', () => {
        expect(MIN_SEARCH_LENGTH).toBe(4);
        expect(isSearchTooShort('x'.repeat(MIN_SEARCH_LENGTH - 1))).toBe(true);
        expect(isSearchTooShort('x'.repeat(MIN_SEARCH_LENGTH))).toBe(false);
    });
});
