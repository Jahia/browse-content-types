import {FILTER_BOOLEAN, FILTER_CHOICE, FILTER_DATE, FILTER_IMAGE, FILTER_NUMBER, FILTER_PUBLICATION, FILTER_TEXT} from './ContentTypesFieldTypes';
import {MULTI_VALUE_OPERATORS, OPERATORS, VALUELESS_OPERATORS, defaultOperator, describeFilter, filterFor, matchesPublication, operatorLabel, toConstraint, toNodeConstraint, valuesOf} from './ContentTypesFilters';

/**
 * The vocabulary, and what it builds.
 *
 * These are the assertions the constraints were checked with against a live site while they were
 * being written - the counts quoted in the comments below are that site's, and they are what says a
 * shape answers the question a reader is asking rather than merely being accepted by the server.
 *
 * The module under test is free of React and of the registry on purpose, so nothing here needs a
 * renderer, a store or a schema.
 */

/** A column, as the catalog hands one over. */
const field = (overrides = {}) => ({
    key: 'options',
    label: 'Options',
    jcrProperty: 'options',
    filterType: FILTER_TEXT,
    multiple: false,
    ...overrides
});

/** How i18next behaves, as far as this module uses it: the first key wins. */
const t = keys => (Array.isArray(keys) ? keys[0] : keys);

describe('the operators on offer', () => {
    it('gives every kind of column at least one operator', () => {
        const kinds = [
            FILTER_TEXT,
            FILTER_NUMBER,
            FILTER_DATE,
            FILTER_BOOLEAN,
            FILTER_CHOICE,
            FILTER_IMAGE,
            FILTER_PUBLICATION
        ];

        kinds.forEach(kind => {
            expect(OPERATORS[kind].length).toBeGreaterThan(0);
        });
    });

    it('can build a constraint for every operator it offers, publication apart', () => {
        // Publication is the one kind with no property to constrain: it is answered from the records
        // instead, by matchesPublication. Every other operator has to reach a builder, or the form
        // offers a condition the query cannot express.
        Object.entries(OPERATORS)
            .filter(([kind]) => kind !== FILTER_PUBLICATION)
            .forEach(([kind, operators]) => operators.forEach(operator => {
                const column = field({filterType: kind});
                const value = MULTI_VALUE_OPERATORS.has(operator) ? ['x'] : '1';

                expect(toConstraint(column, {o: operator, v: value})).not.toBeNull();
            }));
    });

    it('starts a text filter on contains rather than on the first one listed', () => {
        // Order is what reads best in the dropdown; the default is what a reader most often wants.
        expect(OPERATORS[FILTER_TEXT][0]).toBe('startsWith');
        expect(defaultOperator(FILTER_TEXT)).toBe('contains');
    });

    it('starts every other kind on the operator it lists first', () => {
        expect(defaultOperator(FILTER_NUMBER)).toBe('equals');
        expect(defaultOperator(FILTER_DATE)).toBe('after');
        expect(defaultOperator(FILTER_BOOLEAN)).toBe('isTrue');
        expect(defaultOperator(FILTER_CHOICE)).toBe('is');
        expect(defaultOperator(FILTER_IMAGE)).toBe('notEmpty');
    });

    it('has no default for a kind it does not know', () => {
        expect(defaultOperator('spreadsheet')).toBeUndefined();
    });
});

describe('a filter value as a list', () => {
    it('takes a list as it is', () => {
        expect(valuesOf(['garage', 'pool'])).toEqual(['garage', 'pool']);
    });

    it('takes a bare value too, which is what an older shared link carries', () => {
        expect(valuesOf('garage')).toEqual(['garage']);
    });

    it('drops what a half-used form leaves behind', () => {
        expect(valuesOf([' garage ', '', null, undefined])).toEqual(['garage']);
        expect(valuesOf(undefined)).toEqual([]);
        expect(valuesOf([])).toEqual([]);
    });
});

