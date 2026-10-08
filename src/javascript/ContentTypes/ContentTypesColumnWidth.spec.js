import {WIDE_COMMON_FIELDS, columnWidthFor, commonColumnWidth} from './ContentTypesColumnWidth';

/**
 * The width a content type's own column asks for.
 *
 * Worth pinning because the rule has three paths that look alike and are not: a language is narrowed
 * on its name whatever else it is, a property offering a value list is measured from the labels it
 * draws, and only then is a plain string matched by name. That order is the point - `country` was
 * moved out of the name list because its labels are what it draws, and `languages` has to jump the
 * value-list path for the opposite reason: since the badges, its labels are not drawn at all.
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
        // The point of the distinction: a choicelist is sized by what it draws. Labels shorter than
        // the floor still get the floor.
        const asChoicelist = field({
            propertyName: 'spokenIn',
            valueOptions: [{label: 'fr'}, {label: 'en'}, {label: 'de'}]
        });
        expect(columnWidthFor(asChoicelist)).toBe('calc(10ch + 32px)');
    });

    it('should narrow a language choicelist rather than measure its labels', () => {
        // `languages` on this site is a choicelist, and until the badges it was sized by the labels
        // it drew. It no longer draws them - the cell holds the stored codes - so measuring them
        // would size the column for text that does not appear in it. A long label is the case that
        // shows the difference: measured it would ask for the 14ch cap.
        const asChoicelist = field({
            propertyName: 'languages',
            valueOptions: [{label: 'Brazilian Portuguese'}, {label: 'English'}]
        });
        expect(columnWidthFor(asChoicelist)).toBe(NARROW);
    });

    it('should cap a value list rather than size for its longest outlier', () => {
        const withLongLabel = field({
            propertyName: 'country',
            valueOptions: [{label: 'A'.repeat(38)}]
        });
        expect(columnWidthFor(withLongLabel)).toBe('calc(14ch + 32px)');
    });
});

/**
 * The width a column common to every node asks for.
 *
 * Untested until the headings were shortened, which is what made it worth pinning: these widths are
 * decided by the HEADING as much as by the value, so they are the thing a change of wording can
 * quietly break. The date columns are the case to watch - 14ch is what a date needs, and a heading
 * longer than that truncates with no sign in the code that it has.
 */
describe('commonColumnWidth', () => {
    const DATE = 'calc(14ch + 32px)';
    const ONE_WORD = 'calc(10ch + 32px)';
    const NARROW = 'calc(12ch + 32px)';

    it('gives a one-word heading the narrowest width', () => {
        // "Creator"/"Créateur" - seven and eight characters, against logins that measured five on
        // this site.
        expect(commonColumnWidth('createdBy')).toBe(ONE_WORD);
    });

    it('keeps the two columns whose French heading ends in "par" wider', () => {
        // Not an oversight, and not fixed by shortening either: "Publié par" and "Modif. par" are
        // both ten characters, which truncated at the one-word width where the English headings
        // would have fitted. A width is shared by every language, so the wider one wins.
        expect(commonColumnWidth('publishedBy')).toBe(NARROW);
        expect(commonColumnWidth('lastModifiedBy')).toBe(NARROW);
    });

    it('gives every date column the width a date needs', () => {
        ['createdDate', 'lastModified', 'publishedOn'].forEach(key => {
            expect(commonColumnWidth(key)).toBe(DATE);
        });
    });

    it('gives a list a full text column', () => {
        ['tags', 'categories'].forEach(key => {
            expect(commonColumnWidth(key)).toBe('220px');
        });
    });

    it('gives the path half as much again, being the longest thing drawn', () => {
        // Sixty per cent over the text column it used to share with the lists. It is still one of
        // the wide fields - that set is also what gives it hover-to-scroll, which no width replaces.
        expect(commonColumnWidth('path')).toBe('352px');
        expect(WIDE_COMMON_FIELDS.has('path')).toBe(true);
    });

    it('falls back to the common width for anything else', () => {
        expect(commonColumnWidth('type')).toBe('160px');
        expect(commonColumnWidth('publicationStatus')).toBe('160px');
    });
});
