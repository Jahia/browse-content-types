import type {Filter, FilterField, FilterKind, NodeConstraint} from './filters.types';

export const FILTER_KINDS: Readonly<Record<string, FilterKind>> = Object.freeze({
    TEXT: 'text',
    NUMBER: 'number',
    DATE: 'date',
    BOOLEAN: 'boolean',
    CHOICE: 'choice',
    MEDIA: 'media'
});

/** The operators of each kind, in the order of the operator dropdown. */
export const FILTER_OPERATORS: Readonly<Record<FilterKind, readonly string[]>> = Object.freeze({
    text: ['contains', 'startsWith', 'notContains', 'equals'],
    number: ['equals', 'gt', 'lt', 'notEquals'],
    date: ['after', 'before', 'lastDays', 'empty', 'notEmpty'],
    boolean: ['isTrue', 'isFalse', 'empty'],
    choice: ['is', 'isNot'],
    media: ['notEmpty', 'empty']
});

/** The operators that need no value. */
export const VALUELESS_OPERATORS: ReadonlySet<string> = new Set(['empty', 'notEmpty', 'isTrue', 'isFalse']);

/** The operators whose value is a list of values. */
export const MULTI_VALUE_OPERATORS: ReadonlySet<string> = new Set(['is', 'isNot']);

const DAY_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The operator of a new filter of this kind. */
export const defaultOperator = (kind: FilterKind): string | undefined => FILTER_OPERATORS[kind]?.[0];

/** Whether the kind of the field offers the operator. */
export const isOperatorOf = (field: FilterField | undefined, operator: string | undefined): boolean => {
    if (!field || !operator) {
        return false;
    }

    return (FILTER_OPERATORS[field.kind] || []).includes(operator);
};

/** A filter value as a list of non-empty strings, whatever its shape: a link of the module can hold a bare string. */
export const valuesOf = (value: unknown): string[] => (Array.isArray(value) ? value : [value])
    .map(entry => (entry === null || entry === undefined ? '' : String(entry).trim()))
    .filter(Boolean);

const pad = (number: number, size = 2): string => String(Math.abs(number)).padStart(size, '0');

// The JCR date format, `2026-11-01T00:00:00.000+01:00`, with the offset of the browser on that day
const toJcrDate = (date: Date): string => {
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}` +
        `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
};

// The day is read in the time zone of the browser, and sent with its offset
const dayBound = (text: string, bound: 'start' | 'end'): string | null => {
    const match = DAY_FORMAT.exec(text);
    if (!match) {
        return null;
    }

    const [year, month, day] = match.slice(1).map(Number);
    const date = bound === 'start' ? new Date(year, month - 1, day, 0, 0, 0, 0) : new Date(year, month - 1, day, 23, 59, 59, 999);
    // A day that does not exist, such as 2026-02-30, rolls over to another one
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
    }

    return toJcrDate(date);
};

// `%` and `_` are the wildcards of LIKE, and `\` is its escape character
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, match => `\\${match}`);

// LOWER_CASE lowercases the stored value on the server, so the pattern is lowercased too.
// A field that shows a node name matches a space against any separator: `highlight-numbers` shows as "Highlight Numbers".
const likeFragment = (text: string, field: FilterField): string => {
    const escaped = escapeLike(text.toLowerCase());
    return field.looseSeparators ? escaped.replace(/\s+/g, '%') : escaped;
};

const isNumber = (text: string): boolean => text !== '' && Number.isFinite(Number(text));

const like = (property: string, pattern: string): NodeConstraint => ({property, like: pattern, function: 'LOWER_CASE'});

type SingleBuilder = (property: string, text: string, field: FilterField) => NodeConstraint | null;
type MultipleBuilder = (property: string, values: string[]) => NodeConstraint;