describe('turning one filter into a constraint', () => {
    it('says nothing at all when there is nothing to say', () => {
        // A half-filled form must not narrow the table to nothing, and a column with no property
        // behind it has nothing to constrain.
        expect(toConstraint(field(), {o: 'contains', v: '  '})).toBeNull();
        expect(toConstraint(field(), {o: 'shoutsAt', v: 'x'})).toBeNull();
        expect(toConstraint(field({jcrProperty: undefined}), {o: 'contains', v: 'x'})).toBeNull();
        expect(toConstraint(undefined, {o: 'contains', v: 'x'})).toBeNull();
        expect(toConstraint(field(), undefined)).toBeNull();
    });

    it('needs no value for an operator that is the whole condition', () => {
        expect(toConstraint(field(), {o: 'empty'})).toEqual({property: 'options', exists: false});
        expect(toConstraint(field(), {o: 'notEmpty'})).toEqual({property: 'options', exists: true});
        expect(toConstraint(field(), {o: 'isTrue'})).toEqual({property: 'options', equals: 'true'});
        expect(toConstraint(field(), {o: 'isFalse'})).toEqual({property: 'options', equals: 'false'});
    });

    it('keeps VALUELESS_OPERATORS and the builders agreeing on which those are', () => {
        VALUELESS_OPERATORS.forEach(operator => {
            expect(toConstraint(field(), {o: operator})).not.toBeNull();
        });
    });

    describe('text', () => {
        it('lowercases the pattern to pair with LOWER_CASE', () => {
            // LOWER_CASE lowercases the stored value server-side, so an upper-case letter in the
            // pattern would never match anything.
            expect(toConstraint(field(), {o: 'contains', v: 'Mansion'})).toEqual({
                property: 'options',
                like: '%mansion%',
                function: 'LOWER_CASE'
            });
        });

        it('anchors startsWith at the front only', () => {
            expect(toConstraint(field(), {o: 'startsWith', v: 'Villa'})).toEqual({
                property: 'options',
                like: 'villa%',
                function: 'LOWER_CASE'
            });
        });

        it('escapes the pattern language, so 50% means fifty per cent', () => {
            expect(toConstraint(field(), {o: 'contains', v: '50%_x'}).like).toBe('%50\\%\\_x%');
        });

        it('gives notContains a base set to subtract from', () => {
            // A bare `none: [like]` is unreliable: on a property whose values contain spaces it
            // returned every record rather than none of them. Paired with a positive constraint,
            // contains and notContains add back up to the total on every property tried.
            //
            // The exists arm also settles the wording: "does not contain" describes a value that is
            // there, so a record with no value at all is not returned.
            expect(toConstraint(field(), {o: 'notContains', v: 'Garage'})).toEqual({
                all: [
                    {property: 'options', exists: true},
                    {none: [{property: 'options', like: '%garage%', function: 'LOWER_CASE'}]}
                ]
            });
        });

        it('lets a space stand for any separator where the column shows a prettified node name', () => {
            // Such a column draws `highlight-numbers` as "Highlight Numbers", so a reader typing what
            // they can see would otherwise match nothing at all. Measured on the reference site, this
            // took "highlight numbers" from 0 matches to 2.
            const name = field({jcrProperty: 'j:nodename', looseSeparators: true});

            expect(toConstraint(name, {o: 'contains', v: 'Highlight Numbers'}).like)
                .toBe('%highlight%numbers%');
            expect(toConstraint(name, {o: 'startsWith', v: 'Highlight  Numbers'}).like)
                .toBe('highlight%numbers%');
        });

        it('leaves the spaces alone on a column that shows a property', () => {
            // A primary item's value is what the column draws, character for character.
            expect(toConstraint(field({jcrProperty: 'title'}), {o: 'contains', v: 'Grand Villa'}).like)
                .toBe('%grand villa%');
        });
    });

    describe('choosing from a value list', () => {
        const choice = field({filterType: FILTER_CHOICE, multiple: true});

        it('asks one plain question for one value', () => {
            // Measured: `options equals garage` returns 33 of 161 estates - every record holding that
            // value among its others, which is what "contains" should mean on a multi-valued column.
            expect(toConstraint(choice, {o: 'is', v: ['garage']}))
                .toEqual({property: 'options', equals: 'garage'});
        });

        it('composes several with any, meaning any of them', () => {
            expect(toConstraint(choice, {o: 'is', v: ['garage', 'pool']})).toEqual({
                any: [
                    {property: 'options', equals: 'garage'},
                    {property: 'options', equals: 'pool'}
                ]
            });
        });

        it('negates without notEquals, which is unusable on a multi-valued property', () => {
            // On `options`, notEquals answers 45, while "does not hold this value" is 128 and "holds
            // some other value" is 93. It is neither question. This shape is: no value at all, or a
            // value that is not one of these - and it agreed with the data on all four constrained
            // properties it was checked against, single and multi valued.
            expect(toConstraint(choice, {o: 'isNot', v: ['garage', 'pool']})).toEqual({
                any: [
                    {property: 'options', exists: false},
                    {
                        all: [
                            {property: 'options', exists: true},
                            {
                                none: [
                                    {property: 'options', equals: 'garage'},
                                    {property: 'options', equals: 'pool'}
                                ]
                            }
                        ]
                    }
                ]
            });
        });

        it('says nothing when nothing is ticked', () => {
            expect(toConstraint(choice, {o: 'is', v: []})).toBeNull();
            expect(toConstraint(choice, {o: 'isNot', v: ['   ']})).toBeNull();
        });
    });

    describe('numbers and dates', () => {
        const number = field({key: 'price', jcrProperty: 'price', filterType: FILTER_NUMBER});
        const date = field({key: 'signed', jcrProperty: 'signedOn', filterType: FILTER_DATE});

        it('compares a number as a number', () => {
            expect(toConstraint(number, {o: 'gt', v: '250000'})).toEqual({property: 'price', gt: '250000'});
            expect(toConstraint(number, {o: 'lt', v: '250000'})).toEqual({property: 'price', lt: '250000'});
            expect(toConstraint(number, {o: 'notEquals', v: '0'})).toEqual({property: 'price', notEquals: '0'});
        });

        it('includes the day named, at both ends', () => {
            // A date input gives a day while the repository stores a moment, so the comparison is
            // against the ends of that day.
            expect(toConstraint(date, {o: 'after', v: '2026-01-31'}))
                .toEqual({property: 'signedOn', gt: '2026-01-31T00:00:00.000Z'});
            expect(toConstraint(date, {o: 'before', v: '2026-01-31'}))
                .toEqual({property: 'signedOn', lt: '2026-01-31T23:59:59.999Z'});
        });

        it('sends lastDays a number, and refuses anything that is not one', () => {
            expect(toConstraint(date, {o: 'lastDays', v: '7'})).toEqual({property: 'signedOn', lastDays: 7});
            expect(toConstraint(date, {o: 'lastDays', v: 'a week'})).toBeNull();
        });
    });
});

