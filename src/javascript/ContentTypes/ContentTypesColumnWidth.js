import {LANGUAGE_PROPERTY_NAMES, isLanguageField} from './ContentTypesFieldTypes';

/**
 * How wide each column of the table asks to be.
 *
 * Its own module rather than part of the table, because these are pure functions over a field
 * definition and the tests here cover logic modules rather than components: jest runs in a node
 * environment, so importing the table pulls in Moonstone and dies on `document`.
 */

/**
 * How wide a column gets when its values are short by nature.
 *
 * Measured in `ch`, the width of a digit in whatever font the table is drawn in, so this is literally
 * room for twelve characters rather than a guess in pixels that stops being right if the font
 * changes; plus the padding a Moonstone cell puts either side of its content.
 *
 * These columns keep `isScrollable`, so a value that does run longer can still be read by hovering
 * it - the narrow width is what the column asks for, not a promise about the content.
 */
const NARROW_COLUMN_WIDTH = 'calc(12ch + 32px)';

/** The width a content type's own field gets when nothing more specific is known about it. */
const DEFAULT_COLUMN_WIDTH = '220px';

/** What a field common to every node gets, none of them holding anything unbounded. */
const COMMON_COLUMN_WIDTH = '160px';

/**
 * The three common fields that do not hold one short value, and so are given a text column's width
 * and its hover-to-scroll: a path is as deep as the tree, and tags and categories are lists.
 *
 * Still all three, though the path now takes a width of its own below. What this set decides as well
 * as the width is `isScrollable` - see ContentTypesTable - and a path is the field that needs it
 * most: no width makes a path that is as deep as the tree fit, so hovering has to remain the way to
 * read the rest of it.
 */
export const WIDE_COMMON_FIELDS = new Set(['path', 'tags', 'categories']);

/**
 * The path, which is the longest thing this table draws.
 *
 * Sixty per cent over the text column the three wide fields share. That width was one size for three
 * fields with different problems: a tag list is a handful of short words and usually fits, while a
 * path is every ancestor's name joined, and the column was showing the first segment or two of
 * something whose useful end is on the right. The extra room buys roughly two more segments before
 * the scroll is needed.
 *
 * Shortened before it is drawn, which is what makes this enough rather than hopeless: the site
 * prefix is stripped, every row being in that site by construction. See the path cell in
 * ContentTypesTable.
 */
const PATH_COLUMN_WIDTH = '352px';

/**
 * Common fields holding one short thing: a user name, or a lock icon.
 *
 * They were given the same 160px as every other common field, which is about twenty characters for a
 * value that measured five at the longest on this site - `robin` - and three at the median. That is
 * width taken from the columns a reader is actually reading.
 */
const SHORT_COMMON_FIELDS = new Set(['createdBy', 'lastModifiedBy', 'publishedBy', 'lock']);

/**
 * Narrower still, for the heading that is a single short word in every language.
 *
 * The 12ch above is not what the values need - a user name measured five characters at the longest
 * here - it is what the HEADINGS needed. "Creator"/"Créateur" are seven and eight, so that column
 * can give the room back.
 *
 * **`publishedBy` is deliberately NOT in here, though "Publisher" would fit.** A column width is
 * shared by every language, and the French label is "Publié par" - ten characters. Measured at this
 * width it came out as "Publicat…", so the column keeps the wider one and only English would have
 * benefited. ("Publicateur" was tried as a one-word French heading and dropped: it is not a word
 * French Jahia uses, and at eleven characters it truncated too.)
 *
 * **`lastModifiedBy` is out for exactly the same reason, and shortening its heading did not change
 * that.** "Modified by" became "Modif. by", which would fit - but the French became "Modif. par",
 * the same ten characters as "Publié par". The abbreviation buys the English heading room it has
 * nothing to do with and leaves the French where it was, so the column keeps the wider width.
 *
 * The column keeps `isScrollable`, so a login longer than it can still be read by hovering.
 */
const ONE_WORD_COMMON_FIELDS = new Set(['createdBy']);

const ONE_WORD_COLUMN_WIDTH = 'calc(10ch + 32px)';

/** Common fields holding a date. */
const DATE_COMMON_FIELDS = new Set(['createdDate', 'lastModified', 'publishedOn']);

/**
 * What a date needs, and no more.
 *
 * `dateStyle: 'medium'` is what the cell draws - "Sep 18, 2025", "18 sept. 2025" - so fourteen
 * characters covers it in either language, with the full moment a hover away in the tooltip.
 */
