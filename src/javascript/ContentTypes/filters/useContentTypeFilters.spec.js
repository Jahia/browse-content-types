import {NAME_FIELD_KEY, groupFields, withNameField} from './useContentTypeFilters';

jest.mock('@jahia/ui-extender', () => ({registry: {get: jest.fn()}}));
jest.mock('@jahia/jcontent', () => ({}), {virtual: true});

const fields = [
    {key: 'std:systemName', label: 'System name', kind: 'text', property: 'j:nodename', looseSeparators: true},
    {key: 'std:createdBy', label: 'Created by', kind: 'text', property: 'jcr:createdBy'},
    {key: 'prop:jcr:title', label: 'Title', kind: 'text', property: 'jcr:title'},
    {key: 'prop:price', label: 'Price', kind: 'number', property: 'price'}
];

describe('withNameField', () => {
    it('puts the Name column first, in place of the field of the primary item', () => {
        const merged = withNameField(fields, {label: 'Name', jcrProperty: 'jcr:title', looseSeparators: false});
        expect(merged.map(field => field.key)).toEqual([NAME_FIELD_KEY, 'std:systemName', 'std:createdBy', 'prop:price']);
        expect(merged[0]).toEqual({key: NAME_FIELD_KEY, label: 'Name', kind: 'text', property: 'jcr:title'});
    });

    it('replaces the system name for a type with no primary item, and keeps its loose separators', () => {
        const merged = withNameField(fields, {label: 'Name', jcrProperty: 'j:nodename', looseSeparators: true});
        expect(merged.map(field => field.key)).toEqual([NAME_FIELD_KEY, 'std:createdBy', 'prop:jcr:title', 'prop:price']);
        expect(merged[0]).toMatchObject({property: 'j:nodename', looseSeparators: true});
    });

    it('gives the fields as they are before the definition of the type is read', () => {
        expect(withNameField(fields, undefined)).toBe(fields);
        expect(withNameField(fields, {label: 'Name'})).toBe(fields);
    });
});

describe('groupFields', () => {
    it('puts the Name column and the properties of the type first, then the standard fields, each with its group', () => {
        const grouped = groupFields(withNameField(fields, {label: 'Name', jcrProperty: 'jcr:title'}), 'Type', 'Common');
        expect(grouped.map(field => [field.key, field.group])).toEqual([
            [NAME_FIELD_KEY, 'Type'],
            ['prop:price', 'Type'],
            ['std:systemName', 'Common'],
            ['std:createdBy', 'Common']
        ]);
    });
});
