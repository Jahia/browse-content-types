import {print} from 'graphql';
import {
    buildTypeCountDocument,
    buildTypeCountVariables,
    countAlias,
    readTypeCounts,
    typeCountQuery
} from './ContentTypesCounts';

const TYPES = ['luxe:blogPost', 'jnt:text', 'luxe:estate'];

describe('ContentTypesCounts', () => {
    describe('typeCountQuery', () => {
        // The whole reason the constraint is there: without it, a base type matches every subtype
        // and answers with most of the site.
        it('counts the type itself, not the type and its subtypes', () => {
            expect(typeCountQuery('luxe:blogPost', '/sites/luxe'))
                .toContain('[jcr:primaryType] = "luxe:blogPost"');
        });

        it('scopes the count to the site the choice is being made for', () => {
            expect(typeCountQuery('luxe:blogPost', '/sites/luxe'))
                .toContain('isdescendantnode("/sites/luxe")');
        });

        it('selects from the type', () => {
            expect(typeCountQuery('jnt:text', '/sites/luxe')).toContain('from [jnt:text]');
        });

        /*
         * The statement travels as a GraphQL variable, which keeps it out of the GraphQL document -
         * but it is still assembled by concatenation, and at the JCR-SQL2 layer both values are
         * query text. Neither layer protects the other.
         */
        it('refuses a type name that is not one, rather than building a statement around it', () => {
            expect(typeCountQuery('jnt:text] union select * from [rep:root', '/sites/luxe')).toBeNull();
            expect(typeCountQuery('", "', '/sites/luxe')).toBeNull();
            expect(typeCountQuery('', '/sites/luxe')).toBeNull();
        });

        it('closes nothing early when the site path carries a quote', () => {
            const query = typeCountQuery('jnt:text', '/sites/lu"xe');
            // Doubled, which is how the grammar escapes a quote inside a literal.
            expect(query).toContain('isdescendantnode("/sites/lu""xe")');
        });

        // Every name this asks about comes from the repository's own type registry.
        it('accepts the type names a real site answers with', () => {
            expect(typeCountQuery('luxe:blogPost', '/sites/luxe')).not.toBeNull();
            expect(typeCountQuery('jnt:content', '/sites/luxe')).not.toBeNull();
            expect(typeCountQuery('nt:base', '/sites/luxe')).not.toBeNull();
        });
    });

    describe('countAlias', () => {
        // A GraphQL alias cannot hold a colon, and stripping the prefix would make jnt:text and
        // luxe:text collide.
        it('is positional rather than the type name', () => {
            expect(countAlias(0)).toBe('t0');
            expect(countAlias(12)).toBe('t12');
        });
    });

    describe('buildTypeCountDocument', () => {
        it('asks for every type in one document', () => {
            const text = print(buildTypeCountDocument(TYPES));
            expect(text).toContain('t0: nodesByQuery');
            expect(text).toContain('t1: nodesByQuery');
            expect(text).toContain('t2: nodesByQuery');
            expect(text).not.toContain('t3:');
        });

        // Nothing here reads a node, so fetching a page of them to count would be work the server
        // does and this throws away.
        it('fetches no nodes, only the total', () => {
            const text = print(buildTypeCountDocument(TYPES));
            expect(text).toContain('limit: 1');
            expect(text).toContain('totalCount');
            expect(text).not.toContain('nodes {');
        });

        it('declares one variable per type', () => {
            const text = print(buildTypeCountDocument(TYPES));
            expect(text).toContain('$t0: String!');
            expect(text).toContain('$t2: String!');
            expect(text).not.toContain('$t3');
        });

        // A document with no selections is a parse error, and "no types" is a real state while the
        // type list is still loading.
        it('is nothing at all when there is nothing to count', () => {
            expect(buildTypeCountDocument([])).toBeNull();
            expect(buildTypeCountDocument(null)).toBeNull();
        });

        it('is a parseable document', () => {
            expect(() => print(buildTypeCountDocument(TYPES))).not.toThrow();
        });
    });

    describe('buildTypeCountVariables', () => {
        it('names the variables to match the document', () => {
            const variables = buildTypeCountVariables(TYPES, '/sites/luxe');
            expect(Object.keys(variables)).toEqual(['t0', 't1', 't2']);
            expect(variables.t0).toContain('luxe:blogPost');
            expect(variables.t2).toContain('luxe:estate');
        });

        it('has nothing to send for no types', () => {
            expect(buildTypeCountVariables([], '/sites/luxe')).toEqual({});
        });
    });

    describe('readTypeCounts', () => {
        const data = {
            jcr: {
                t0: {pageInfo: {totalCount: 4}},
                t1: {pageInfo: {totalCount: 0}},
                t2: {pageInfo: {totalCount: 161}}
            }
        };

        it('puts each answer back against the name that asked for it', () => {
            const counts = readTypeCounts(data, TYPES);
            expect(counts.get('luxe:blogPost')).toBe(4);
            expect(counts.get('luxe:estate')).toBe(161);
        });

        // Zero is an answer, and the panel says "not used" for it.
        it('keeps a zero, which is a real answer', () => {
            expect(readTypeCounts(data, TYPES).get('jnt:text')).toBe(0);
        });

        // "Not counted" and "no records" are different things to a reader, so an unanswered type is
        // absent rather than zero - the panel then says nothing rather than calling it unused.
        it('leaves out a type that was not answered', () => {
            const partial = {jcr: {t0: {pageInfo: {totalCount: 4}}, t1: null}};
            const counts = readTypeCounts(partial, TYPES);
            expect(counts.has('jnt:text')).toBe(false);
            expect(counts.has('luxe:estate')).toBe(false);
            expect(counts.get('luxe:blogPost')).toBe(4);
        });

        it('survives no data at all', () => {
            expect(readTypeCounts(undefined, TYPES).size).toBe(0);
            expect(readTypeCounts({}, TYPES).size).toBe(0);
            expect(readTypeCounts({jcr: {}}, TYPES).size).toBe(0);
        });
    });
});