const DATE_COLUMN_WIDTH = 'calc(14ch + 32px)';

/** The width a common field asks for, by what it holds rather than by being common. */
export const commonColumnWidth = key => {
    // Before the wide fields, which it is still one of: it shares their hover-to-scroll and no
    // longer shares their width.
    if (key === 'path') {
        return PATH_COLUMN_WIDTH;
    }

    if (WIDE_COMMON_FIELDS.has(key)) {
        return DEFAULT_COLUMN_WIDTH;
    }

    if (DATE_COMMON_FIELDS.has(key)) {
        return DATE_COLUMN_WIDTH;
    }

    if (ONE_WORD_COMMON_FIELDS.has(key)) {
        return ONE_WORD_COLUMN_WIDTH;
    }

    return SHORT_COMMON_FIELDS.has(key) ? NARROW_COLUMN_WIDTH : COMMON_COLUMN_WIDTH;
};

/** A figure needing twelve characters is already an unusual figure. */
const NUMERIC_TYPES = new Set(['LONG', 'DOUBLE', 'DECIMAL']);

/**
 * Properties holding a short code - a country or a language - rather than prose.
 *
 * Matched on the property's name, because being a code is not something the definition records: on
 * this site `country` holds two-letter ISO codes, and its type says only `STRING`. Deliberately a
 * short list of names rather than a loose pattern - `state` sits beside it on the same type and holds
 * place names up to 25 characters long, so anything vaguer would squeeze columns that need the room.
 *
 * The cost of the approach is that a site naming the field something else gets the default width; the
 * list is the place to add it.
 *
 * **For a country, this only ever reaches a property with no value list.** A country that offers one
 * is measured from the labels it draws instead - see columnWidthFor - which is the better measure
 * and the reason `country` itself is no longer sized from here.
 *
 * **A language is different, and is handled before either path.** It no longer draws its labels at
 * all: the cell draws the stored code in a badge, so measuring the labels would size the column for
 * text that does not appear in it. The language names are not listed here - they come from
 * `LANGUAGE_PROPERTY_NAMES`, which is also what the badges match on, so the two cannot disagree
 * about what a language column is.
 */
const CODE_PROPERTIES = new Set([
    'country',
    'countrycode',
    'country_code',
    'countryiso',
    'isocountrycode',
    ...LANGUAGE_PROPERTY_NAMES
]);

/*
 * Bounds on a value list's column: never cramped, and never given over to its longest outlier.
 *
 * The cap is below the longest label some lists hold - `country` offers a 38-character one - so those
 * few truncate and are read from the tooltip. That is the better trade in a table scanned across:
 * sizing the column for a value that appears in no row on this site would cost every other column
 * the room.
 */
const MIN_CHOICE_CH = 10;
const MAX_CHOICE_CH = 14;

/**
 * The width to ask for a content type's own field.
 *
 * A field can hold anything up to a full rich text body, so the default is generous and scrollable.
 * What this narrows are the kinds that are reliably short, where a wide column is empty space that
 * pushes everything worth reading further right.
 *
 * A value list is the one case where the longest possible value is known in advance - it is the
 * longest label the definition offers - so it is measured rather than guessed. This is also what now
 * sizes `country`: it holds two-letter codes but *shows* their names, so the old rule that gave it
 * twelve characters was reasoning from what is stored rather than from what is drawn.
 */
export const columnWidthFor = field => {
    // Before the value list, deliberately. A language column draws two- and three-letter codes in
    // badges whatever its definition offers as labels, so what the labels measure is not what the
    // column holds. Twelve characters is about three badges, and the column still scrolls on hover
    // for a record that speaks more languages than that.
    if (isLanguageField(field)) {
        return NARROW_COLUMN_WIDTH;
    }

    if (field.valueOptions?.length > 0) {
        const longest = field.valueOptions.reduce((most, option) => Math.max(most, option.label.length), 0);
        const ch = Math.min(Math.max(longest, MIN_CHOICE_CH), MAX_CHOICE_CH);

        return `calc(${ch}ch + 32px)`;
    }

    if (NUMERIC_TYPES.has(field.requiredType)) {
        return NARROW_COLUMN_WIDTH;
    }

    return CODE_PROPERTIES.has(field.propertyName?.toLowerCase()) ?
        NARROW_COLUMN_WIDTH :
        DEFAULT_COLUMN_WIDTH;
};
