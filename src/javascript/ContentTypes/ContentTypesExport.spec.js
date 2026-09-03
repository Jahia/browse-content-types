import {EXPORT_FORMATS, EXPORT_FORMAT_KEYS, exportFields, exportFileName, initialExportKeys} from './ContentTypesExport';

const t = key => key;

describe('ContentTypesExport', () => {
    describe('exportFileName', () => {
        // Windows refuses a filename holding a colon outright, and a type name always has one.
        it('replaces the colon in a type name', () => {
            expect(exportFileName('luxe:estate', 'csv', new Date(2026, 8, 3))).toBe('luxe_estate-2026-09-03.csv');
        });

        it('takes the extension from the chosen format', () => {
            expect(exportFileName('jnt:news', 'json', new Date(2026, 8, 3))).toBe('jnt_news-2026-09-03.json');
        });

        it('pads a single-digit month and day', () => {
            expect(exportFileName('jnt:news', 'csv', new Date(2026, 0, 5))).toBe('jnt_news-2026-01-05.csv');
        });

        // The local day, not toISOString's UTC one: an export made at nine in the evening in Paris
        // would otherwise be filed under the following day.
        it('dates the file by the local day', () => {
            expect(exportFileName('jnt:news', 'csv', new Date(2026, 8, 3, 23, 30))).toBe('jnt_news-2026-09-03.csv');
        });

        it('has something to call a file even with no type', () => {
            expect(exportFileName(undefined, 'csv', new Date(2026, 8, 3))).toBe('content-2026-09-03.csv');
        });
    });

    describe('the format table', () => {
        // Jahia's XML is deliberately absent: /cms/export takes one node path, is deprecated as of
        // 8.2.4.0 with no replacement, and jContent already puts its own export button in this bar.
        it('offers CSV and JSON, and nothing else', () => {
            expect(EXPORT_FORMAT_KEYS).toEqual(['csv', 'json']);
        });

        it('gives each format its own extension and media type', () => {
            expect(EXPORT_FORMATS.csv).toMatchObject({extension: 'csv', mimeType: 'text/csv;charset=utf-8'});
            expect(EXPORT_FORMATS.json).toMatchObject({extension: 'json', mimeType: 'application/json'});
        });

        const nodes = [{path: '/a', name: 'a', displayName: 'A', createdBy: {value: 'pam'}}];
        const fields = [{key: 'createdBy', label: 'Created by'}];

        it('builds a CSV through the CSV projection', () => {
            const text = EXPORT_FORMATS.csv.build({nodes, fields, nameLabel: 'Name', t});
            expect(text).toContain('Name,Created by');
            expect(text).toContain('A,pam');
        });

        it('builds JSON through the JSON projection', () => {
            const text = EXPORT_FORMATS.json.build({nodes, fields, nameLabel: 'Name', t});
            expect(JSON.parse(text)).toEqual([{Name: 'A', 'Created by': 'pam'}]);
        });
    });

    describe('initialExportKeys', () => {
        // The set the reader arranged and is looking at, which is the honest starting point.
        it('starts from what the table is showing, in its order', () => {
            expect(initialExportKeys([{key: 'b'}, {key: 'a'}])).toEqual(['b', 'a']);
        });

        it('copes with a table showing nothing but the name', () => {
            expect(initialExportKeys([])).toEqual([]);
            expect(initialExportKeys(undefined)).toEqual([]);
        });
    });

    describe('exportFields', () => {
        const catalog = new Map([
            ['a', {key: 'a', label: 'A'}],
            ['b', {key: 'b', label: 'B'}]
        ]);

        it('resolves the chosen keys, keeping the chosen order', () => {
            expect(exportFields(['b', 'a'], catalog).map(field => field.key)).toEqual(['b', 'a']);
        });

        // Looked up in the whole catalog rather than in what is visible, so a column can be exported
        // without being shown in the table first.
        it('finds a column that is in the catalog but not on screen', () => {
            expect(exportFields(['a'], catalog)).toHaveLength(1);
        });

        // A saved set can name a property the type no longer declares.
        it('drops a key that names nothing rather than exporting an empty column', () => {
            expect(exportFields(['a', 'gone'], catalog).map(field => field.key)).toEqual(['a']);
        });

        it('copes with nothing chosen', () => {
            expect(exportFields([], catalog)).toEqual([]);
            expect(exportFields(undefined, catalog)).toEqual([]);
        });
    });
});
