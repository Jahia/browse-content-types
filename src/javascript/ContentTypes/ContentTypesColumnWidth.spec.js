import {columnWidthFor} from './ContentTypesColumnWidth';

/**
 * The width a content type's own column asks for.
 *
 * Worth pinning because the rule has two paths that look alike and are not: a property offering a
 * value list is measured from the labels it draws, and only a plain string is matched by name. That
 * distinction is why `country` was moved out of the name list, and why adding language names to it
 * changes nothing for `languages` on this site - a choicelist - while it does change `forceLanguage`.
 */
describe('columnWidthFor', () => {
    const NARROW = 'calc(12ch + 32px)';
    const DEFAULT = '220px';

    const field = extra => ({propertyName: 'whatever', requiredType: 'STRING', ...extra});

    it('should give prose the default width', () => {
        expect(columnWidthFor(field({propertyName: 'description'}))).toBe(DEFAULT);
    });

    it('should narrow a country code', () => {
        expect(columnWidthFor(field({propertyName: 'country'}))).toBe(NARROW);
    });

    it.each(['language', 'languages', 'lang', 'languageCode', 'language_code', 'forceLanguage', 'locale'])(
        'should narrow %s, which holds a code and not a sentence',
        name => {
            expect(columnWidthFor(field({propertyName: name}))).toBe(NARROW);
        }
    );

    it('should match the name whatever its casing', () => {
        expect(columnWidthFor(field({propertyName: 'ForceLanguage'}))).toBe(NARROW);
    });

    it('should narrow a number without needing its name', () => {
        expect(columnWidthFor(field({propertyName: 'yearsOfExperience', requiredType: 'LONG'}))).toBe(NARROW);
    });

    it('should measure a value list from its labels rather than by name', () => {
        // The point of the distinction: `languages` on this site is a choicelist, so it is sized by
        // what it draws even though its name is in the list. Labels shorter than the floor still
        // get the floor.
        const asChoicelist = field({
            propertyName: 'languages',
            valueOptions: [{label: 'fr'}, {label: 'en'}, {label: 'de'}]
        });
        expect(columnWidthFor(asChoicelist)).toBe('calc(10ch + 32px)');
    });

    it('should cap a value list rather than size for its longest outlier', () => {
        const withLongLabel = field({
            propertyName: 'country',
            valueOptions: [{label: 'A'.repeat(38)}]
        });
        expect(columnWidthFor(withLongLabel)).toBe('calc(14ch + 32px)');
    });
});
