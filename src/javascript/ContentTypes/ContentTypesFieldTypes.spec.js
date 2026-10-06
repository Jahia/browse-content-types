import {PUBLICATION_STATUSES, labelForValue, publicationOptions} from './ContentTypesFieldTypes';

/**
 * The vocabulary every other part of the table is built on.
 *
 * The kinds themselves are asserted where they are used - which control an editor offers, which
 * operators a filter lists. What is checked here is what the module decides on its own: which
 * publication statuses are worth offering, and how a stored code reads to a person.
 */

/** A column, as the catalog hands one over. */
const field = (overrides = {}) => ({
    key: 'options',
    label: 'Options',
    jcrProperty: 'options',
    multiple: false,
    ...overrides
});

describe('the publication statuses', () => {
    it('offers four of the eleven statuses Jahia can report', () => {
        expect(PUBLICATION_STATUSES.map(status => status.value))
            .toEqual(['PUBLISHED', 'MODIFIED', 'UNPUBLISHED', 'NOT_PUBLISHED']);
    });

    it('tells never published from withdrawn, which are not the same state', () => {
        const values = PUBLICATION_STATUSES.map(status => status.value);

        expect(values).toContain('UNPUBLISHED');
        expect(values).toContain('NOT_PUBLISHED');
    });

    it('names the statuses in the reader words', () => {
        expect(publicationOptions(() => 'Published')[0]).toEqual({value: 'PUBLISHED', label: 'Published'});
    });
});

describe('a stored value as the reader knows it', () => {
    it('shows a stored code by the label an editor sees', () => {
        const column = field({valueLabels: {swimmingPool: 'Swimming pool'}});

        expect(labelForValue(column, 'swimmingPool')).toBe('Swimming pool');
    });

    it('falls through to the value for a code the definition no longer offers', () => {
        // Which would otherwise render as nothing at all.
        expect(labelForValue(field({valueLabels: {}}), 'sauna')).toBe('sauna');
        expect(labelForValue(field(), 'sauna')).toBe('sauna');
        expect(labelForValue(undefined, 'sauna')).toBe('sauna');
    });
});
