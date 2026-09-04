/**
 * Which of a record's translatable properties are filled in one language and not in another.
 *
 * Free of React and of Apollo, like the other logic modules here. What is worth getting right is
 * what counts as a missing translation and where the values are read from, and both are pure
 * functions of what the record query answered.
 *
 * **Where the values live.** An internationalized property is not stored on the record: it lives on
 * a hidden `j:translation_<lang>` subnode, one per language, and the record query fetches one per
 * language the site has active (see ContentTypesRecordQuery). `descendants(typesFilter:)` cannot see
 * those subnodes at all; `descendant(relPath:)` can, which is the whole reason this is readable from
 * the browser.
 */

/**
 * The alias one language's subnode is returned under.
 *
 * A GraphQL alias may hold letters, digits and underscores, so a language tag is sanitised rather
 * than used raw: `en` and `fr` are already safe but a regional tag such as `pt-BR` is not, and
 * Jahia's own subnode name (`j:translation_pt_BR`) uses the underscore form.
 */
export const translationAlias = language => `tr_${String(language || '').replace(/[^a-zA-Z0-9]/g, '_')}`;

/** The subnode a language's values are kept on. */
export const translationRelPath = language => `j:translation_${String(language || '').replace(/-/g, '_')}`;

/**
 * The properties of a type that can be translated at all.
 *
 * Taken from the type's WHOLE definition list, inherited properties included, and deliberately not
 * from the table's columns. The columns keep only what the selected type declares itself, and
 * `jcr:title` is declared by `mix:title` rather than by any content type - yet measured against a
 * site it is where 10 of the 15 real translation gaps were. Filtering by what a type declares itself
 * would miss nearly all of them.
 *
 * `hidden` properties are dropped: they are the repository's own bookkeeping and nobody translates
 * them. **A `jcr:` prefix is NOT a test for that** - `jcr:title` and `jcr:description` are ordinary
 * translatable fields, while `jcr:uuid` and `jcr:language` are not, and the definition already says
 * which is which.
 */
export const translatableProperties = definitions => (definitions || [])
    .filter(definition => definition.internationalized && !definition.hidden)
    .map(definition => ({name: definition.name, label: definition.displayName || definition.name}));

/** Whether a value counts as present. Blank is absent: a space is not a translation. */
const isFilled = value => Boolean(value && String(value).trim());

/**
 * Which of the translatable properties each language actually holds.
 *
 * A language whose subnode is missing entirely holds nothing - which is one of the two shapes a gap
 * takes, and the commoner one. The other is a subnode that exists with the property absent or blank.
 */
export const filledByLanguage = (record, languages, properties) => {
    const filled = new Map();

    (languages || []).forEach(language => {
        const subnode = record?.[translationAlias(language)];
        const values = new Map(((subnode?.properties) || []).map(property => [property.name, property.value]));
        filled.set(language, new Set(
            (properties || []).map(property => property.name).filter(name => isFilled(values.get(name)))
        ));
    });

    return filled;
};

/**
 * The gaps: per language, the properties that are filled somewhere else and not here.
 *
 * **This is the definition, and it is a choice.** Measured against a site of 299 records:
 *
 * - filled in one language and missing in another -> 15 records flagged. This one.
 * - filled in the site's default language, missing elsewhere -> 11 flagged. Misses gaps that run the
 *   other way, and real ones do: `noResultText` was filled in French and missing in English.
 * - any translatable property left empty in any language -> **299 flagged**, i.e. every record.
 *   That is what a literal reading of "not fully translated" gives, and it is useless: almost
 *   nothing fills every optional field in every language.
 *
 * So a property nobody has filled in any language is not a missing translation - it is an unused
 * field. Only a property somebody has already written somewhere is something to translate.
 *
 * Returns entries only for languages that are actually missing something, so an empty array means
 * the record is complete and the cell has nothing to say.
 */
export const missingTranslations = (record, languages, properties) => {
    if (!record || (languages || []).length < 2 || (properties || []).length === 0) {
        return [];
    }

    const filled = filledByLanguage(record, languages, properties);
    const anywhere = new Set();
    filled.forEach(names => names.forEach(name => anywhere.add(name)));

    const labelOf = new Map(properties.map(property => [property.name, property.label]));

    return languages
        .map(language => ({
            language,
            properties: [...anywhere]
                .filter(name => !filled.get(language).has(name))
                .map(name => labelOf.get(name) || name)
                .sort((a, b) => a.localeCompare(b))
        }))
        .filter(entry => entry.properties.length > 0);
};

/** How many properties are missing a translation across all languages, for a short summary. */
export const missingCount = gaps => (gaps || [])
    .reduce((total, entry) => total + entry.properties.length, 0);
