import {print} from 'graphql';
import {
    BULK_FIELDS,
    BULK_MODES,
    addRecords,
    buildAddDocument,
    buildAddVariables,
    bulkFieldVariables,
    canApply,
    captureHeldValues,
    heldValues,
    pickerField,
    recordsWithValues,
    unionValues
} from './ContentTypesBulkFields';

const {tag, categorize} = BULK_FIELDS;

/** A row as ContentTypesRecordQuery returns one, holding only what these cases read. */
const node = (path, overrides = {}) => ({path, ...overrides});

describe('ContentTypesBulkFields', () => {
    describe('the field table', () => {
        // The mixin has to travel with the write: a node that never carried a tag has neither the
        // mixin nor the property, and setting a property its type does not declare is an error.
        it('knows which mixin carries each property', () => {
            expect(tag).toMatchObject({mixin: 'jmix:tagged', property: 'j:tagList'});
            expect(categorize).toMatchObject({mixin: 'jmix:categorized', property: 'j:defaultCategory'});
        });

        // A tag is the string itself; a category is a uuid the server resolves to a node. Sent
        // untyped, the uuids would be stored as the text they arrived as.
        it('knows what kind of value each holds', () => {
            expect(tag.valueType).toBe('STRING');
            expect(categorize.valueType).toBe('WEAKREFERENCE');
        });

        it('names the Content Editor selector type each is collected with', () => {
            expect(tag.selectorType).toBe('Tag');
            expect(categorize.selectorType).toBe('Category');
        });
    });

    describe('readCurrent', () => {
        it('reads a row\'s tags off what the table already fetched', () => {
            expect(tag.readCurrent(node('/a', {tags: {values: ['sea', 'view']}}))).toEqual(['sea', 'view']);
        });

        it('reads a row\'s categories the same way', () => {
            const row = node('/a', {categories: {refNodes: [{displayName: 'Luxury'}]}});
            expect(categorize.readCurrent(row)).toHaveLength(1);
        });

        // A node without the mixin has no property at all, which arrives as null rather than empty.
        it('treats a row that has never carried the property as holding nothing', () => {
            expect(tag.readCurrent(node('/a'))).toEqual([]);
            expect(categorize.readCurrent(node('/a'))).toEqual([]);
            expect(tag.readCurrent(undefined)).toEqual([]);
        });
    });

    describe('recordsWithValues', () => {
        // The number the confirmation is built on: replacing is the chosen behaviour, and this is
        // what says how much of it lands on records nobody looked at.
        it('counts only the rows that stand to lose something', () => {
            const nodes = [
                node('/a', {tags: {values: ['sea']}}),
                node('/b', {tags: {values: []}}),
                node('/c'),
                node('/d', {tags: {values: ['view']}})
            ];
            expect(recordsWithValues(nodes, tag)).toBe(2);
        });

        it('counts nothing when the selection is all untagged', () => {
            expect(recordsWithValues([node('/a'), node('/b')], tag)).toBe(0);
        });

        it('copes with no selection at all', () => {
            expect(recordsWithValues(undefined, tag)).toBe(0);
        });
    });

    describe('pickerField', () => {
        // Tag renders an "invalid selector type" message instead of a control without this, and a
        // category field is a list by nature.
        it('declares the field multiple, which Tag refuses to render without', () => {
            expect(pickerField(tag, 'Tags').multiple).toBe(true);
            expect(pickerField(categorize, 'Categories').multiple).toBe(true);
        });

        it('names the field for the picker to show', () => {
            expect(pickerField(tag, 'Tags').displayName).toBe('Tags');
        });

        // Category pushes rootPath and types into whatever selectorOptions array it is handed, on
        // every render. Two calls must not share the array, or it grows without bound.
        it('builds a fresh selectorOptions array each time, since Category pushes into it', () => {
            const first = pickerField(categorize, 'Categories');
            const second = pickerField(categorize, 'Categories');

            expect(first.selectorOptions).toEqual([]);
            expect(first.selectorOptions).not.toBe(second.selectorOptions);

            first.selectorOptions.push({name: 'rootPath', value: '/x'});
            expect(second.selectorOptions).toEqual([]);
        });
    });

    describe('bulkFieldVariables', () => {
        const nodes = [node('/sites/luxe/contents/a'), node('/sites/luxe/contents/b')];

        it('sends every selected path, so the whole selection is one call', () => {
            expect(bulkFieldVariables({field: tag, nodes, values: ['sea']}).paths)
                .toEqual(['/sites/luxe/contents/a', '/sites/luxe/contents/b']);
        });

        it('carries the mixin, since a node that never held the property lacks it', () => {
            expect(bulkFieldVariables({field: tag, nodes, values: []}).mixins).toEqual(['jmix:tagged']);
        });

        it('types the values so the server resolves a category uuid to its node', () => {
            const variables = bulkFieldVariables({field: categorize, nodes, values: ['uuid-1']});
            expect(variables.type).toBe('WEAKREFERENCE');
            expect(variables.property).toBe('j:defaultCategory');
        });

        // An empty list is a legitimate thing to apply - it is how a set of records is cleared.
        it('sends an empty list rather than nothing, which is how a selection is cleared', () => {
            expect(bulkFieldVariables({field: tag, nodes, values: []}).values).toEqual([]);
            expect(bulkFieldVariables({field: tag, nodes, values: undefined}).values).toEqual([]);
        });
    });

    describe('BULK_MODES', () => {
        it('names the two ways values can meet what a record holds', () => {
            expect(BULK_MODES).toEqual({REPLACE: 'replace', ADD: 'add'});
        });
    });

    describe('unionValues', () => {
        it('keeps what is there and appends what is new', () => {
            expect(unionValues(['a'], ['b'])).toEqual(['a', 'b']);
        });

        // The silent no-op the whole mode rests on: picking something a record already carries is
        // not an error and does not store it twice.
        it('stores a value the record already has only once', () => {
            expect(unionValues(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
        });

        it('does not reshuffle what was already there', () => {
            expect(unionValues(['z', 'a'], ['m'])).toEqual(['z', 'a', 'm']);
        });

        it('handles a record that held nothing', () => {
            expect(unionValues(null, ['a'])).toEqual(['a']);
            expect(unionValues([], ['a'])).toEqual(['a']);
        });

        it('handles nothing being added', () => {
            expect(unionValues(['a'], [])).toEqual(['a']);
            expect(unionValues(['a'], null)).toEqual(['a']);
        });
    });

    describe('addRecords', () => {
        // The live shape: two records carrying one category, two carrying none.
        const entries = [
            {path: '/mykonos', values: ['featured']},
            {path: '/geneva', values: ['featured']},
            {path: '/paris', values: null},
            {path: '/new-york', values: null}
        ];

        it('gives every record its own final list', () => {
            expect(addRecords({entries, values: ['provence']})).toEqual([
                {path: '/mykonos', values: ['featured', 'provence']},
                {path: '/geneva', values: ['featured', 'provence']},
                {path: '/paris', values: ['provence']},
                {path: '/new-york', values: ['provence']}
            ]);
        });

        // Writing an identical list would change nothing visible but would still bump
        // jcr:lastModified and flag the record Modified for publication.
        it('leaves out a record that already holds everything picked', () => {
            expect(addRecords({entries, values: ['featured']}).map(r => r.path))
                .toEqual(['/paris', '/new-york']);
        });

        it('writes nothing at all when the whole selection already has it', () => {
            const held = [{path: '/a', values: ['featured']}, {path: '/b', values: ['featured']}];
            expect(addRecords({entries: held, values: ['featured']})).toEqual([]);
        });

        it('survives having nothing captured', () => {
            expect(addRecords({entries: [], values: ['a']})).toEqual([]);
            expect(addRecords({entries: null, values: ['a']})).toEqual([]);
        });
    });

    describe('buildAddDocument', () => {
        const records = [
            {path: '/mykonos', values: ['featured', 'provence']},
            {path: '/paris', values: ['provence']}
        ];

        // One mutateNode per record, because each ends up with a different list - a single
        // mutateNodes applies one list to all of them.
        it('builds one aliased mutateNode per record', () => {
            const text = print(buildAddDocument({records}));
            expect(text).toContain('n0: mutateNode(pathOrId: $p0)');
            expect(text).toContain('n1: mutateNode(pathOrId: $p1)');
            expect(text).not.toContain('mutateNodes');
        });

        // A record that never carried the mixin has no such property, and the mixin is what
        // defines it.
        it('adds the mixin on every record', () => {
            expect(print(buildAddDocument({records})).match(/addMixins/g)).toHaveLength(2);
        });

        // An addValues call fails with PathNotFoundException on a record whose property does not
        // exist yet - exactly the "no categories" case this mode serves.
        it('sets the whole intended list rather than adding to it', () => {
            const text = print(buildAddDocument({records}));
            expect(text).toContain('setValues');
            expect(text).not.toContain('addValues');
        });

        it('declares every variable it reads, and no others', () => {
            const text = print(buildAddDocument({records}));
            expect(text).toContain('$p0: String!');
            expect(text).toContain('$v0: [String]!');
            expect(text).toContain('$p1: String!');
            expect(text).toContain('$v1: [String]!');
            expect(text).not.toContain('$p2');
        });

        it('is a parseable document', () => {
            expect(() => print(buildAddDocument({records}))).not.toThrow();
        });
    });

    describe('buildAddVariables', () => {
        it('names the variables to match the document', () => {
            const records = [{path: '/mykonos', values: ['featured', 'provence']}];
            expect(buildAddVariables({field: categorize, records})).toEqual({
                property: 'j:defaultCategory',
                type: 'WEAKREFERENCE',
                mixins: ['jmix:categorized'],
                p0: '/mykonos',
                v0: ['featured', 'provence']
            });
        });

        it('works for tags too', () => {
            const records = [{path: '/a', values: ['news']}];
            expect(buildAddVariables({field: tag, records})).toMatchObject({
                property: 'j:tagList',
                type: 'STRING',
                mixins: ['jmix:tagged']
            });
        });
    });

    describe('canApply', () => {
        it('needs rows to apply to', () => {
            expect(canApply([{path: '/a'}])).toBe(true);
            expect(canApply([])).toBe(false);
            expect(canApply(undefined)).toBe(false);
        });
    });
});
describe('what each record holds, which an add has to know before it writes', () => {
    /** A record as a capture query answers for one. */
    const held = (path, property) => ({path, property});

    it('reads a single value as a one-item list', () => {
        expect(heldValues([held('/a', {value: '1 Main St', values: null})], {isReference: false}))
            .toEqual([{path: '/a', values: ['1 Main St']}]);
    });

    it('reads a multi-valued property as it stands', () => {
        expect(heldValues([held('/a', {value: null, values: ['sea', 'view']})], {isReference: false}))
            .toEqual([{path: '/a', values: ['sea', 'view']}]);
    });

    // The distinction an add turns on: a record holding nothing is the case it exists to serve, and
    // it is not the same as a record holding an empty list.
    it('reads a record that held nothing as null, not as an empty list', () => {
        expect(heldValues([held('/a', null)], {isReference: false}))
            .toEqual([{path: '/a', values: null}]);
        expect(heldValues([held('/a', {value: null, values: null})], {isReference: false}))
            .toEqual([{path: '/a', values: null}]);
    });

    // The table shows category display names; what goes back into the property is uuids.
    it('reads references by uuid, which is what the property holds', () => {
        expect(heldValues([held('/a', {refNodes: [{uuid: 'u1'}, {uuid: 'u2'}]})], {isReference: true}))
            .toEqual([{path: '/a', values: ['u1', 'u2']}]);
    });

    it('reads an empty reference list as nothing held', () => {
        expect(heldValues([held('/a', {refNodes: []})], {isReference: true}))
            .toEqual([{path: '/a', values: null}]);
    });

    it('copes with no records at all', () => {
        expect(heldValues(undefined, {isReference: false})).toEqual([]);
    });

    describe('reading them', () => {
        it('answers what the records hold', async () => {
            const client = {
                query: () => Promise.resolve({
                    data: {jcr: {nodesByPath: [held('/a', {value: 'sea', values: null})]}}
                })
            };

            await expect(captureHeldValues(client, {paths: ['/a'], property: 'j:tagList', language: 'en'}))
                .resolves.toEqual([{path: '/a', values: ['sea']}]);
        });

        // Null rather than a throw, so the dialog decides what a failed read costs it - for an add,
        // refusing the operation rather than silently replacing what it was asked to add to.
        it('answers null when the read fails, leaving the decision to the caller', async () => {
            const client = {query: () => Promise.reject(new Error('unreachable'))};

            await expect(captureHeldValues(client, {paths: ['/a'], property: 'j:tagList', language: 'en'}))
                .resolves.toBeNull();
        });

        it('asks for the uuids a reference column stores', async () => {
            const asked = [];
            const client = {
                query: ({query}) => {
                    asked.push(print(query));
                    return Promise.resolve({data: {jcr: {nodesByPath: []}}});
                }
            };

            await captureHeldValues(client, {
                paths: ['/a'],
                property: 'j:defaultCategory',
                language: 'en',
                isReference: true
            });

            expect(asked[0]).toContain('refNodes');
        });
    });
});
