import {
    readCreatableTypeNames,
    siteContentsPath,
    typeFolderName,
    typeFolderPath
} from './ContentTypesCreate';

/** A tree entry as `forms.contentTypesAsTree` returns one: a category with types under it. */
const category = (name, children) => ({name, children: children.map(child => ({name: child}))});

describe('siteContentsPath', () => {
    it('is the site\'s shared content folder', () => {
        expect(siteContentsPath('luxe')).toBe('/sites/luxe/contents');
    });
});

describe('typeFolderName', () => {
    // A colon in a JCR name is the namespace separator, so the type name cannot be used as it stands.
    it('replaces the colon a JCR name may not carry', () => {
        expect(typeFolderName('luxe:blogPost')).toBe('luxe_blogPost');
    });

    /*
     * The reason the prefix is kept. Dropping it reads better right up until a site holds two types
     * whose local names match, at which point their records share one folder - which is the confusion
     * a folder per type exists to remove.
     */
    it('keeps the prefix, so two types with one local name stay apart', () => {
        expect(typeFolderName('jnt:text')).not.toBe(typeFolderName('luxe:text'));
    });

    it('leaves a name that has no prefix alone', () => {
        expect(typeFolderName('text')).toBe('text');
    });

    it('has an answer for nothing at all', () => {
        expect(typeFolderName(undefined)).toBe('');
        expect(typeFolderName(null)).toBe('');
    });
});

describe('typeFolderPath', () => {
    it('puts the type\'s folder under the site\'s content folder', () => {
        expect(typeFolderPath('luxe', 'luxe:blogPost')).toBe('/sites/luxe/contents/luxe_blogPost');
    });

    it('sits directly under the content folder, one level down', () => {
        const path = typeFolderPath('luxe', 'luxe:blogPost');

        expect(path.startsWith(`${siteContentsPath('luxe')}/`)).toBe(true);
        expect(path.slice(siteContentsPath('luxe').length + 1)).not.toContain('/');
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
