import {
    TYPE_FOLDERS_SEGMENT,
    foldersToEnsure,
    readCreatableTypeNames,
    siteContentsPath,
    typeFolderName,
    typeFolderPath,
    typeFoldersPath
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
    it('puts the type\'s folder inside this module\'s own folder', () => {
        expect(typeFolderPath('luxe', 'luxe:blogPost'))
            .toBe('/sites/luxe/contents/content-types/luxe_blogPost');
    });

    /*
     * The point of the extra level. However many types a site holds, this module adds exactly one
     * node to the content folder it does not own, and everything else of its own goes inside that.
     */
    it('adds one node to the site content folder, whatever the type', () => {
        const added = ['luxe:blogPost', 'jnt:text', 'luxe:estate']
            .map(type => typeFolderPath('luxe', type).slice(siteContentsPath('luxe').length + 1))
            .map(rest => rest.split('/')[0]);

        expect(new Set(added)).toEqual(new Set([TYPE_FOLDERS_SEGMENT]));
    });

    it('sits directly inside that folder, one level down', () => {
        const path = typeFolderPath('luxe', 'luxe:blogPost');

        expect(path.startsWith(`${typeFoldersPath('luxe')}/`)).toBe(true);
        expect(path.slice(typeFoldersPath('luxe').length + 1)).not.toContain('/');
    });
});

describe('foldersToEnsure', () => {
    /*
     * Order is the whole contract: a child cannot be created before its parent, so the outer folder
     * has to be asked for first.
     */
    it('names both folders, outermost first', () => {
        expect(foldersToEnsure('luxe', 'luxe:blogPost').map(folder => folder.path)).toEqual([
            '/sites/luxe/contents/content-types',
            '/sites/luxe/contents/content-types/luxe_blogPost'
        ]);
    });

    // The parent and name are carried rather than derived, so the test to see whether a folder is
    // there and the call that creates it cannot disagree about where it goes.
    it('carries a parent and name that rebuild each path', () => {
        foldersToEnsure('luxe', 'luxe:blogPost').forEach(folder => {
            expect(`${folder.parentPath}/${folder.name}`).toBe(folder.path);
        });
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
