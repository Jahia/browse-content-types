import {FILTER_BOOLEAN, FILTER_CHOICE, FILTER_DATE, FILTER_IMAGE, FILTER_NUMBER, FILTER_TEXT} from './ContentTypesFilters';
import {
    CELL_EDIT_DIALOG,
    CELL_EDIT_INLINE,
    CELL_LOCKED,
    CELL_NOT_EDITABLE,
    CELL_NO_PERMISSION,
    cellEditVariables,
    cellEditability,
    currentCellValue,
    editSurface,
    hasCellValueChanged,
    isLongText,
    toDateInputValue
} from './ContentTypesCellEdit';

/** A content type's own property, as useContentTypeColumns builds one. */
const own = overrides => ({
    key: 'ct_address',
    label: 'Address',
    propertyName: 'address',
    requiredType: 'STRING',
    multiple: false,
    isDynamic: true,
    filterType: FILTER_TEXT,
    ...overrides
});

/** A record as the table holds one: writable, unlocked, with a payload per column key. */
const record = overrides => ({
    path: '/sites/luxe/contents/one',
    canEdit: true,
    lockedAndCannotBeEdited: false,
    ...overrides
});

const ADDRESS = 'ct_address';

describe('ContentTypesCellEdit', () => {
    describe('editSurface', () => {
        it('puts a short text value in the cell', () => {
            expect(editSurface(own(), 'Rue de la Paix')).toBe(CELL_EDIT_INLINE);
        });

        it.each([
            ['a value list', FILTER_CHOICE],
            ['a boolean', FILTER_BOOLEAN],
            ['a date', FILTER_DATE],
            ['a number', FILTER_NUMBER]
        ])('puts %s in the cell', (_, filterType) => {
            expect(editSurface(own({filterType}), '')).toBe(CELL_EDIT_INLINE);
        });

        // Its control is a list typed one per line, which a row's height cannot hold.
        it('sends a multi-valued property to the dialog', () => {
            expect(editSurface(own({multiple: true}), [])).toBe(CELL_EDIT_DIALOG);
        });

        it('sends a long text value to the dialog', () => {
            expect(editSurface(own(), 'x'.repeat(200))).toBe(CELL_EDIT_DIALOG);
        });

        it('sends a value with a line break to the dialog, however short', () => {
            expect(editSurface(own(), 'one\ntwo')).toBe(CELL_EDIT_DIALOG);
        });

        // The same column offers either, following what the cell actually holds. Deliberate: the
        // definition does not distinguish a title from a rich text body, and the value does.
        it('follows the value rather than the column', () => {
            const field = own();
            expect(editSurface(field, 'short')).toBe(CELL_EDIT_INLINE);
            expect(editSurface(field, 'x'.repeat(200))).toBe(CELL_EDIT_DIALOG);
        });

        it('offers nothing for a column that cannot be written', () => {
            expect(editSurface({key: 'createdBy', filterType: FILTER_TEXT}, '')).toBeNull();
            expect(editSurface(own({filterType: FILTER_IMAGE}), '')).toBeNull();
            expect(editSurface(own({isDynamic: false}), '')).toBeNull();
        });
    });

    describe('cellEditability', () => {
        it('allows a writable column on an unlocked record the reader may edit', () => {
            expect(cellEditability(own(), record())).toEqual({canEdit: true, reason: null});
        });

        it('refuses a column that is not writable at all', () => {
            expect(cellEditability({key: 'path'}, record())).toEqual({canEdit: false, reason: CELL_NOT_EDITABLE});
        });

        // Only a lock that actually stands in this reader's way - their own lock does not, and the
        // record query answers that question rather than reporting the lock's existence.
        it('refuses a record locked against this reader', () => {
            expect(cellEditability(own(), record({lockedAndCannotBeEdited: true})))
                .toEqual({canEdit: false, reason: CELL_LOCKED});
        });

        it('refuses a record the reader has no write permission on', () => {
            expect(cellEditability(own(), record({canEdit: false})))
                .toEqual({canEdit: false, reason: CELL_NO_PERMISSION});
        });

        // A row cached from a page fetched before the query asked for the permission. Not knowing
        // is not the same as being allowed.
        it('refuses a record that was never asked about', () => {
            expect(cellEditability(own(), {path: '/sites/luxe/contents/one'}))
                .toEqual({canEdit: false, reason: CELL_NO_PERMISSION});
        });

        it('reports the lock before the permission, both being true of the record', () => {
            expect(cellEditability(own(), record({lockedAndCannotBeEdited: true, canEdit: false})).reason)
                .toBe(CELL_LOCKED);
        });
    });

    describe('currentCellValue', () => {
        it('reads a single value from the column\'s payload', () => {
            expect(currentCellValue(own(), record({[ADDRESS]: {value: 'Rue de la Paix'}}))).toBe('Rue de la Paix');
        });

        it('reads a list from a multi-valued column', () => {
            expect(currentCellValue(own({multiple: true}), record({[ADDRESS]: {values: ['a', 'b']}}))).toEqual(['a', 'b']);
        });

        it('answers empty for a cell holding nothing', () => {
            expect(currentCellValue(own(), record())).toBe('');
            expect(currentCellValue(own({multiple: true}), record())).toEqual([]);
        });

        // It holds one of two things, so there is no third state for a form to start on.
        it('answers false for a boolean holding nothing', () => {
            expect(currentCellValue(own({filterType: FILTER_BOOLEAN}), record())).toBe('false');
        });

        it('reads a stored boolean', () => {
            const field = own({filterType: FILTER_BOOLEAN});
            expect(currentCellValue(field, record({[ADDRESS]: {value: 'true'}}))).toBe('true');
            expect(currentCellValue(field, record({[ADDRESS]: {value: 'false'}}))).toBe('false');
        });

        /*
         * The Name column draws `displayName` and edits the primary item behind it. Those differ
         * exactly when the property is empty: `displayName` then falls back to the node's own name,
         * so an editor reading the column key would open showing `content_1754409625306` as though
         * somebody had typed it, and saving would write that into the title.
         */
        describe('a column that draws one thing and edits another', () => {
            const nameColumn = {
                key: 'displayName',
                valueKey: 'nameValue',
                propertyName: 'title',
                requiredType: 'STRING',
                multiple: false,
                isDynamic: true,
                filterType: FILTER_TEXT
            };

            it('reads the property behind the column, not the column', () => {
                expect(currentCellValue(nameColumn, record({
                    displayName: 'Villa Provence',
                    nameValue: {value: 'Villa Provence'}
                }))).toBe('Villa Provence');
            });

            it('opens empty where the property is empty, whatever the column fell back to', () => {
                expect(currentCellValue(nameColumn, record({
                    displayName: 'content_1754409625306',
                    nameValue: {value: null}
                }))).toBe('');
            });

            it('opens empty rather than on the fallback when the value was never fetched', () => {
                expect(currentCellValue(nameColumn, record({displayName: 'content_1754409625306'}))).toBe('');
            });
        });

        it('gives a date control the day out of a stored moment', () => {
            expect(currentCellValue(own({filterType: FILTER_DATE}), record({[ADDRESS]: {value: '2026-09-08T15:21:23.198+02:00'}})))
                .toBe('2026-09-08');
        });
    });

    describe('toDateInputValue', () => {
        // Taken off the front of the text rather than parsed through a Date, which would shift the
        // day across a timezone for anything stored near midnight.
        it('keeps the day a moment was stored on', () => {
            expect(toDateInputValue('2026-01-01T00:30:00.000+02:00')).toBe('2026-01-01');
        });

        it.each([null, undefined, '', 'not a date'])('answers empty for %s', value => {
            expect(toDateInputValue(value)).toBe('');
        });
    });

    describe('isLongText', () => {
        it('is false for a value a cell can hold', () => {
            expect(isLongText('Rue de la Paix')).toBe(false);
        });

        it.each([null, undefined, 42, ['a']])('is false for %s, which is not text', value => {
            expect(isLongText(value)).toBe(false);
        });
    });

    describe('hasCellValueChanged', () => {
        // Saving an unchanged value moves jcr:lastModified and the publication status with it, so a
        // record would report as edited because somebody pressed Enter in a cell.
        it('is false where nothing was changed', () => {
            expect(hasCellValueChanged('Rue de la Paix', 'Rue de la Paix')).toBe(false);
            expect(hasCellValueChanged('', '')).toBe(false);
            expect(hasCellValueChanged(['a', 'b'], ['a', 'b'])).toBe(false);
        });

        it('is true where it was', () => {
            expect(hasCellValueChanged('a', 'b')).toBe(true);
            expect(hasCellValueChanged('', 'b')).toBe(true);
            expect(hasCellValueChanged(['a'], ['a', 'b'])).toBe(true);
            expect(hasCellValueChanged(['a', 'b'], ['b', 'a'])).toBe(true);
        });

        it('treats an absent value as empty rather than as a change', () => {
            expect(hasCellValueChanged(undefined, '')).toBe(false);
            expect(hasCellValueChanged(null, '')).toBe(false);
        });
    });

    describe('cellEditVariables', () => {
        it('sends the one record as the list the mutation takes', () => {
            expect(cellEditVariables({field: own(), row: record(), value: 'Rue Neuve'})).toEqual({
                paths: ['/sites/luxe/contents/one'],
                property: 'address',
                type: 'STRING',
                value: 'Rue Neuve'
            });
        });

        // Always for a per-language property, never for one without: the definition the value has to
        // match is the per-language one, and a property that has only one needs no language to find.
        it('carries the language for a translated property', () => {
            expect(cellEditVariables({field: own({internationalized: true}), row: record(), value: 'x', language: 'fr'}))
                .toMatchObject({language: 'fr'});
        });

        it('carries no language for one that is not translated', () => {
            expect(cellEditVariables({field: own(), row: record(), value: 'x', language: 'fr'}))
                .not.toHaveProperty('language');
        });

        it('sends no value at all when the cell is being emptied', () => {
            const variables = cellEditVariables({field: own(), row: record(), isClearing: true});
            expect(variables).toEqual({paths: ['/sites/luxe/contents/one'], property: 'address'});
        });
    });
});
