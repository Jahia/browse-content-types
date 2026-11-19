import {activeFieldKeys, columnKeyOfField} from './useRevealFilteredColumns';

jest.mock('@jahia/jcontent', () => ({}), {virtual: true});

describe('columnKeyOfField', () => {
    it('gives the column of a property of the type', () => {
        expect(columnKeyOfField({key: 'prop:price', property: 'price'})).toBe('ct_price');
        expect(columnKeyOfField({key: 'prop:jcr:title', property: 'jcr:title'})).toBe('ct_jcr_58_title');
    });

    it('gives the column of a standard field', () => {
        expect(columnKeyOfField({key: 'std:created', property: 'jcr:created'})).toBe('createdDate');
        expect(columnKeyOfField({key: 'std:lastPublishedBy', property: 'j:lastPublishedBy'})).toBe('publishedBy');
    });

    it('gives no column for the Name column, always shown, or an unknown field', () => {
        expect(columnKeyOfField({key: 'std:displayName', property: 'jcr:title'})).toBeNull();
        expect(columnKeyOfField(undefined)).toBeNull();
    });
});

describe('activeFieldKeys', () => {
    const fields = [
        {key: 'prop:price', kind: 'number', property: 'price'},
        {key: 'std:createdBy', kind: 'text', property: 'jcr:createdBy'}
    ];

    it('keeps the filters that apply only', () => {
        expect(activeFieldKeys([
            {field: 'prop:price', operator: 'gt', value: '100'},
            {field: 'std:createdBy', operator: 'contains'},
            {field: 'prop:gone', operator: 'contains', value: 'x'}
        ], fields)).toEqual(['prop:price']);
    });
});
