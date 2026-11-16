import {exportColumnsFor} from './ContentTypesExportColumns';

describe('exportColumnsFor', () => {
    it('maps the visible columns to the export columns of jContent, in order', () => {
        expect(exportColumnsFor([
            {key: 'title', isDynamic: true, propertyName: 'jcr:title'},
            {key: 'createdDate'},
            {key: 'id'},
            {key: 'missingTranslations'}
        ])).toEqual(['prop:jcr:title', 'std:created', 'std:uuid']);
    });

    it('gives no column without fields', () => {
        expect(exportColumnsFor(undefined)).toEqual([]);
    });
});