describe('every filter as one constraint', () => {
    const catalog = new Map([
        ['title', field({key: 'title', jcrProperty: 'title'})],
        ['options', field({key: 'options', filterType: FILTER_CHOICE, multiple: true})]
    ]);

    it('says nothing when no filter says anything', () => {
        expect(toNodeConstraint([], catalog, null)).toBeNull();
        expect(toNodeConstraint(undefined, catalog, null)).toBeNull();
        expect(toNodeConstraint([{c: 'title', o: 'contains', v: ''}], catalog, null)).toBeNull();
    });

    it('leaves a lone constraint as itself rather than wrapping it', () => {
        expect(toNodeConstraint([{c: 'title', o: 'contains', v: 'villa'}], catalog, null))
            .toEqual({property: 'title', like: '%villa%', function: 'LOWER_CASE'});
    });

    it('composes with all, so filters narrow rather than widen', () => {
        const composed = toNodeConstraint([
            {c: 'title', o: 'contains', v: 'villa'},
            {c: 'options', o: 'is', v: ['garage']}
        ], catalog, null);

        expect(composed.all).toHaveLength(2);
    });

    it('makes a search one more arm of the same all, and puts it first', () => {
        const search = {any: [{contains: 'villa'}]};
        const composed = toNodeConstraint([{c: 'options', o: 'is', v: ['garage']}], catalog, search);

        expect(composed.all[0]).toBe(search);
        expect(composed.all[1]).toEqual({property: 'options', equals: 'garage'});
    });

    it('keeps a search on its own when it is the only thing asked', () => {
        const search = {any: [{contains: 'villa'}]};

        expect(toNodeConstraint([], catalog, search)).toBe(search);
    });

    it('drops a filter on a column the catalog no longer has', () => {
        // A shared link can name a property a later version of the type removed.
        expect(toNodeConstraint([{c: 'gone', o: 'contains', v: 'x'}], catalog, null)).toBeNull();
    });
});

