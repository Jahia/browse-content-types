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
 * The operators each kind offers, in the order they are listed.
 *
 * Every one of them is something `nodeConstraint` can express, and - unlike the sort - the comparison
 * happens against the property as what it is: checked against a site, `gt` on a number compares
 * numerically rather than comparing the text it is stored as.
 */
export const OPERATORS = {
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
 * A value on its way into a LIKE pattern.
 *
 * `%` and `_` are the pattern's own wildcards, so a reader searching for "50%" would otherwise be
 * asking for something quite different from what they typed.
 */
const escapeLike = value => String(value).replace(/[\\%_]/g, match => `\\${match}`);

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

    isTrue: property => ({property, equals: 'true'}),
    isFalse: property => ({property, equals: 'false'}),

    contains: (property, text) => ({property, like: `%${escapeLike(text.toLowerCase())}%`, function: 'LOWER_CASE'}),
    startsWith: (property, text) => ({property, like: `${escapeLike(text.toLowerCase())}%`, function: 'LOWER_CASE'}),

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
    notContains: (property, text) => ({
        all: [
            {property, exists: true},
            {none: [{property, like: `%${escapeLike(text.toLowerCase())}%`, function: 'LOWER_CASE'}]}
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

    const text = String(filter.v ?? '').trim();
    if (!VALUELESS_OPERATORS.has(filter.o) && text === '') {
        return null;
    }

    return build(property, text);
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
 * Asked for by column kind first, falling back to a name that suits every kind. `equals` is why: "is
 * exactly" reads correctly over text and "equal to" over a number, and the same operator serves both.
 * i18next takes the first key that resolves, so a kind only needs an entry where it wants to differ.
 */
export const operatorLabel = (t, filterType, operator) => t([
    `label.filter.operator.${filterType}.${operator}`,
    `label.filter.operator.${operator}`
]);

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
    const operator = operatorLabel(t, field?.filterType, filter.o);

    return VALUELESS_OPERATORS.has(filter.o) ?
        `${column} · ${operator}` :
        `${column} · ${operator} ${filter.v}`;
};
