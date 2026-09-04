/**
 * What a column can be filtered on, and how that becomes something the repository understands.
 *
 * Deliberately free of React and of the registry: this is the vocabulary and the translation into a
 * constraint, nothing about where a filter is kept or how it is set. Which also means it can be
 * exercised on its own - the constraints it builds were checked against a live site that way.
 * Where filters live is useColumnFilters' business.
 */

/** The kinds of form a filter can take, which is what decides the operators on offer. */
export const FILTER_TEXT = 'text';
export const FILTER_NUMBER = 'number';
export const FILTER_DATE = 'date';
export const FILTER_BOOLEAN = 'boolean';

/**
 * A property that can only hold one of a listed set of values.
 *
 * Its own kind rather than text or number, because what it holds is a code from the definition -
 * `swimmingPool`, `house`, `AF` - and the reader is shown the label. Typing is the wrong control for
 * it: the values are known, finite, and already on the client, so they are offered as a list.
 */
export const FILTER_CHOICE = 'choice';

/**
 * Publication status, which is not a property at all.
 *
 * Its own kind because it cannot be asked of the repository. The status is computed per node and per
 * language from `j:published` and a comparison of `jcr:lastModified` against `j:lastPublished` on the
 * language's own `j:translation_<lang>` node - and a query can compare a property to a literal but
 * never to another property, which the engine rejects outright. So there is no constraint to build,
 * and this filter is applied to the records after they arrive. See matchesPublication.
 */
export const FILTER_PUBLICATION = 'publication';

/**
 * An image column, filtered on whether there is one.
 *
 * A reference stores a uuid, so asking *which* image needs a picker rather than a box - that is still
 * to come. Asking whether there is one at all needs neither: it is the presence of the property, and
 * the two operators that answer it already exist. Verified against a site, `exists` agrees exactly
 * with the data on every reference property there, splitting 3 from 5 on the one that is partly
 * filled.
 */
export const FILTER_IMAGE = 'image';

/**
 * The statuses offered, in the order a record moves through them.
 *
 * Four of the eleven Jahia can report. The rest - conflict, the mandatory-language pair, live-only,
 * deleted - are states a reader of this table cannot act on, and none occurs on a working site. A
 * record in one of them still shows its own chip; it just cannot be filtered for.
 *
 * `NOT_PUBLISHED` and `UNPUBLISHED` are kept apart because they mean different things: never
 * published at all, against published once and since withdrawn. In the data that is the difference
 * between having no `j:lastPublished` anywhere and having one with `j:published` false.
 */
export const PUBLICATION_STATUSES = [
    {value: 'PUBLISHED', labelKey: 'label.publication.published'},
    {value: 'MODIFIED', labelKey: 'label.publication.modified'},
    {value: 'UNPUBLISHED', labelKey: 'label.publication.unpublished'},
    {value: 'NOT_PUBLISHED', labelKey: 'label.publication.notPublished'}
];

/** The statuses as the form offers them. */
export const publicationOptions = t => PUBLICATION_STATUSES.map(status => ({
    value: status.value,
    label: t(status.labelKey)
}));

/**
 * The operators each kind offers, in the order they are listed.
 *
 * Every one of them is something `nodeConstraint` can express, and - unlike the sort - the comparison
 * happens against the property as what it is: checked against a site, `gt` on a number compares
 * numerically rather than comparing the text it is stored as.
 */
export const OPERATORS = {
    [FILTER_CHOICE]: ['is', 'isNot'],
    [FILTER_PUBLICATION]: ['is', 'isNot'],
    // The presence operators the other kinds already use, which need no value and so need no control.
    [FILTER_IMAGE]: ['notEmpty', 'empty'],
    [FILTER_TEXT]: ['startsWith', 'contains', 'notContains', 'equals'],
    [FILTER_NUMBER]: ['equals', 'gt', 'lt', 'notEquals'],
    [FILTER_DATE]: ['after', 'before', 'lastDays', 'empty', 'notEmpty'],
    [FILTER_BOOLEAN]: ['isTrue', 'isFalse', 'empty']
};

/**
 * The operator a fresh filter starts on, which is not simply the first one listed.
 *
 * Order is what reads best in the dropdown; the default is what a reader most often wants. For text
 * those differ - "contains" is the common case, while the list starts at "starts with" - so the two
 * are kept apart rather than one being bent to serve the other. Falls back to the first operator for
 * any kind not named here.
 */
