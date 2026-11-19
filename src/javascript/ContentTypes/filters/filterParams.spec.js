import {cleanFilter, readFilters, setFilterIn, withFilters} from './filterParams';

const lastModified = {field: 'std:lastModified', operator: 'after', value: '2026-11-01'};
const createdBy = {field: 'std:createdBy', operator: 'contains', value: 'anna'};

describe('readFilters', () => {
    it('case 1: reads the filters of the params', () => {
        expect(readFilters({filters: [lastModified, createdBy]})).toEqual([lastModified, createdBy]);
    });

    it('case 9: gives no filter when the parameter is not a list', () => {
        expect(readFilters({filters: 'broken'})).toEqual([]);
        expect(readFilters({filters: {field: 'x'}})).toEqual([]);
        expect(readFilters({})).toEqual([]);
        expect(readFilters(undefined)).toEqual([]);
    });

    it('drops the entries that are not filters', () => {
        expect(readFilters({filters: [null, 3, 'x', {field: 'a'}, {operator: 'b'}, {field: 1, operator: 'b'}, createdBy]})).toEqual([createdBy]);
    });

    it('keeps the string values of a list', () => {
        expect(readFilters({filters: [{field: 'prop:options', operator: 'is', value: ['garage', 3, 'pool']}]}))
            .toEqual([{field: 'prop:options', operator: 'is', value: ['garage', 'pool']}]);
    });
});

describe('cleanFilter', () => {
    it('never writes an undefined value, which the rison of the jContent URL refuses', () => {
        const cleaned = cleanFilter({field: 'std:lastPublished', operator: 'empty', value: undefined});
        expect(cleaned).toEqual({field: 'std:lastPublished', operator: 'empty'});
        expect(Object.keys(cleaned)).not.toContain('value');
    });

    it('drops an empty value', () => {
        expect(cleanFilter({field: 'a', operator: 'contains', value: ''})).toEqual({field: 'a', operator: 'contains'});
        expect(cleanFilter({field: 'a', operator: 'is', value: []})).toEqual({field: 'a', operator: 'is'});
    });
});

describe('withFilters', () => {
    it('keeps the other params', () => {
        expect(withFilters({searchTerms: 'news', sub: true}, [lastModified])).toEqual({searchTerms: 'news', sub: true, filters: [lastModified]});
    });

    it('removes the key for an empty list', () => {
        expect(withFilters({searchTerms: 'news', filters: [lastModified]}, [])).toEqual({searchTerms: 'news'});
        expect(withFilters(undefined, [])).toEqual({});
    });
});

describe('setFilterIn', () => {
    it('replaces the filter of the same field', () => {
        expect(setFilterIn([lastModified, createdBy], {...createdBy, value: 'bob'})).toEqual([lastModified, {...createdBy, value: 'bob'}]);
    });

    it('adds a filter of a new field last', () => {
        expect(setFilterIn([lastModified], createdBy)).toEqual([lastModified, createdBy]);
    });
});
