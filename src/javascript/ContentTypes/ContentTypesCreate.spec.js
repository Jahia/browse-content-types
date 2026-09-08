import {
    parentPathOf,
    proposeParentPath,
    readCreatableTypeNames,
    siteContentsPath
} from './ContentTypesCreate';

/** A tree entry as `forms.contentTypesAsTree` returns one: a category with types under it. */
const category = (name, children) => ({name, children: children.map(child => ({name: child}))});

describe('parentPathOf', () => {
    it('gives the containing folder', () => {
        expect(parentPathOf('/sites/luxe/contents/posts/first')).toBe('/sites/luxe/contents/posts');
    });

    // The caller is choosing somewhere to create content, and the root is never that.
    it('refuses the root for a top level path', () => {
        expect(parentPathOf('/sites')).toBeNull();
    });

    it('has no answer for what is not a path', () => {
        expect(parentPathOf(undefined)).toBeNull();
        expect(parentPathOf('')).toBeNull();
        expect(parentPathOf('posts')).toBeNull();
    });
});

describe('proposeParentPath', () => {
    it('proposes where most records of the type already sit', () => {
        const paths = [
            '/sites/luxe/contents/posts/a',
            '/sites/luxe/contents/posts/b',
            '/sites/luxe/home/area/c'
        ];

        expect(proposeParentPath(paths, 'luxe')).toBe('/sites/luxe/contents/posts');
    });

    // The whole point of the proposal: a type kept in one folder answers with that folder, so the
    // editor confirms rather than navigates.
    it('proposes the only folder when there is only one', () => {
        expect(proposeParentPath(['/sites/luxe/contents/posts/a'], 'luxe'))
            .toBe('/sites/luxe/contents/posts');
    });

    /*
     * The tie-break is the reason this is worth a test: the repository does not promise an order,
     * so without one the proposal could differ between two openings of the same menu - which reads
     * as the module knowing something it does not.
     */
    it('breaks a tie the same way every time, whatever order the records arrive in', () => {
        const paths = ['/sites/luxe/contents/a', '/sites/luxe/home/area/b'];

        expect(proposeParentPath(paths, 'luxe')).toBe('/sites/luxe/contents');
        expect(proposeParentPath([...paths].reverse(), 'luxe')).toBe('/sites/luxe/contents');
    });

    it('falls back to the shared content folder for a type with no records', () => {
        expect(proposeParentPath([], 'luxe')).toBe(siteContentsPath('luxe'));
        expect(proposeParentPath(undefined, 'luxe')).toBe(siteContentsPath('luxe'));
    });

    // Every path top level means nothing to learn, which is the fallback's case and not a crash.
    it('falls back when no path has a usable parent', () => {
        expect(proposeParentPath(['/sites'], 'luxe')).toBe(siteContentsPath('luxe'));
    });
});

describe('readCreatableTypeNames', () => {
    it('descends into a category to reach the types', () => {
        const data = {forms: {contentTypesAsTree: [category('Basic', ['jnt:text', 'jnt:bigText'])]}};

        expect(readCreatableTypeNames(data)).toEqual(['jnt:text', 'jnt:bigText']);
    });

    it('takes an entry that stands on its own', () => {
        const data = {forms: {contentTypesAsTree: [{name: 'luxe:blogPost', children: []}]}};

        expect(readCreatableTypeNames(data)).toEqual(['luxe:blogPost']);
    });

    /*
     * The answer the caller actually acts on. An empty tree means the type may not be created at the
     * path that was asked about - and since CE_API.create does nothing at all in that case, this is
     * what stands between the editor and a button that appears to be broken.
     */
    it('is empty when nothing may be created there', () => {
        expect(readCreatableTypeNames({forms: {contentTypesAsTree: []}})).toEqual([]);
    });

    it('is empty rather than throwing when the query answered nothing', () => {
        expect(readCreatableTypeNames(undefined)).toEqual([]);
        expect(readCreatableTypeNames({})).toEqual([]);
    });
});