const DEFAULT_OPERATORS = {
    [FILTER_TEXT]: 'contains'
};

export const defaultOperator = filterType => DEFAULT_OPERATORS[filterType] || (OPERATORS[filterType] || [])[0];

/** Operators that are the whole condition, with nothing for the reader to type. */
export const VALUELESS_OPERATORS = new Set(['empty', 'notEmpty', 'isTrue', 'isFalse']);

/**
 * Operators whose value is a set rather than one thing.
 *
 * Only the value list operators: what a constrained column can hold is known, so asking for several
 * of them at once costs the reader nothing and saves setting the same filter twice over.
 */
export const MULTI_VALUE_OPERATORS = new Set(['is', 'isNot']);

/**
 * A filter's value as a list, whatever shape it arrived in.
 *
 * A shared link written before these operators took a set carries a bare string, and a half-used
 * form can carry an empty one, so both are folded into the same list here rather than at every
 * point that reads a value.
 */
export const valuesOf = value => (Array.isArray(value) ? value : [value])
    .map(entry => String(entry ?? '').trim())
    .filter(Boolean);

/**
 * A value on its way into a LIKE pattern.
 *
 * `%` and `_` are the pattern's own wildcards, so a reader searching for "50%" would otherwise be
 * asking for something quite different from what they typed.
 */
const escapeLike = value => String(value).replace(/[\\%_]/g, match => `\\${match}`);

/**
 * What a reader typed, as the inside of a LIKE pattern.
 *
 * Lowercased to pair with LOWER_CASE, and escaped so their `%` means a percent sign.
 *
 * A column matched on the node name gets one more step: a space becomes a wildcard. Such a column
 * *displays* a prettified name - `highlight-numbers` is drawn as "Highlight Numbers" - so a reader
 * typing what they can see would otherwise match nothing at all, the stored name having a hyphen
 * where they typed a space. Measured on this site, 40 of the 50 listed types have no primary item and
 * so are matched this way, which makes it the common case rather than the exception.
 */
const likeFragment = (text, field) => {
    const escaped = escapeLike(text.toLowerCase());

    return field?.looseSeparators ? escaped.replace(/\s+/g, '%') : escaped;
};

/**
 * How each operator becomes a constraint, keyed by the name the form offers.
 *
 * A table rather than a switch so that adding an operator is one entry in one place, and so that the
 * form and the query cannot drift into disagreeing about which names exist.
 *
 * Two of them are worth reading twice. `contains` and `startsWith` pair LOWER_CASE with a lowercased
 * pattern: the function lowercases the stored value server-side, so an upper-case letter in the
 * pattern would never match - the same reason the search arm below the table lowercases its own. And
 * `after`/`before` compare against the ends of the named day, because a date input gives a day while
 * the repository stores a moment; that is what makes both operators include the day itself.
 */
