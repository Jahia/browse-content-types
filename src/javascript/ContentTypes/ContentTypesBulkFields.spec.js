import {BULK_FIELDS, bulkFieldVariables, canApply, pickerField, recordsWithValues} from './ContentTypesBulkFields';

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

    describe('canApply', () => {
        it('needs rows to apply to', () => {
            expect(canApply([{path: '/a'}])).toBe(true);
            expect(canApply([])).toBe(false);
            expect(canApply(undefined)).toBe(false);
        });
    });
});
