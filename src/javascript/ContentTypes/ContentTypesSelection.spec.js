import {BULK_SELECTION_FROM, hidesRowActions, isBulkSelection} from './ContentTypesSelection';

/** Rows as the table holds them: whole records, not just their paths. */
const rows = count => Array.from({length: count}, (_, index) => ({path: `/sites/luxe/contents/${index}`}));

describe('isBulkSelection', () => {
    it('is false with nothing ticked', () => {
        expect(isBulkSelection([])).toBe(false);
    });

    // As in jContent's own list: a single ticked row is already a selection.
    it('is true from one row up', () => {
        expect(isBulkSelection(rows(1))).toBe(true);
        expect(isBulkSelection(rows(2))).toBe(true);
        expect(isBulkSelection(rows(25))).toBe(true);
    });

    // The table clears its selection on a language change and rebuilds it from the rows on screen,
    // so both of these reach here in practice.
    it.each([
        ['null', null],
        ['undefined', undefined]
    ])('is false for a %s selection rather than throwing', (_, selection) => {
        expect(isBulkSelection(selection)).toBe(false);
    });

    it('reads the threshold from the constant, so the two cannot disagree', () => {
        expect(isBulkSelection(rows(BULK_SELECTION_FROM))).toBe(true);
        expect(isBulkSelection(rows(BULK_SELECTION_FROM - 1))).toBe(false);
    });
});

describe('hidesRowActions', () => {
    it('keeps the row menus while nothing or one row is ticked', () => {
        expect(hidesRowActions([])).toBe(false);
        expect(hidesRowActions(rows(1))).toBe(false);
    });

    it('hides them from two rows up', () => {
        expect(hidesRowActions(rows(2))).toBe(true);
    });
});
