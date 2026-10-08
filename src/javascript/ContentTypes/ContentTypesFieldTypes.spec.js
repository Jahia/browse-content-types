import {NOT_SELECTABLE_REFERENCE, NOT_SELECTABLE_RICHTEXT, PUBLICATION_STATUSES, isLanguageField, labelForValue, languageCodeFor, notSelectableReasonFor, publicationOptions} from './ContentTypesFieldTypes';

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

    it('blocks a weak reference the same way as a strong one', () => {
        expect(notSelectableReasonFor({requiredType: 'WEAKREFERENCE', constraints: []}))
            .toBe(NOT_SELECTABLE_REFERENCE);
    });

    it('blocks a reference pointing at a content item', () => {
        // The remaining case, and the only one: the display name of a content item is rarely the
        // question - what is wanted is which one, and that needs a picker this table has not got.
        expect(notSelectableReasonFor(reference(['jnt:contentFolder'])))
            .toBe(NOT_SELECTABLE_REFERENCE);
        expect(notSelectableReasonFor(reference(['luxe:agency'])))
            .toBe(NOT_SELECTABLE_REFERENCE);
    });

    it('blocks a reference declaring no constraint at all', () => {
        // There is nothing to read, so nothing says it is media. If a real field turns out to be
        // one of these, the answer is to stop blocking references - not to guess harder.
        expect(notSelectableReasonFor(reference(undefined))).toBe(NOT_SELECTABLE_REFERENCE);
        expect(notSelectableReasonFor(reference([]))).toBe(NOT_SELECTABLE_REFERENCE);
    });

    it('allows an image reference, whatever case the local name is in', () => {
        expect(notSelectableReasonFor(reference(['{http://www.jahia.org/jahia/mix/1.0}image']))).toBeUndefined();
        expect(notSelectableReasonFor(reference(['{http://www.jahia.org/jahia/mix/1.0}IMAGE']))).toBeUndefined();
        expect(notSelectableReasonFor(reference(['image']))).toBeUndefined();
    });

    /**
     * The prefixed form, which this used to assert was NOT matched.
     *
     * That assertion came with its own warning: "if Jahia ever starts to produce one, an image
     * column would silently become unselectable, and this is the assertion that would say so". It
     * said so. An image field on a real site was offered in the picker and refused, told the reader
     * a reference column would show identifiers, and would have shown a thumbnail.
     *
     * Which form arrives is not something to depend on either way, so both are read now.
     */
    it('recognises the image constraint in either form Jahia may answer with', () => {
        expect(notSelectableReasonFor(reference(['jmix:image']))).toBeUndefined();
        expect(notSelectableReasonFor(reference(['{http://www.jahia.org/jahia/mix/1.0}image']))).toBeUndefined();
    });

    /**
     * Media that is not plain `jmix:image`.
     *
     * The failure this was widened for: a realtor's animated portrait was refused while estate and
     * textIllustrated were not, the three differing only in what their references are constrained
     * to. An animated portrait may be an image subtype, a video or a plain file depending on how the
     * CND was written, and all three draw the same readable cell.
     */
    it.each([
        'jmix:animatedImage',
        '{http://www.jahia.org/jahia/mix/1.0}animatedImage',
        'jnt:imageFile',
        'jnt:file',
        'jmix:video',
        'jnt:videoFile',
        'jmix:audio'
    ])('allows a reference to %s', constraint => {
        expect(notSelectableReasonFor(reference([constraint]))).toBeUndefined();
    });

    it('allows a reference whose media constraint is listed among others', () => {
        expect(notSelectableReasonFor(reference(['luxe:agency', '{http://www.jahia.org/jahia/mix/1.0}image'])))
            .toBeUndefined();
    });

    it('allows every kind of property that is not a reference', () => {
        ['STRING', 'LONG', 'DOUBLE', 'DECIMAL', 'DATE', 'BOOLEAN', 'NAME', 'PATH', 'URI', 'BINARY']
            .forEach(requiredType => {
                expect(notSelectableReasonFor({requiredType, constraints: []})).toBeUndefined();
            });
    });

    /**
     * The selector comes from Content Editor's form rather than from the definition, so it is a
     * second argument - and one that is frequently absent. What these pin is that absence reads as
     * allowed, so a late form, a missing Content Editor and a plain string all behave alike.
     */
    describe('rich text', () => {
        const text = selectorType => notSelectableReasonFor({requiredType: 'STRING', constraints: []}, selectorType);

        it('blocks a string edited as rich text', () => {
            expect(text('richtext')).toBe(NOT_SELECTABLE_RICHTEXT);
        });

        it('does not care how the selector is capitalised', () => {
            // The name the CND is written with and the name Jahia reports it under are registered
            // separately, and have never been promised to agree.
            expect(text('RichText')).toBe(NOT_SELECTABLE_RICHTEXT);
            expect(text('RICHTEXT')).toBe(NOT_SELECTABLE_RICHTEXT);
        });

        it('allows a string edited with any other control', () => {
            ['Text', 'SmallText', 'Textarea', 'Choicelist', 'DatePicker'].forEach(selectorType => {
                expect(text(selectorType)).toBeUndefined();
            });
        });

        it('allows a property whose selector never arrived', () => {
            // The first render, before the form query answers - and every render on an installation
            // without Content Editor. Blocking a plain text column over an unanswered question is
            // the worse of the two mistakes.
            expect(text(undefined)).toBeUndefined();
            expect(text(null)).toBeUndefined();
            expect(text('')).toBeUndefined();
        });

        it('blocks a reference on being one, whatever selector it reports', () => {
            // Both rules can match a picker field; the reference rule is the one that answers, so
            // the message names what a reader can actually do something about.
            expect(notSelectableReasonFor(reference(['luxe:agency']), 'richtext')).toBe(NOT_SELECTABLE_REFERENCE);
        });
    });
});