describe('publication, which is answered here rather than by the repository', () => {
    // The status is computed per node and per language, from j:published and a comparison of
    // jcr:lastModified against j:lastPublished - and a query can compare a property to a literal but
    // never to another property, which the engine rejects outright.

    it('keeps the record when nothing is ticked', () => {
        expect(matchesPublication({o: 'is', v: []}, 'PUBLISHED')).toBe(true);
        expect(matchesPublication(undefined, 'PUBLISHED')).toBe(true);
    });

    it('matches any of the statuses ticked', () => {
        const filter = {o: 'is', v: ['PUBLISHED', 'MODIFIED']};

        expect(matchesPublication(filter, 'PUBLISHED')).toBe(true);
        expect(matchesPublication(filter, 'MODIFIED')).toBe(true);
        expect(matchesPublication(filter, 'NOT_PUBLISHED')).toBe(false);
    });

    it('inverts exactly, for is not', () => {
        const filter = {o: 'isNot', v: ['PUBLISHED']};

        expect(matchesPublication(filter, 'PUBLISHED')).toBe(false);
        expect(matchesPublication(filter, 'UNPUBLISHED')).toBe(true);
    });

    it('treats a record whose status did not arrive as not being the one asked for', () => {
        expect(matchesPublication({o: 'is', v: ['PUBLISHED']}, undefined)).toBe(false);
        expect(matchesPublication({o: 'isNot', v: ['PUBLISHED']}, undefined)).toBe(true);
    });

    it('does not match a status it cannot offer, which still shows its own chip', () => {
        expect(matchesPublication({o: 'is', v: ['PUBLISHED']}, 'CONFLICT')).toBe(false);
    });
});

describe('the words a reader sees', () => {
    it('asks for the multi-valued wording first, then the kind, then a name for any kind', () => {
        const asked = [];
        const record = keys => {
            asked.push(...keys);
            return keys[0];
        };

        operatorLabel(record, field({filterType: FILTER_CHOICE, multiple: true}), 'is');

        expect(asked).toEqual([
            'label.filter.operator.choiceMultiple.is',
            'label.filter.operator.choice.is',
            'label.filter.operator.is'
        ]);
    });

    it('leaves the multiplicity step out on a column holding one value', () => {
        // "is" is exactly right on a single-valued column, and "contains" would be the wrong word.
        expect(operatorLabel(t, field({filterType: FILTER_CHOICE}), 'is'))
            .toBe('label.filter.operator.choice.is');
    });
});

describe('a filter in words, for the summary above the table', () => {
    it('names the column and the condition, and stops there when there is no value', () => {
        expect(describeFilter({c: 'cover', o: 'empty'}, field({key: 'cover', label: 'Cover'}), t))
            .toBe('Cover · label.filter.operator.text.empty');
    });

    it('joins several values with or, not with a comma', () => {
        // A comma leaves the reader to guess whether all of them are wanted or any of them.
        const column = field({filterType: FILTER_CHOICE, multiple: true, valueLabels: {garage: 'Garage', pool: 'Piscine'}});
        const summary = describeFilter({c: 'options', o: 'is', v: ['garage', 'pool']}, column, key => {
            return key === 'label.filter.valueSeparator' ? ' or ' : t(key);
        });

        expect(summary).toBe('Options · label.filter.operator.choiceMultiple.is Garage or Piscine');
    });

    it('falls back to the column key when the column is gone', () => {
        expect(describeFilter({c: 'options', o: 'contains', v: 'x'}, undefined, t))
            .toBe('options · label.filter.operator.contains x');
    });
});

describe('finding the filter set on a column', () => {
    const filters = [{c: 'title', o: 'contains', v: 'villa'}, {c: 'options', o: 'is', v: ['garage']}];

    it('finds it by column key', () => {
        expect(filterFor(filters, 'options')).toBe(filters[1]);
    });

    it('finds nothing on a column nobody filtered', () => {
        expect(filterFor(filters, 'price')).toBeUndefined();
    });
});
