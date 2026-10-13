import {
    aliasFor,
    clearStoredKeys,
    columnKeyFor,
    isRenderable,
    readStoredKeys,
    sortingFor,
    storageKeyFor,
    writeStoredKeys
} from './ContentTypesColumnCatalog';

const DEFAULTS = ['name', 'lastModified'];

describe('ContentTypesColumnCatalog', () => {
    describe('aliasFor / columnKeyFor', () => {
        it('keeps a name a GraphQL alias can hold', () => {
            expect(aliasFor('luxe:price')).toBe('luxe_58_price');
            expect(columnKeyFor('luxe:price')).toBe('ct_luxe_58_price');
        });

        // The reason the encoding is not a plain collapse to `_`: two names that differ only in
        // punctuation would share a key, which puts two definitions behind one checkbox and one
        // ambiguous alias in the document.
        it('does not let two property names land on one key', () => {
            expect(aliasFor('acme:sub-title')).not.toBe(aliasFor('acme:sub_title'));
            expect(columnKeyFor('acme:x.y')).not.toBe(columnKeyFor('acme:x_y'));
        });

        // The key is persisted, so it has to mean the same thing after the type gains a property.
        it('depends only on the name, not on where the property sits', () => {
            expect(columnKeyFor('luxe:price')).toBe(columnKeyFor('luxe:price'));
        });
    });

    describe('isRenderable', () => {
        it('keeps an ordinary property', () => {
            expect(isRenderable({requiredType: 'STRING'})).toBe(true);
        });

        it.each([
            ['hidden', {hidden: true, requiredType: 'STRING'}],
            ['protected', {protected: true, requiredType: 'STRING'}],
            // A large file's own bytes have no reasonable display as a table cell.
            ['binary', {requiredType: 'BINARY'}]
        ])('drops a %s property', (_label, definition) => {
            expect(isRenderable(definition)).toBe(false);
        });
    });

    describe('sortingFor', () => {
        it('orders a plain value in the repository, by the property itself', () => {
            expect(sortingFor({name: 'luxe:price', requiredType: 'DOUBLE'}, 'ct_luxe_58_price'))
                .toEqual({sortJcrProperty: 'luxe:price'});
        });

        // The repository would order by the stored uuid, which is nothing anybody can see.
        it('orders a reference by the name of what it points at', () => {
            expect(sortingFor({name: 'luxe:agency', requiredType: 'WEAKREFERENCE'}, 'ct_a'))
                .toEqual({sortProperty: 'ct_a.refNode.displayName'});
        });

        it('offers no sort for a multi-valued property, which holds a list rather than a value', () => {
            expect(sortingFor({name: 'luxe:tags', requiredType: 'STRING', multiple: true}, 'ct_a')).toEqual({});
        });
    });

    describe('storageKeyFor', () => {
        it('scopes the choice to one type on one site', () => {
            expect(storageKeyFor('luxe', 'luxe:estate')).toBe('content-types:columns:luxe:luxe:estate');
            expect(storageKeyFor('luxe', 'luxe:estate')).not.toBe(storageKeyFor('other', 'luxe:estate'));
        });
    });

    describe('readStoredKeys', () => {
        beforeEach(() => window.localStorage.clear());

        it('answers with the defaults when nothing was ever chosen', () => {
            expect(readStoredKeys('k', DEFAULTS)).toBe(DEFAULTS);
        });

        it('answers with the stored choice', () => {
            window.localStorage.setItem('k', JSON.stringify(['a', 'b']));
            expect(readStoredKeys('k', DEFAULTS)).toEqual(['a', 'b']);
        });

        // Each of these PARSES. The catch alone would let every one of them through, and the first
        // thing to touch the result is a `map` during render - so the wrong shape is a blank pane
        // that comes back on every visit.
        it.each([['null', 'null'], ['a number', '5'], ['a string', '"abc"'], ['an object', '{}']])(
            'falls back to the defaults for valid JSON that is %s',
            (_label, stored) => {
                window.localStorage.setItem('k', stored);
                expect(readStoredKeys('k', DEFAULTS)).toBe(DEFAULTS);
            }
        );

        it('falls back to the defaults for JSON that does not parse', () => {
            window.localStorage.setItem('k', '{not json');
            expect(readStoredKeys('k', DEFAULTS)).toBe(DEFAULTS);
        });

        it('drops entries that are not keys, rather than the whole choice', () => {
            window.localStorage.setItem('k', JSON.stringify(['a', 7, null, 'b']));
            expect(readStoredKeys('k', DEFAULTS)).toEqual(['a', 'b']);
        });

        it('falls back when storage cannot be read at all, the way a private window refuses', () => {
            const getItem = jest.spyOn(Storage.prototype, 'getItem')
                .mockImplementation(() => {
                    throw new Error('SecurityError');
                });

            expect(readStoredKeys('k', DEFAULTS)).toBe(DEFAULTS);
            getItem.mockRestore();
        });
    });

    describe('writeStoredKeys / clearStoredKeys', () => {
        beforeEach(() => window.localStorage.clear());

        it('remembers a choice so the next visit reads the same columns', () => {
            writeStoredKeys('k', ['a', 'b']);
            expect(readStoredKeys('k', DEFAULTS)).toEqual(['a', 'b']);
        });

        // Clearing rather than storing today's defaults, so a later version that starts with a
        // different set gives it to someone who never chose their own.
        it('forgets a choice rather than storing the defaults over it', () => {
            writeStoredKeys('k', ['a']);
            clearStoredKeys('k');
            expect(window.localStorage.getItem('k')).toBeNull();
            expect(readStoredKeys('k', DEFAULTS)).toBe(DEFAULTS);
        });

        it('applies the change even when it cannot be remembered', () => {
            const setItem = jest.spyOn(Storage.prototype, 'setItem')
                .mockImplementation(() => {
                    throw new Error('QuotaExceededError');
                });

            expect(() => writeStoredKeys('k', ['a'])).not.toThrow();
            setItem.mockRestore();
        });
    });
});