const CONSTRAINT_BUILDERS = {
    empty: property => ({property, exists: false}),
    notEmpty: property => ({property, exists: true}),

    // Choosing from a value list. `is` needs nothing clever: measured against a site, `equals` on a
    // multi-valued property matches a node holding that value among its others, which is exactly what
    // "is" should mean - 33 of 161 estates for `options is garage`, matching the data exactly.
    //
    // Several values mean any of them, composed with `any`. One value is left as the bare comparison
    // rather than an `any` of one, which is the same question asked more plainly.
    is: (property, values) => (values.length === 1 ?
        {property, equals: values[0]} :
        {any: values.map(value => ({property, equals: value}))}),

    // `isNot` cannot use notEquals. On a multi-valued property notEquals answers neither "does not
    // hold this value" (128) nor "holds some other value" (93) but 45, which is neither - so it is
    // not usable there at all. This shape is: no value at all, or a value that is not this one. It
    // was checked against the data on four constrained properties, single and multi valued, and
    // agreed with it on every one.
    //
    // The `exists` arm inside `all` is what makes the negation reliable - a bare `none` has no base
    // set to subtract from and returns everything. See notContains above.
    isNot: (property, values) => ({
        any: [
            {property, exists: false},
            {all: [
                {property, exists: true},
                {none: values.map(value => ({property, equals: value}))}
            ]}
        ]
    }),

    isTrue: property => ({property, equals: 'true'}),
    isFalse: property => ({property, equals: 'false'}),

    contains: (property, text, field) => ({property, like: `%${likeFragment(text, field)}%`, function: 'LOWER_CASE'}),
    startsWith: (property, text, field) => ({property, like: `${likeFragment(text, field)}%`, function: 'LOWER_CASE'}),

    // The odd one out, and deliberately so. There is no `notLike`, so the only negation available for
    // a pattern is the `none` composition - and a `none` on its own is unreliable: checked against a
    // site, `none: [like]` on a property whose value contains spaces returned every record instead of
    // none of them, while the same negation on a single-word property was correct. It has no base set
    // to subtract from. Pairing it with a positive constraint gives it one, and then
    // contains + notContains adds back up to the total on every property tried, spaces or not.
    //
    // The `exists` arm is doing that job, and it also settles a question the operator would otherwise
    // leave open: a record with no value at all is not returned. "Does not contain" describes a value
    // that is there, which is also the only reading the repository will answer reliably.
    notContains: (property, text, field) => ({
        all: [
            {property, exists: true},
            {none: [{property, like: `%${likeFragment(text, field)}%`, function: 'LOWER_CASE'}]}
        ]
    }),

    equals: (property, text) => ({property, equals: text}),
    notEquals: (property, text) => ({property, notEquals: text}),

    gt: (property, text) => ({property, gt: text}),
    gte: (property, text) => ({property, gte: text}),
    lt: (property, text) => ({property, lt: text}),
    lte: (property, text) => ({property, lte: text}),

    after: (property, text) => ({property, gt: `${text}T00:00:00.000Z`}),
    before: (property, text) => ({property, lt: `${text}T23:59:59.999Z`}),

    // Purpose-built for dates, so "the last week" is one constraint rather than a date this module
    // would have to work out now and then leave hardcoded in a link somebody kept.
    lastDays: (property, text) => (Number.isFinite(Number(text)) ? {property, lastDays: Number(text)} : null)
};

/**
 * One filter as a constraint the criteria query understands.
 *
 * Returns null for anything it cannot express, which is what keeps a half-filled form - an operator
 * chosen but nothing typed yet - from narrowing the table to nothing.
 */
export const toConstraint = (field, filter) => {
    const property = field?.jcrProperty;
    const build = CONSTRAINT_BUILDERS[filter?.o];
    if (!property || !build) {
        return null;
    }

    if (MULTI_VALUE_OPERATORS.has(filter.o)) {
        const values = valuesOf(filter.v);
        return values.length > 0 ? build(property, values) : null;
    }

    const text = String(filter.v ?? '').trim();
    if (!VALUELESS_OPERATORS.has(filter.o) && text === '') {
        return null;
    }

    return build(property, text, field);
};

/**
 * Every filter as one constraint, or null when none of them says anything.
 *
 * Composed with `all`, so filters narrow rather than widen. A search, when there is one, is a
 * further arm of the same `all` - it already composes its own three ways of matching with `any`, and
 * the two compose without either having to know about the other.
 */
export const toNodeConstraint = (filters, fieldsByKey, searchConstraint) => {
    const constraints = (filters || [])
        .map(filter => toConstraint(fieldsByKey.get(filter.c), filter))
        .filter(Boolean);

    if (searchConstraint) {
        constraints.unshift(searchConstraint);
    }

    if (constraints.length === 0) {
        return null;
    }

    return constraints.length === 1 ? constraints[0] : {all: constraints};
};

/**
 * An operator in the reader's words.
 *
 * Asked for in three steps: how this kind of column words it when it holds several values, how the
 * kind words it, then a name that suits every kind. i18next takes the first key that resolves, so a
 * kind only needs an entry where it wants to differ.
 *
 * Both steps earn their place. `equals` is why the middle one exists: "is exactly" reads correctly
 * over text and "equal to" over a number, and one operator serves both. Multiplicity is why the first
 * does: `equals` on a multi-valued property matches a node holding that value *among others* -
 * measured, 33 of 161 estates for `options equals garage` - so on such a column the operator is a
 * "contains", and calling it "is" would misdescribe what it does. On a single-valued column "is" is
 * exactly right and "contains" would be the wrong word.
 */
export const operatorLabel = (t, field, operator) => {
    const kind = field?.filterType;
    const keys = [`label.filter.operator.${operator}`];

    // Only where there is a kind to name. A filter on a column the catalog no longer holds - which a
    // shared link can carry - would otherwise ask for `operator.undefined.contains`, a key that can
    // never resolve. i18next would move on to the general one and the summary would read correctly,
    // but a key nothing can answer has no business being asked for.
    if (kind) {
        keys.unshift(`label.filter.operator.${kind}.${operator}`);

        if (field.multiple) {
            keys.unshift(`label.filter.operator.${kind}Multiple.${operator}`);
        }
    }

    return t(keys);
};

