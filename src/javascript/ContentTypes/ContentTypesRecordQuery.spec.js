import {print} from 'graphql';
import {buildRecordQuery} from './ContentTypesRecordQuery';

/**
 * The record query is assembled from template literals and parsed at runtime, so a mistake in it is
 * not a build error - it is a blank table and a console message, in a browser, at the moment
 * somebody opens a content type. `parse` throwing here is the cheap version of that.
 *
 * Written after breaking it exactly that way: a backtick inside a GraphQL comment closed the
 * template literal it was in, which the linter caught as a syntax error four lines further down and
 * would not have caught at all had it happened to stay valid JavaScript.
 */
const text = (fields = [], languages = []) => print(buildRecordQuery(fields, languages));

/** A content type's own property, as useContentTypeColumns builds one. */
const own = overrides => ({
    key: 'ct_address',
    propertyName: 'address',
    requiredType: 'STRING',
    multiple: false,
    ...overrides
});

describe('buildRecordQuery', () => {
    it('builds a document that parses, with no columns chosen', () => {
        expect(() => buildRecordQuery([], [])).not.toThrow();
    });

    it('builds a document that parses for every kind of column at once', () => {
        expect(() => buildRecordQuery([
            own(),
            own({key: 'ct_tags', propertyName: 'tags', multiple: true}),
            own({key: 'ct_photo', propertyName: 'photo', requiredType: 'WEAKREFERENCE'}),
            own({key: 'ct_photos', propertyName: 'photos', requiredType: 'REFERENCE', multiple: true}),
            own({key: 'ct_price', propertyName: 'price', requiredType: 'DOUBLE'})
        ], ['en', 'fr'])).not.toThrow();
    });

    describe('the fields every record carries', () => {
        it('asks for the lock, which the Lock column shows', () => {
            expect(text()).toContain('lockedAndCannotBeEdited');
        });
    });

    describe('a content type\'s own columns', () => {
        it('selects each one, aliased to the column key the table reads it back by', () => {
            expect(text([own()])).toContain('ct_address: property(name: "address"');
        });

        it('asks for values rather than value where the property holds a list', () => {
            const multiple = text([own({multiple: true})]);
            expect(multiple).toContain('values');
            expect(multiple).not.toMatch(/ct_address: property\([^)]*\) \{\s*value\s/);
        });

        /*
         * Asking refNodes of a property that is not a reference makes the server log an internal
         * error on every single request, while the response still arrives intact - so nothing on
         * screen says anything is wrong. Locked down here because it is invisible in use.
         */
        it('asks for referenced nodes only where the property is a reference', () => {
            // Counted against a query with no columns rather than searched for outright: the
            // common fields resolve the category references, so every query mentions refNodes
            // whatever the columns are. What matters is whether THIS column added one.
            const occurrences = query => (query.match(/refNodes?/g) || []).length;
            const baseline = occurrences(text());

            expect(occurrences(text([own()]))).toBe(baseline);
            expect(occurrences(text([own({requiredType: 'WEAKREFERENCE'})]))).toBeGreaterThan(baseline);
            expect(occurrences(text([own({requiredType: 'REFERENCE', multiple: true})]))).toBeGreaterThan(baseline);
        });
    });

    describe('the translation subnodes', () => {
        it('asks for one per language when there are several', () => {
            const query = text([], ['en', 'fr']);
            expect(query).toContain('j:translation_en');
            expect(query).toContain('j:translation_fr');
        });

        // Nothing can be missing from a single language, and the column is not offered either.
        it('asks for none at all below two languages', () => {
            expect(text([], ['en'])).not.toContain('j:translation_');
            expect(text([], [])).not.toContain('j:translation_');
        });
    });
});
