import {NOT_SELECTABLE_REFERENCE, PUBLICATION_STATUSES, labelForValue, notSelectableReasonFor, publicationOptions} from './ContentTypesFieldTypes';

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

/**
 * Which of a content type's own properties may be chosen as a column.
 *
 * The rule reads the same two things the image filter reads - the required type, and what a
 * reference is constrained to point at - so these assertions are as much about those two staying in
 * agreement as about the rule itself.
 */
describe('notSelectableReasonFor', () => {
    const reference = constraints => ({requiredType: 'REFERENCE', constraints});

    it('blocks a reference with no constraint at all', () => {
        expect(notSelectableReasonFor(reference(undefined))).toBe(NOT_SELECTABLE_REFERENCE);
        expect(notSelectableReasonFor(reference([]))).toBe(NOT_SELECTABLE_REFERENCE);
    });

    it('blocks a weak reference the same way as a strong one', () => {
        expect(notSelectableReasonFor({requiredType: 'WEAKREFERENCE', constraints: []}))
            .toBe(NOT_SELECTABLE_REFERENCE);
    });

    it('blocks a reference pointing at something that is not an image', () => {
        expect(notSelectableReasonFor(reference(['{http://www.jcp.org/jcr/nt/1.0}file'])))
            .toBe(NOT_SELECTABLE_REFERENCE);
        expect(notSelectableReasonFor(reference(['jnt:contentFolder'])))
            .toBe(NOT_SELECTABLE_REFERENCE);
    });

    it('allows an image reference, whatever case the local name is in', () => {
        expect(notSelectableReasonFor(reference(['{http://www.jahia.org/jahia/mix/1.0}image']))).toBeUndefined();
        expect(notSelectableReasonFor(reference(['{http://www.jahia.org/jahia/mix/1.0}IMAGE']))).toBeUndefined();
        expect(notSelectableReasonFor(reference(['image']))).toBeUndefined();
    });

    /**
     * The prefixed form is deliberately NOT matched, and this pins it.
     *
     * `constraints` comes back from Jahia expanded - `{http://www.jahia.org/jahia/mix/1.0}image` -
     * and the test strips exactly that leading `{...}`. A `jmix:image` would survive the strip whole
     * and fail to equal `image`. Nothing produces one today; if Jahia ever starts to, an image
     * column would silently become unselectable, and this is the assertion that would say so.
     */
    it('does not recognise the prefixed form of the image constraint', () => {
        expect(notSelectableReasonFor(reference(['jmix:image']))).toBe(NOT_SELECTABLE_REFERENCE);
    });

    it('allows an image reference listed among other constraints', () => {
        expect(notSelectableReasonFor(reference(['jnt:file', '{http://www.jahia.org/jahia/mix/1.0}image'])))
            .toBeUndefined();
    });

    it('allows every kind of property that is not a reference', () => {
        ['STRING', 'LONG', 'DOUBLE', 'DECIMAL', 'DATE', 'BOOLEAN', 'NAME', 'PATH', 'URI', 'BINARY']
            .forEach(requiredType => {
                expect(notSelectableReasonFor({requiredType, constraints: []})).toBeUndefined();
            });
    });
});
