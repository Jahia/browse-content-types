import {buildRecordsJson, jsonValue} from './ContentTypesJson';

const OPTIONS = 'ct_options';

const node = overrides => ({path: '/sites/luxe/contents/a', name: 'a', displayName: 'A', ...overrides});
const field = overrides => ({key: OPTIONS, label: 'Options', isDynamic: true, ...overrides});

describe('ContentTypesJson', () => {
    describe('the types JSON exists to preserve', () => {
        it('writes a number as a number', () => {
            const row = node({[OPTIONS]: {value: '450000'}});
            expect(jsonValue(field({requiredType: 'LONG'}), row)).toBe(450000);
        });

        it('writes a decimal as a number', () => {
            const row = node({[OPTIONS]: {value: '12.5'}});
            expect(jsonValue(field({requiredType: 'DOUBLE'}), row)).toBe(12.5);
        });

        it('writes a boolean as a boolean, not the string it is stored as', () => {
            const row = node({[OPTIONS]: {value: 'true'}});
            expect(jsonValue(field({requiredType: 'BOOLEAN'}), row)).toBe(true);
            expect(jsonValue(field({requiredType: 'BOOLEAN'}), node({[OPTIONS]: {value: 'false'}}))).toBe(false);
        });

        // NaN is not representable in JSON and stringify turns it into null, losing both the value
        // and any chance of noticing it was there.
        it('leaves a number that will not parse as the string it arrived as', () => {
            const row = node({[OPTIONS]: {value: 'about ten'}});
            expect(jsonValue(field({requiredType: 'LONG'}), row)).toBe('about ten');
        });

        it('writes nothing as null rather than an empty string', () => {
            expect(jsonValue(field(), node())).toBeNull();
            expect(jsonValue(field(), node({[OPTIONS]: {value: null}}))).toBeNull();
            expect(jsonValue({key: 'createdBy'}, node())).toBeNull();
        });

        it('writes a multi-valued property as an array', () => {
            const row = node({[OPTIONS]: {values: ['1', '2']}});
            expect(jsonValue(field({multiple: true, requiredType: 'LONG'}), row)).toEqual([1, 2]);
        });

        // The property exists and is empty, which is not the same as absent - a consumer iterating
        // the field should not have to check which it got.
        it('writes an empty multi-valued property as an empty array, not null', () => {
            expect(jsonValue(field({multiple: true}), node())).toEqual([]);
            expect(jsonValue(field({multiple: true}), node({[OPTIONS]: {values: []}}))).toEqual([]);
        });

        it('writes tags and lock owners as arrays', () => {
            expect(jsonValue({key: 'tags'}, node({tags: {values: ['sea', 'sea', 'view']}}))).toEqual(['sea', 'view']);
            expect(jsonValue({key: 'lock'}, node())).toEqual([]);
        });
    });

    describe('where it deliberately differs from the CSV', () => {
        // The CSV writes "Swimming pool" because a person reads it; this writes the code because
        // something else does. The label belongs to a resource bundle and moves with the language.
        it('writes the stored code of a constrained property, not the label', () => {
            const row = node({[OPTIONS]: {value: 'swimmingPool'}});
            const constrained = field({valueLabels: {swimmingPool: 'Swimming pool'}});
            expect(jsonValue(constrained, row)).toBe('swimmingPool');
        });

        it('writes the publication status code, not the chip\'s wording', () => {
            const row = node({aggregatedPublicationInfo: {publicationStatus: 'PUBLISHED'}});
            expect(jsonValue({key: 'publicationStatus'}, row)).toBe('PUBLISHED');
        });

        it('writes the content type by system name, which does not move with the language', () => {
            const row = node({primaryNodeType: {name: 'luxe:estate', displayName: 'Estate'}});
            expect(jsonValue({key: 'type'}, row)).toBe('luxe:estate');
        });
    });

    describe('the parts it shares with the CSV', () => {
        it('keeps a date as the ISO timestamp the repository stores', () => {
            const row = node({createdDate: {value: '2026-09-01T14:22:11.000Z'}});
            expect(jsonValue({key: 'createdDate'}, row)).toBe('2026-09-01T14:22:11.000Z');
        });

        // The uuid it stores is in the record's own id field if an identifier is wanted; a reference
        // to a name nobody can read makes the export harder to use, not more faithful.
        it('resolves a reference to the name of the node it points at', () => {
            expect(jsonValue(field(), node({[OPTIONS]: {refNode: {displayName: 'Villa Bleue'}}}))).toBe('Villa Bleue');
            expect(jsonValue(field({multiple: true}), node({[OPTIONS]: {refNodes: [{displayName: 'One'}]}}))).toEqual(['One']);
        });

        it('writes null for a field it does not recognise', () => {
            expect(jsonValue({key: 'somethingElse'}, node())).toBeNull();
        });
    });

    describe('buildRecordsJson', () => {
        const fields = [{key: 'path', label: 'Path'}, {key: 'type', label: 'Content Type'}];

        it('writes an array of objects keyed by the column labels the reader chose', () => {
            const rows = [node({primaryNodeType: {name: 'luxe:estate'}})];
            const parsed = JSON.parse(buildRecordsJson({nodes: rows, fields, nameLabel: 'Name'}));

            expect(parsed).toEqual([{
                Name: 'A',
                Path: '/sites/luxe/contents/a',
                'Content Type': 'luxe:estate'
            }]);
        });

        it('puts the name first, as the table and the CSV do', () => {
            const parsed = buildRecordsJson({nodes: [node()], fields, nameLabel: 'Name'});
            expect(Object.keys(JSON.parse(parsed)[0])[0]).toBe('Name');
        });

        it('falls back to the system name for a record with no display name', () => {
            const parsed = JSON.parse(buildRecordsJson({nodes: [node({displayName: null})], fields: [], nameLabel: 'Name'}));
            expect(parsed[0].Name).toBe('a');
        });

        it('is an empty array when nothing is selected', () => {
            expect(JSON.parse(buildRecordsJson({nodes: [], fields, nameLabel: 'Name'}))).toEqual([]);
        });

        // A file somebody chose to download is a file somebody may open and read.
        it('is indented, and ends with a newline', () => {
            const text = buildRecordsJson({nodes: [node()], fields, nameLabel: 'Name'});
            expect(text).toContain('\n  {');
            expect(text.endsWith('\n')).toBe(true);
        });
    });
});
