import {siteRelativePath} from './ContentTypesPaths';

describe('siteRelativePath', () => {
    it('drops the site prefix, which every row in this table shares', () => {
        expect(siteRelativePath('/sites/luxe/contents/agencies/east/estate-1', 'luxe'))
            .toBe('contents/agencies/east/estate-1');
    });

    it('drops it for content living inside a page, not only under contents', () => {
        expect(siteRelativePath('/sites/luxe/home/sell/main/highlight-number', 'luxe'))
            .toBe('home/sell/main/highlight-number');
    });

    // An empty cell would read as a missing value; the site node has no path within itself.
    it('answers / for the site node itself', () => {
        expect(siteRelativePath('/sites/luxe', 'luxe')).toBe('/');
    });

    // A record can only reach this table from within the site, so this should not arise - but a
    // path the rule does not recognise is one it knows nothing about, and shortening it on a hunch
    // would be worse than leaving it whole.
    it('leaves a path outside the site alone', () => {
        expect(siteRelativePath('/sites/other/contents/a', 'luxe')).toBe('/sites/other/contents/a');
        expect(siteRelativePath('/users/jdoe', 'luxe')).toBe('/users/jdoe');
    });

    // Two sites whose names share a prefix must not be confused: /sites/luxe2 is not inside
    // /sites/luxe, which a bare startsWith on the prefix would have got wrong.
    it('does not treat a site whose name merely starts the same as a parent', () => {
        expect(siteRelativePath('/sites/luxe2/contents/a', 'luxe')).toBe('/sites/luxe2/contents/a');
    });

    it('leaves the path alone when the site is unknown', () => {
        expect(siteRelativePath('/sites/luxe/contents/a', undefined)).toBe('/sites/luxe/contents/a');
        expect(siteRelativePath('/sites/luxe/contents/a', '')).toBe('/sites/luxe/contents/a');
    });

    it('has something to render for a record with no path', () => {
        expect(siteRelativePath(undefined, 'luxe')).toBe('');
        expect(siteRelativePath(null, 'luxe')).toBe('');
    });
});