/**
 * A stored value as the reader knows it.
 *
 * A constrained property keeps a code while its label belongs to the defining module's resource
 * bundle. `valueLabels` carries what Content Editor shows for the same field, in the same language.
 * Falls through to the value for anything not in the map: a property with no value list, and a code
 * that is stored but no longer offered by the definition, which would otherwise render as nothing.
 */
export const labelForValue = (field, value) => field?.valueLabels?.[value] ?? value;

/**
 * Whether a record's publication status satisfies a publication filter.
 *
 * The one filter that is answered here rather than by the repository. The status arrives with each
 * record - the table already asks for it to draw the chip - so this reads exactly what the reader
 * sees in the column, in the language the table is being read in.
 *
 * A record whose status did not come back is treated as not matching `is`, and as matching `is not`:
 * whatever it is, it is not the status that was asked for.
 */
export const matchesPublication = (filter, status) => {
    const wanted = valuesOf(filter?.v);
    if (wanted.length === 0) {
        return true;
    }

    const held = wanted.includes(status);
    return filter.o === 'isNot' ? !held : held;
};

/** The filter set on a column, if any. */
export const filterFor = (filters, columnKey) => filters.find(filter => filter.c === columnKey);

/**
 * One filter in words, for the summary above the table.
 *
 * Named by the column's own label rather than the property behind it, since the label is what the
 * reader clicked. A column that has since been hidden still has a label to give, which is the point
 * of describing filters from the whole catalog rather than from what is on screen.
 */
export const describeFilter = (filter, field, t) => {
    const column = field?.label || filter.c;
    const operator = operatorLabel(t, field, filter.o);

    if (VALUELESS_OPERATORS.has(filter.o)) {
        return `${column} · ${operator}`;
    }

    // Joined with "or" rather than a comma, because a comma leaves the reader to guess whether all of
    // them are wanted or any of them. Any of them is what the constraint asks, in both directions:
    // "contains Garage or Piscine" holds one of the two, "does not contain Garage or Piscine" holds
    // neither.
    if (MULTI_VALUE_OPERATORS.has(filter.o)) {
        const values = valuesOf(filter.v).map(value => labelForValue(field, value));
        return `${column} · ${operator} ${values.join(t('label.filter.valueSeparator'))}`;
    }

    return `${column} · ${operator} ${labelForValue(field, filter.v)}`;
};

/**
 * Characters the full text parser reads as syntax. Left in a term they change the query, and a
 * stray quote makes it invalid outright: the server answers with a RepositoryException rather
 * than an empty result.
 */
const FULLTEXT_OPERATORS = /["'()[\]^~?:\\*%]/g;

/** Words the parser reads as operators rather than as something to look for. */
const BOOLEAN_WORDS = new Set(['and', 'or', 'not']);

/**
 * A typed term as the words that will actually be searched for.
 *
 * Here rather than in the table because two places need the same answer: the table, to build the
 * query, and the toolbar, to say whether what has been typed is long enough to search at all.
 */
export const sanitiseTokens = term => String(term || '')
    .split(/\s+/)
    .map(token => token.replace(FULLTEXT_OPERATORS, '').replace(/^-+/, ''))
    .filter(token => token.length > 0 && !BOOLEAN_WORDS.has(token.toLowerCase()));

/**
 * How many characters a term must have before anything is searched for.
 *
 * Short terms are held back so they cost no query - a two-letter prefix on a real site matches most
 * of it. The cost is that typing one looks like nothing happening, which is why the toolbar says so
 * rather than leaving the table unchanged and unexplained.
 */
export const MIN_SEARCH_LENGTH = 4;

/**
 * Whether something has been typed but not yet enough of it.
 *
 * Distinct from "nothing typed": an empty box is not waiting on the reader, and saying anything
 * under it would be noise. Punctuation alone sanitises away to nothing and counts as typed-but-not-
 * enough, which is honest - it is not going to be searched for either.
 */
export const isSearchTooShort = term => {
    const typed = String(term || '').trim();
    if (typed.length === 0) {
        return false;
    }

    return sanitiseTokens(typed).join(' ').length < MIN_SEARCH_LENGTH;
};
