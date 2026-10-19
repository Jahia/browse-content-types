/**
 * The decisions behind a content type's columns, free of React and of Apollo.
 *
 * Which properties can be a column, what each one's key is, how it sorts, and where a reader's
 * choice is kept - none of that needs a component to be true, and all of it is where this module
 * gets things wrong in ways a type definition or a stored value can trigger. Kept apart from
 * `useContentTypeColumns` for the same reason `ContentTypesCounts` is kept apart from
 * `useTypeCounts`: the rules are worth testing on their own, and the hook around them is then
 * only the wiring.
 */

/** Scoped per site and per content type: this is how one person likes to read one table. */
const STORAGE_PREFIX = 'content-types:columns:';

export const storageKeyFor = (site, contentType) => `${STORAGE_PREFIX}${site}:${contentType}`;

/**
 * A property name as something that may be a GraphQL alias, and nothing else that can be.
 *
 * An alias may hold letters, digits and underscores, so every other character has to go - but
 * collapsing them all to `_` is not reversible, and two names then land on one key:
 * `acme:sub-title` and `acme:sub_title` would both answer `acme_sub_title`. One key behind two
 * definitions makes the picker tick both boxes at once while only ever drawing one of them, and
 * points the sort at an ambiguous alias.
 *
 * Encoding the character's code point instead keeps it one-to-one - `luxe:price` becomes
 * `luxe_58_price` - and keeps it STABLE, which a positional key would not: this key is persisted
 * per reader, so deriving it from where the property sits in the definition would silently reset
 * everyone's chosen columns the next time the type gained a property.
 */
export const aliasFor = propertyName =>
    String(propertyName).replace(/[^a-zA-Z0-9]/g, character => `_${character.charCodeAt(0)}_`);

/** The column key for one of a type's own properties. Prefixed, so it cannot meet a common field. */
export const columnKeyFor = propertyName => `ct_${aliasFor(propertyName)}`;

/** A binary property (a large file's own bytes) has no reasonable display as a table cell. */
export const isRenderable = definition =>
    !definition.hidden && !definition.protected && definition.requiredType !== 'BINARY';

/**
 * How a property gets ordered, if it can be.
 *
 * There are two mechanisms and they are not interchangeable, so a field carries whichever one suits
 * it and the query sends only that one.
 *
 * `sortJcrProperty` names a property for the criteria query's own `ordering`, which sorts in the
 * repository against the property as what it actually is - a number as a number, a date as a date.
 * That is the right answer for any plain value, and it is what makes a numeric column sortable at
 * all: `fieldSorter` compares the *text* a GraphQL field returned, so it put a column of prices in
 * the order 1, 11, 12, 2 and there is no numeric mode to ask it for.
 *
 * `sortProperty` names a GraphQL field path for `fieldSorter`, and is kept for the two cases
 * ordering cannot serve.
 *
 * A reference, where the repository would order by the stored uuid - nothing anybody can see - and
 * what is wanted is the name of the node it points at, which only exists once GraphQL has resolved
 * it.
 *
 * An internationalized property, whose value is not on the record at all: it lives on the hidden
 * `j:translation_<lang>` subnode (see ContentTypesTranslations). `ordering` names a property of the
 * record and the criteria query is built on a bare selector, so the repository is asked to order by
 * a property the record does not carry and the rows come back in no order at all. Jahia redirects
 * such a reference onto the translation node only for a query that already JOINs it, and
 * `nodesByCriteria` has no way to ask for that join. The translated value does reach the field -
 * the record query reads every property `language: $language` - so `fieldSorter` is the only
 * mechanism that can see the text the cell actually draws.
 *
 * The cost is that an internationalized number or date is then compared as text, which is the
 * 1, 11, 12, 2 that ordering exists to avoid. It still beats what it replaces: no order at all.
 *
 * `sortCollated` is the third mechanism, and it is the only one that can put TEXT in the order a
 * reader expects. Neither of the other two compares letters the way a language does: the repository
 * orders by the stored codepoints, and `fieldSorter` is `String.compareToIgnoreCase`, which is the
 * same comparison with the case folded. So `Etats-Unis` spelled with its accent sorts after every
 * unaccented word there is - measured against a running Jahia, ordering a French country column
 * either by the stored code or by the rendered label returns France, Singapour, Etats-Unis, and
 * there is no argument to either mechanism that asks for anything else.
 *
 * Two kinds of column need it. A CHOICELIST, because what the cell draws is a label resolved from
 * the definition and the stored value is a code - `FR` where the reader sees `France` - so ordering
 * by the property orders by something nobody can see. And any TEXT column, because that is where
 * accents and language-specific letter order decide the answer.
 *
 * The cost is paid in the table rather than here: the rows have to be in the browser before they
 * can be compared there, so a collated sort fetches a capped window instead of one page. See
 * COLLATED_SORT_CAP in ContentTypesTable.
 */
export const sortingFor = (definition, key, valueLabels) => {
    // Nothing to order a row by: a multi-valued property holds a list, not a value.
    if (definition.multiple) {
        return {};
    }

    if (definition.requiredType === 'REFERENCE' || definition.requiredType === 'WEAKREFERENCE') {
        return {sortProperty: `${key}.refNode.displayName`};
    }

    // A value list means the cell draws a label, whatever type the code behind it is stored as.
    // Text means letters, which is the other thing neither server-side mechanism orders correctly.
    if (valueLabels || definition.requiredType === 'STRING') {
        return {sortCollated: true};
    }

    if (definition.internationalized) {
        return {sortProperty: `${key}.value`};
    }

    return {sortJcrProperty: definition.name};
};

/**
 * The reader's stored choice, or the defaults where there is nothing usable.
 *
 * The shape is CHECKED rather than trusted, because `JSON.parse` throwing is only half of what can
 * go wrong: `null`, `5`, `"abc"` and `{}` are all valid JSON and none of them is a list of keys.
 * The first thing to touch the result is a `map` during render, so a wrong shape is a blank pane -
 * and one that comes back on every visit, since the bad value stays in storage and the picker
 * offering `resetToDefaults` sits behind the component that crashed.
 */
export const readStoredKeys = (storageKey, defaults) => {
    try {
        const stored = window.localStorage.getItem(storageKey);
        if (!stored) {
            return defaults;
        }

        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter(key => typeof key === 'string') : defaults;
    } catch {
        // A private window, a full quota, or syntactically broken JSON all land here. None of them
        // should stop the table showing something - they just mean today's choice starts fresh.
        return defaults;
    }
};

/**
 * Remembers a choice, and says nothing when it cannot.
 *
 * A private window or a full quota means the choice applies for this visit and is not there on the
 * next one, which beats refusing to make the change at all.
 */
export const writeStoredKeys = (storageKey, keys) => {
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(keys));
    } catch {
        // See above: not being able to remember is not a reason not to apply.
    }
};

/**
 * Forgets a choice, so that a later version starting with a different set gives it to someone who
 * never chose their own - which storing today's defaults would not.
 */
export const clearStoredKeys = storageKey => {
    try {
        window.localStorage.removeItem(storageKey);
    } catch {
        // Nothing to undo if it could not be read or written in the first place.
    }
};