const SINGLE_VALUE_BUILDERS: Record<string, SingleBuilder> = {
    empty: property => ({property, exists: false}),
    notEmpty: property => ({property, exists: true}),
    isTrue: property => ({property, equals: 'true'}),
    isFalse: property => ({property, equals: 'false'}),

    contains: (property, text, field) => like(property, `%${likeFragment(text, field)}%`),
    startsWith: (property, text, field) => like(property, `${likeFragment(text, field)}%`),
    // A `none` alone has no base set, and returns every item. The first arm keeps the items with a value of at least one
    // character: a blank value shows as an empty cell, so it counts as no value, as `exists` would not
    notContains: (property, text, field) => ({
        all: [
            like(property, '_%'),
            {none: [like(property, `%${likeFragment(text, field)}%`)]}
        ]
    }),

    equals: (property, text, field) => (field.kind === 'number' && !isNumber(text) ? null : {property, equals: text}),
    notEquals: (property, text, field) => (field.kind === 'number' && !isNumber(text) ? null : {property, notEquals: text}),
    gt: (property, text) => (isNumber(text) ? {property, gt: text} : null),
    lt: (property, text) => (isNumber(text) ? {property, lt: text} : null),

    after: (property, text) => {
        const bound = dayBound(text, 'start');
        return bound ? {property, gt: bound} : null;
    },
    before: (property, text) => {
        const bound = dayBound(text, 'end');
        return bound ? {property, lt: bound} : null;
    },
    // The server computes the range with its own clock
    lastDays: (property, text) => (/^\d+$/.test(text) ? {property, lastDays: Number(text)} : null)
};

const MULTIPLE_VALUE_BUILDERS: Record<string, MultipleBuilder> = {
    is: (property, values) => (values.length === 1 ?
        {property, equals: values[0]} :
        {any: values.map(value => ({property, equals: value}))}),
    // `notEquals` gives a wrong result on a multi-valued property: this shape matches an item with no value,
    // or an item that holds none of the values
    isNot: (property, values) => ({
        any: [
            {property, exists: false},
            {
                all: [
                    {property, exists: true},
                    {none: values.map(value => ({property, equals: value}))}
                ]
            }
        ]
    })
};

/** One filter as a constraint, or null when the filter has no value or its field does not offer its operator. */
export const filterToConstraint = (field: FilterField | undefined, filter: Filter | undefined): NodeConstraint | null => {
    if (!field?.property || !filter || !isOperatorOf(field, filter.operator)) {
        return null;
    }

    const {operator, value} = filter;
    if (MULTI_VALUE_OPERATORS.has(operator)) {
        const values = valuesOf(value);
        return values.length > 0 ? MULTIPLE_VALUE_BUILDERS[operator](field.property, values) : null;
    }

    const text = Array.isArray(value) ? '' : String(value ?? '').trim();
    if (!VALUELESS_OPERATORS.has(operator) && text === '') {
        return null;
    }

    return SINGLE_VALUE_BUILDERS[operator]?.(field.property, text, field) ?? null;
};

/** Whether a filter applies: its field is in the list, the kind offers its operator, and it has a value when it needs one. */
export const isActiveFilter = (filter: Filter | undefined, fields: readonly FilterField[] | undefined): boolean => {
    const field = (fields || []).find(candidate => candidate.key === filter?.field);
    return filterToConstraint(field, filter) !== null;
};

/**
 * Turns filters into one `InputGqlJcrNodeConstraintInput`, or null when no filter applies.
 * The filters combine with `all`. The constraint of the view, such as the search terms, is the first member of the same `all`.
 * A filter on a field that is not in `fields` is ignored: the property name always comes from the field list.
 */
export const filtersToNodeConstraint = (
    filters: readonly Filter[] | undefined | null,
    fields: readonly FilterField[] | undefined | null,
    viewConstraint?: NodeConstraint | null
): NodeConstraint | null => {
    const byKey = new Map((fields || []).map(field => [field.key, field]));
    const constraints = (Array.isArray(filters) ? filters : [])
        .map(filter => filterToConstraint(byKey.get(filter?.field), filter))
        .filter((constraint): constraint is NodeConstraint => constraint !== null);

    if (viewConstraint) {
        constraints.unshift(viewConstraint);
    }

    if (constraints.length === 0) {
        return null;
    }

    return constraints.length === 1 ? constraints[0] : {all: constraints};
};

const LABEL_PREFIX = 'browse-content-types:label.filters.operator';

/**
 * The i18n keys of an operator, the most specific first: kind and cardinality, kind, operator.
 * `t` takes the first key that resolves, so `choiceMultiple.is` reads "contains".
 */
export const operatorLabelKeys = (field: FilterField | undefined, operator: string): string[] => {
    const keys = [`${LABEL_PREFIX}.${operator}`];
    if (field?.kind) {
        keys.unshift(`${LABEL_PREFIX}.${field.kind}.${operator}`);
        if (field.multiple) {
            keys.unshift(`${LABEL_PREFIX}.${field.kind}Multiple.${operator}`);
        }
    }

    return keys;
};
