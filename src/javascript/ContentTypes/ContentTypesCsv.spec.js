import {translationAlias} from './ContentTypesTranslations';
import {
    UTF8_BOM,
    buildRecordsCsv,
    csvContextFor,
    csvValue,
    toCsv
} from './ContentTypesCsv';

/**
 * A `t` that answers with the key it was given, so an assertion names the key rather than whatever
 * English happens to be in the bundle - the test then keeps holding when the wording changes, and
 * fails when the key does, which is the thing worth being told about.
 */
const t = key => key;
const context = csvContextFor(t);

/** A row as ContentTypesRecordQuery returns one, with only the parts a case actually reads. */
const node = overrides => ({path: '/sites/luxe/contents/a', name: 'a', displayName: 'A', ...overrides});

/**
 * A content type's own property, and the key the record query aliases it to.
 *
 * Held in a constant and used as a computed key below: `ct_options` is the shape
 * useContentTypeColumns builds - `ct_` plus the property name - and writing it as a bare property
 * name would put a deliberately non-camel-case identifier in front of the linter on every row.
 */
const OPTIONS = 'ct_options';

const field = overrides => ({key: OPTIONS, label: 'Options', isDynamic: true, ...overrides});

describe('ContentTypesCsv', () => {
    describe('toCsv', () => {
        it('leaves a plain value unquoted', () => {
            expect(toCsv([['one', 'two']])).toBe('one,two');
        });

        it('separates rows with CRLF, which is what RFC 4180 asks for', () => {
            expect(toCsv([['a'], ['b']])).toBe('a\r\nb');
        });

        it('quotes a value holding the separator, so a list stays one cell', () => {
            expect(toCsv([['Garage, Piscine']])).toBe('"Garage, Piscine"');
        });

        it('doubles a quote inside a quoted value', () => {
            expect(toCsv([['He said "no"']])).toBe('"He said ""no"""');
        });

        it('quotes a value holding a line break', () => {
            expect(toCsv([['line one\nline two']])).toBe('"line one\nline two"');
        });

        it('writes nothing for null and undefined rather than the words', () => {
            expect(toCsv([[null, undefined]])).toBe(',');
        });

        // CSV injection: Excel and Sheets evaluate a cell opening with any of these, and this is
        // content somebody typed into a form. The quote is the prefix both strip on display.
        it.each(['=1+1', '+1', '-1', '@SUM(A1)'])('defuses %s, which a spreadsheet would evaluate', value => {
            expect(toCsv([[value]])).toBe(`'${value}`);
        });

        it('quotes a defused value that also holds a separator', () => {
            expect(toCsv([['=a,b']])).toBe('"\'=a,b"');
        });

        it('leaves a negative number alone once it is not the first character', () => {
            expect(toCsv([['x-1']])).toBe('x-1');
        });
    });

    describe('csvValue, on the fields every node carries', () => {
        it('reads the content type by its display name', () => {
            const row = node({primaryNodeType: {name: 'luxe:estate', displayName: 'Estate'}});
            expect(csvValue({key: 'type'}, row, context)).toBe('Estate');
        });

        it('falls back to the system name where a type has no display name', () => {
            const row = node({primaryNodeType: {name: 'luxe:estate'}});
            expect(csvValue({key: 'type'}, row, context)).toBe('luxe:estate');
        });

        // The table writes "-" so the eye has something to land on. A spreadsheet shows an empty
        // cell perfectly well, and a literal dash there sorts, breaks a sum and defeats "is empty".
        it('writes nothing, not a dash, for a value the record does not have', () => {
            expect(csvValue({key: 'createdBy'}, node(), context)).toBe('');
        });

        // The stored value is already ISO 8601; the localised form on screen is unsortable and
        // ambiguous across locales, so this is the one place the CSV departs from the cell.
        it('keeps a date as the ISO timestamp rather than the localised form', () => {
            const row = node({createdDate: {value: '2026-09-01T14:22:11.000Z'}});
            expect(csvValue({key: 'createdDate'}, row, context)).toBe('2026-09-01T14:22:11.000Z');
        });

        it('names a publication status rather than exporting its code', () => {
            const row = node({aggregatedPublicationInfo: {publicationStatus: 'PUBLISHED'}});
            expect(csvValue({key: 'publicationStatus'}, row, context)).toBe('label.publication.published');
        });

        // The four named ones are the four the filter offers; the other seven Jahia can report keep
        // their own text, exactly as the table's neutral chip shows them.
        it('keeps an unnamed status as its own words', () => {
            const row = node({aggregatedPublicationInfo: {publicationStatus: 'CONFLICT_IN_LIVE'}});
            expect(csvValue({key: 'publicationStatus'}, row, context)).toBe('conflict in live');
        });

        it('writes nothing where a record has no publication status at all', () => {
            expect(csvValue({key: 'publicationStatus'}, node(), context)).toBe('');
        });

        it('joins tags into one cell', () => {
            const row = node({tags: {values: ['sea', 'view']}});
            expect(csvValue({key: 'tags'}, row, context)).toBe('sea, view');
        });

        it('deduplicates a list, as the chips do', () => {
            const row = node({tags: {values: ['sea', 'sea', 'view']}});
            expect(csvValue({key: 'tags'}, row, context)).toBe('sea, view');
        });

        it('resolves categories to their names rather than their uuids', () => {
            const row = node({categories: {refNodes: [{displayName: 'Luxury'}, {displayName: 'Sea'}]}});
            expect(csvValue({key: 'categories'}, row, context)).toBe('Luxury, Sea');
        });

        // Colour is the one thing a CSV cannot carry, so whether the lock blocks this reader is lost
        // either way; who holds it is the part that carries information.
        it('reports who holds a lock', () => {
            const row = node({lockInfo: {details: [{owner: 'jdoe', type: 'engine'}, {owner: 'jdoe', type: 'validation'}]}});
            expect(csvValue({key: 'lock'}, row, context)).toBe('jdoe');
        });

        it('writes nothing for an unlocked record', () => {
            expect(csvValue({key: 'lock'}, node({lockInfo: {details: []}}), context)).toBe('');
        });

        it('reads path, system name and id straight off the row', () => {
            const row = node({uuid: 'abc-123'});
            expect(csvValue({key: 'path'}, row, context)).toBe('/sites/luxe/contents/a');
            expect(csvValue({key: 'systemName'}, row, context)).toBe('a');
            expect(csvValue({key: 'id'}, row, context)).toBe('abc-123');
        });

        // A filter can name a column the catalog no longer holds, and a stale saved column set can
        // do the same; neither should throw on the way into a file.
        it('writes nothing for a field it does not recognise', () => {
            expect(csvValue({key: 'somethingElse'}, node(), context)).toBe('');
        });
    });

    describe('csvValue, on a content type\'s own properties', () => {
        it('reads a single value', () => {
            const row = node({[OPTIONS]: {value: 'garage'}});
            expect(csvValue(field(), row, context)).toBe('garage');
        });

        // The repository stores a code while the label belongs to the defining module's bundle -
        // the same lookup the cell and the filter summary use.
        it('gives a constrained value the label the reader knows it by', () => {
            const row = node({[OPTIONS]: {value: 'swimmingPool'}});
            const constrained = field({valueLabels: {swimmingPool: 'Swimming pool'}});
            expect(csvValue(constrained, row, context)).toBe('Swimming pool');
        });

        it('joins a multi-valued property, labels and all', () => {
            const row = node({[OPTIONS]: {values: ['garage', 'swimmingPool']}});
            const constrained = field({multiple: true, valueLabels: {swimmingPool: 'Swimming pool'}});
            expect(csvValue(constrained, row, context)).toBe('garage, Swimming pool');
        });

        it('names a boolean rather than exporting the string it is stored as', () => {
            const row = node({[OPTIONS]: {value: 'true'}});
            expect(csvValue(field({requiredType: 'BOOLEAN'}), row, context)).toBe('label.boolean.true');
        });

        // A multi-valued boolean never reaches the single-value case, which is how the table's own
        // renderer once let one through as the raw string.
        it('names each boolean of a multi-valued one', () => {
            const row = node({[OPTIONS]: {values: ['true', 'false']}});
            const boolField = field({multiple: true, requiredType: 'BOOLEAN'});
            expect(csvValue(boolField, row, context)).toBe('label.boolean.true, label.boolean.false');
        });

        // The uuid it actually stores is an export nobody could join anything to by hand; the Path
        // and ID columns are there for when an identifier is what is wanted.
        it('resolves a reference to the name of the node it points at', () => {
            const row = node({[OPTIONS]: {refNode: {displayName: 'Villa Bleue'}}});
            expect(csvValue(field(), row, context)).toBe('Villa Bleue');
        });

        it('resolves a multi-valued reference to the names of its targets', () => {
            const row = node({[OPTIONS]: {refNodes: [{displayName: 'One'}, {displayName: 'Two'}]}});
            expect(csvValue(field({multiple: true}), row, context)).toBe('One, Two');
        });

        it('writes nothing for a property the record does not carry', () => {
            expect(csvValue(field(), node(), context)).toBe('');
        });

        it('writes nothing for a property that is there and unset', () => {
            expect(csvValue(field(), node({[OPTIONS]: {value: null}}), context)).toBe('');
        });
    });

    describe('buildRecordsCsv', () => {
        const withLabels = [{key: 'path', label: 'Path'}, {key: 'type', label: 'Content Type'}];

        it('writes the Name column first, then the visible ones in order', () => {
            const rows = [node({primaryNodeType: {displayName: 'Estate'}})];
            const csv = buildRecordsCsv({nodes: rows, fields: withLabels, nameLabel: 'Name', context});

            expect(csv.split('\r\n')[0]).toBe(`${UTF8_BOM}Name,Path,Content Type`);
            expect(csv.split('\r\n')[1]).toBe('A,/sites/luxe/contents/a,Estate');
        });

        // Excel decodes a .csv in the machine's ANSI codepage without it, which turns every accented
        // character into mojibake - and these sites are largely French.
        it('opens with the byte order mark, so Excel reads it as UTF-8', () => {
            const csv = buildRecordsCsv({nodes: [node()], fields: [], nameLabel: 'Name', context});
            expect(csv.startsWith(UTF8_BOM)).toBe(true);
        });

        it('ends with a newline, so the last row is a row like any other', () => {
            const csv = buildRecordsCsv({nodes: [node()], fields: [], nameLabel: 'Name', context});
            expect(csv.endsWith('\r\n')).toBe(true);
        });

        it('falls back to the system name for a record with no display name', () => {
            const csv = buildRecordsCsv({nodes: [node({displayName: null})], fields: [], nameLabel: 'Name', context});
            expect(csv.split('\r\n')[1]).toBe('a');
        });

        it('writes a header and nothing else when nothing is selected', () => {
            const csv = buildRecordsCsv({nodes: [], fields: withLabels, nameLabel: 'Name', context});
            expect(csv).toBe(`${UTF8_BOM}Name,Path,Content Type\r\n`);
        });

        it('writes one line per selected row', () => {
            const rows = [node({path: '/a'}), node({path: '/b'}), node({path: '/c'})];
            const csv = buildRecordsCsv({nodes: rows, fields: withLabels, nameLabel: 'Name', context});
            expect(csv.trimEnd().split('\r\n')).toHaveLength(4);
        });
    });

    describe('the missing-translations column', () => {
        const props = [{name: 'jcr:title', label: 'Title'}, {name: 'subtitle', label: 'Subtitle'}];
        // Keys built from translationAlias rather than written out, so the fixture cannot drift
        // from the aliases the record query actually uses.
        const subnode = values => ({properties: values.map(([name, value]) => ({name, value}))});
        const row = {
            [translationAlias('en')]: subnode([['jcr:title', 'Mykonos'], ['subtitle', 'Greek']]),
            [translationAlias('fr')]: subnode([['jcr:title', 'Mykonos']])
        };
        const field = {key: 'missingTranslations'};
        const context = {languages: ['en', 'fr'], translatableFields: props};

        // Labels, like the rest of the CSV - the JSON export writes the stored names instead.
        it('writes the gaps as one cell, by label', () => {
            expect(csvValue(field, row, context)).toBe('fr: Subtitle');
        });

        it('writes nothing for a complete record', () => {
            const shared = row[translationAlias('en')];
            const complete = {[translationAlias('en')]: shared, [translationAlias('fr')]: shared};
            expect(csvValue(field, complete, context)).toBe('');
        });

        it('separates several languages', () => {
            const three = {
                [translationAlias('en')]: subnode([['jcr:title', 'a'], ['subtitle', 'b']]),
                [translationAlias('fr')]: subnode([['jcr:title', 'a']]),
                [translationAlias('de')]: subnode([['subtitle', 'b']])
            };
            expect(csvValue(field, three, {languages: ['en', 'fr', 'de'], translatableFields: props}))
                .toBe('fr: Subtitle; de: Title');
        });
    });
});
