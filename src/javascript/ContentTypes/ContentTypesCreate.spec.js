import {readCreatableTypeNames, siteContentsPath} from './ContentTypesCreate';

/** A tree entry as `forms.contentTypesAsTree` returns one: a category with types under it. */
const category = (name, children) => ({name, children: children.map(child => ({name: child}))});

describe('siteContentsPath', () => {
    it('is the site\'s shared content folder', () => {
        expect(siteContentsPath('luxe')).toBe('/sites/luxe/contents');
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

    it('reads every category, not only the first', () => {
        const data = {
            forms: {
                contentTypesAsTree: [
                    category('Basic', ['jnt:text']),
                    category('Media', ['jnt:file'])
                ]
            }
        };

        expect(readCreatableTypeNames(data)).toEqual(['jnt:text', 'jnt:file']);
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

    // A tree entry with neither children nor a name of its own contributes nothing rather than an
    // undefined that the caller would then compare against the type it wants.
    it('drops an entry that names nothing', () => {
        const data = {forms: {contentTypesAsTree: [{children: []}, {name: 'jnt:text', children: []}]}};

        expect(readCreatableTypeNames(data)).toEqual(['jnt:text']);
    });
});
