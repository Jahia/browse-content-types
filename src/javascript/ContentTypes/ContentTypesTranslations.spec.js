import {
    filledByLanguage,
    missingCount,
    missingTranslations,
    translatableProperties,
    translationAlias,
    translationRelPath
} from './ContentTypesTranslations';

/** A property definition as the type query returns one. */
const definition = (name, overrides = {}) => ({
    name,
    displayName: name,
    internationalized: true,
    hidden: false,
    ...overrides
});

/** A record as the record query returns one: one aliased translation subnode per language. */
const record = byLanguage => {
    const row = {path: '/a'};
    Object.entries(byLanguage).forEach(([language, values]) => {
        row[translationAlias(language)] = values === null ?
            null :
            {properties: Object.entries(values).map(([name, value]) => ({name, value}))};
    });
    return row;
};

const PROPS = [
    {name: 'jcr:title', label: 'Title'},
    {name: 'subtitle', label: 'Subtitle'},
    {name: 'body', label: 'Body'}
];

describe('ContentTypesTranslations', () => {
    describe('translationAlias', () => {
        it('is a legal GraphQL alias', () => {
            expect(translationAlias('en')).toBe('tr_en');
        });

        // A GraphQL alias holds no hyphen, and a regional tag has one.
        it('sanitises a regional tag', () => {
            expect(translationAlias('pt-BR')).toBe('tr_pt_BR');
        });
    });

    describe('translationRelPath', () => {
        it('names the subnode the values live on', () => {
            expect(translationRelPath('fr')).toBe('j:translation_fr');
        });

        // Jahia's own subnode name uses the underscore form of the locale.
        it('uses the underscore form for a regional tag', () => {
            expect(translationRelPath('pt-BR')).toBe('j:translation_pt_BR');
        });
    });

    describe('translatableProperties', () => {
        it('keeps the internationalized ones', () => {
            const props = translatableProperties([definition('title'), definition('price', {internationalized: false})]);
            expect(props.map(p => p.name)).toEqual(['title']);
        });

        it('drops the repository\'s own hidden bookkeeping', () => {
            const props = translatableProperties([definition('title'), definition('jcr:language', {hidden: true})]);
            expect(props.map(p => p.name)).toEqual(['title']);
        });

        // The trap: jcr:title and jcr:description ARE translatable, and on a live site jcr:title was
        // where 10 of the 15 real gaps were. A prefix test would have thrown them all away.
        it('keeps a translatable jcr: property, which a prefix test would discard', () => {
            const props = translatableProperties([definition('jcr:title'), definition('jcr:description')]);
            expect(props.map(p => p.name)).toEqual(['jcr:title', 'jcr:description']);
        });

        it('prefers the display name, falling back to the property name', () => {
            const props = translatableProperties([definition('jcr:title', {displayName: 'Title'}), definition('body', {displayName: null})]);
            expect(props.map(p => p.label)).toEqual(['Title', 'body']);
        });

        it('survives no definitions', () => {
            expect(translatableProperties(null)).toEqual([]);
        });
    });

    describe('filledByLanguage', () => {
        it('reads what each language holds', () => {
            const row = record({en: {'jcr:title': 'Mykonos', body: 'text'}, fr: {'jcr:title': 'Mykonos'}});
            const filled = filledByLanguage(row, ['en', 'fr'], PROPS);
            expect([...filled.get('en')].sort()).toEqual(['body', 'jcr:title']);
            expect([...filled.get('fr')]).toEqual(['jcr:title']);
        });

        // One of the two shapes a gap takes, and the commoner one on a live site.
        it('treats a language with no subnode at all as holding nothing', () => {
            const filled = filledByLanguage(record({en: {'jcr:title': 'x'}, fr: null}), ['en', 'fr'], PROPS);
            expect(filled.get('fr').size).toBe(0);
        });

        // The other shape: the subnode is there and the value is blank.
        it('does not count a blank value as a translation', () => {
            const filled = filledByLanguage(record({en: {'jcr:title': 'x'}, fr: {'jcr:title': '   '}}), ['en', 'fr'], PROPS);
            expect(filled.get('fr').size).toBe(0);
        });
    });

    describe('missingTranslations', () => {
        it('reports what is filled elsewhere and missing here, by language', () => {
            const row = record({en: {'jcr:title': 'Mykonos', subtitle: 'Greek'}, fr: {'jcr:title': 'Mykonos'}});
            expect(missingTranslations(row, ['en', 'fr'], PROPS))
                .toEqual([{language: 'fr', properties: ['Subtitle']}]);
        });

        // Real gaps run both ways: on a live site noResultText was filled in French and missing in
        // English, so this cannot be driven off the default language alone.
        it('reports a gap in the default language just the same', () => {
            const row = record({en: {}, fr: {body: 'texte'}});
            expect(missingTranslations(row, ['en', 'fr'], PROPS))
                .toEqual([{language: 'en', properties: ['Body']}]);
        });

        it('says nothing about a complete record', () => {
            const row = record({en: {'jcr:title': 'a', body: 'b'}, fr: {'jcr:title': 'a', body: 'b'}});
            expect(missingTranslations(row, ['en', 'fr'], PROPS)).toEqual([]);
        });

        // THE definition. A field nobody filled anywhere is an unused field, not a missing
        // translation - counting it flagged all 299 records on a live site.
        it('ignores a property nobody has filled in any language', () => {
            const row = record({en: {'jcr:title': 'a'}, fr: {'jcr:title': 'a'}});
            expect(missingTranslations(row, ['en', 'fr'], PROPS)).toEqual([]);
        });

        it('reports several languages separately', () => {
            const row = record({en: {'jcr:title': 'a', body: 'b'}, fr: {'jcr:title': 'a'}, de: {body: 'b'}});
            expect(missingTranslations(row, ['en', 'fr', 'de'], PROPS)).toEqual([
                {language: 'fr', properties: ['Body']},
                {language: 'de', properties: ['Title']}
            ]);
        });

        it('lists several missing properties in a stable order', () => {
            const row = record({en: {'jcr:title': 'a', subtitle: 'b', body: 'c'}, fr: {}});
            expect(missingTranslations(row, ['en', 'fr'], PROPS)[0].properties)
                .toEqual(['Body', 'Subtitle', 'Title']);
        });

        // Nothing to compare against: a one-language site has no missing translations by definition.
        it('has nothing to say with fewer than two languages', () => {
            const row = record({en: {'jcr:title': 'a'}});
            expect(missingTranslations(row, ['en'], PROPS)).toEqual([]);
        });

        it('has nothing to say when the type has no translatable property', () => {
            expect(missingTranslations(record({en: {}, fr: {}}), ['en', 'fr'], [])).toEqual([]);
        });

        it('survives a missing record', () => {
            expect(missingTranslations(null, ['en', 'fr'], PROPS)).toEqual([]);
        });
    });

    describe('missingCount', () => {
        it('totals the gaps across languages', () => {
            expect(missingCount([
                {language: 'fr', properties: ['Title', 'Body']},
                {language: 'de', properties: ['Title']}
            ])).toBe(3);
        });

        it('is nothing for a complete record', () => {
            expect(missingCount([])).toBe(0);
            expect(missingCount(null)).toBe(0);
        });
    });
});