/**
 * A language column draws the stored code in a badge rather than the name the definition labels it
 * with, which is shorter to read and what makes four languages fit a column at all.
 *
 * What these pin is the fallback more than the happy path: the rule guesses from a property's NAME
 * that it holds languages, and from the VALUE that there is a code to show. Both can be wrong on a
 * site nobody here has seen, and being wrong has to stay harmless.
 */
describe('a language as a badge reads it', () => {
    const languages = {propertyName: 'languages', valueLabels: {en: 'English', fr: 'French'}};

    it('shows the code rather than the name the definition gives it', () => {
        expect(languageCodeFor(languages, 'en')).toBe('EN');
        expect(languageCodeFor(languages, 'fr')).toBe('FR');
    });

    it('shows a three-letter code and a regional one', () => {
        expect(languageCodeFor(languages, 'fra')).toBe('FRA');
        expect(languageCodeFor(languages, 'pt-BR')).toBe('PT-BR');
    });

    it('reads one site underscore as another site hyphen', () => {
        expect(languageCodeFor(languages, 'en_US')).toBe('EN-US');
    });

    it('falls back to the label when the stored value is not a code at all', () => {
        // A choicelist is free to store the word and label it in each language. Upper-casing that
        // would give ENGLISH - longer than what it replaced, and shouting.
        const spelledOut = {propertyName: 'languages', valueLabels: {english: 'English'}};

        expect(languageCodeFor(spelledOut, 'english')).toBe('English');
    });

    it('falls back to the value itself when there is no label either', () => {
        expect(languageCodeFor({propertyName: 'languages'}, 'Serbo-Croatian')).toBe('Serbo-Croatian');
    });

    it('survives a value that is missing or blank', () => {
        expect(languageCodeFor(languages, undefined)).toBeUndefined();
        expect(languageCodeFor(languages, null)).toBeNull();
    });
});

describe('which columns draw languages', () => {
    it.each(['language', 'languages', 'lang', 'languageCode', 'language_code', 'forceLanguage', 'locale'])(
        'recognises %s',
        propertyName => {
            expect(isLanguageField({propertyName})).toBe(true);
        }
    );

    it('leaves everything else alone', () => {
        // `country` is the near miss worth pinning: it holds a code too, and it is NOT a language -
        // its names are what it draws, so it keeps its labels.
        ['country', 'description', 'title', 'languagesSpokenAtHome'].forEach(propertyName => {
            expect(isLanguageField({propertyName})).toBe(false);
        });
    });

    it('does not mind how a field was named', () => {
        expect(isLanguageField({propertyName: 'ForceLanguage'})).toBe(true);
    });

    it('answers for a field carrying no property name at all', () => {
        // Every common column - Path, Lock, Publication - reaches this with nothing.
        expect(isLanguageField({})).toBe(false);
        expect(isLanguageField(undefined)).toBe(false);
    });
});
