// `useContentTypeColumns` reaches ContentTypes.register for one constant, and that file pulls in
// the route and with it `@jahia/jcontent` - a module-federation remote that exists only inside a
// running jContent. Mocked virtually so the two rules below can be tested as the plain decisions
// they are, without standing a whole application up.
jest.mock('@jahia/jcontent', () => ({}), {virtual: true});

import {TEXT_SEARCH_TYPES, isTypeOwnProperty} from './useContentTypeColumns';

/**
 * The two rules that decide what a type offers, both of which were wrong against a real site.
 *
 * Kept here as data rather than as a rendered hook: each is a pure decision over a property
 * definition, and the defects they caused were decisions, not rendering.
 */
describe('which properties a substring search runs against', () => {
    it('searches the text types', () => {
        expect(TEXT_SEARCH_TYPES.has('STRING')).toBe(true);
        expect(TEXT_SEARCH_TYPES.has('NAME')).toBe(true);
        expect(TEXT_SEARCH_TYPES.has('PATH')).toBe(true);
    });

    /*
     * A `LIKE '%fragment%'` arm against a URI property is coerced to a URI before it is compared,
     * and `%` opens a percent-escape there rather than matching anything. The repository answers
     * `ValueFormatException: Malformed escape pair at index 0` and the whole listing fails, not
     * just that arm - so any type carrying a URI property could not be searched at all. See #7.
     */
    it('never searches a URI property, whatever the value', () => {
        expect(TEXT_SEARCH_TYPES.has('URI')).toBe(false);
    });

    it('leaves the types a reader would not search by fragment', () => {
        ['DOUBLE', 'LONG', 'DATE', 'BOOLEAN', 'BINARY', 'REFERENCE', 'WEAKREFERENCE', 'DECIMAL']
            .forEach(type => expect(TEXT_SEARCH_TYPES.has(type)).toBe(false));
    });
});

describe('which properties count as the type’s own', () => {
    /*
     * Not "declared by the selected type". jnt:location declares nothing itself and takes its seven
     * real fields from jmix:locationAware and jmix:geotagged, which left its columns picker with no
     * type-specific section at all. See #8.
     */
    it('keeps a property a mixin declares', () => {
        ['j:street', 'j:zipCode', 'j:town', 'j:country', 'j:geocodeAutomatically', 'j:latitude', 'j:longitude']
            .forEach(name => expect(isTypeOwnProperty({name})).toBe(true));
    });

    it('keeps a property the type declares itself', () => {
        expect(isTypeOwnProperty({name: 'bctnt:price'})).toBe(true);
        expect(isTypeOwnProperty({name: 'firstname'})).toBe(true);
    });

    // These are every node's, not this type's: jcr:title is already the Name column, and the rest
    // of the JCR metadata is either in COMMON_FIELDS or protected and filtered before this runs.
    it('drops the JCR-standard properties every node carries', () => {
        ['jcr:title', 'jcr:description', 'jcr:created', 'jcr:lastModified']
            .forEach(name => expect(isTypeOwnProperty({name})).toBe(false));
    });

    it('does not fail on a definition with no name', () => {
        expect(isTypeOwnProperty({})).toBe(true);
    });
});
