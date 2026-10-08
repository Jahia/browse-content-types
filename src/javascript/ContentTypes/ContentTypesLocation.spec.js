import {branchesTo, childrenByParent, creatabilityPath, locationLabel, needsFolders, pickerRootPath} from './ContentTypesLocation';

/**
 * Where a new record goes, when the reader is the one deciding.
 *
 * Three of these carry a real decision rather than a transformation, and they are the ones worth
 * reading: which branches have to be open for a preselected path to be on screen, which path the
 * creatable check is actually asked about, and when this module creates a folder at all.
 */

const node = (path, extra = {}) => ({
    path,
    name: path.split('/').pop(),
    parent: {path: path.slice(0, path.lastIndexOf('/'))},
    ...extra
});

describe('a node as the tree names it', () => {
    it('prefers the display name, which is what an editor gave it', () => {
        expect(locationLabel({displayName: 'Marseille', name: 'agency-1', path: '/a/b'})).toBe('Marseille');
    });

    it('falls back as far as the path, so a row is never blank', () => {
        expect(locationLabel({name: 'agency-1', path: '/a/b'})).toBe('agency-1');
        expect(locationLabel({path: '/a/b'})).toBe('/a/b');
        expect(locationLabel(undefined)).toBe('');
    });
});

describe('the children of each branch', () => {
    const answer = (folders = [], pages = [], content = []) => ({
        jcr: {folders: {nodes: folders}, pages: {nodes: pages}, content: {nodes: content}}
    });

    it('files each node under the parent it reports', () => {
        const found = childrenByParent(answer(
            [node('/sites/x/contents/news')],
            [node('/sites/x/home')],
            [node('/sites/x/contents/agency-1')]
        ));

        expect(Object.keys(found).sort()).toEqual(['/sites/x', '/sites/x/contents']);
        expect(found['/sites/x/contents'].map(child => child.path))
            .toEqual(['/sites/x/contents/agency-1', '/sites/x/contents/news']);
    });

    it('merges the three kinds into one list per branch, in reading order', () => {
        // The point of the three criteria queries: a location is a folder, a page or content, and
        // the reader does not care which - they care what it is called.
        const found = childrenByParent(answer(
            [node('/s/zebra', {displayName: 'Zebra'})],
            [node('/s/apple', {displayName: 'Apple'})],
            [node('/s/mango', {displayName: 'Mango'})]
        ));

        expect(found['/s'].map(locationLabel)).toEqual(['Apple', 'Mango', 'Zebra']);
    });

    it('shows a node once even when two of the three arms match it', () => {
        // A type extending jnt:content that another arm also matches would otherwise be two rows
        // for one node.
        const both = node('/s/agency-1');
        const found = childrenByParent(answer([], [], [both, both]));

        expect(found['/s']).toHaveLength(1);
    });

    it('drops a node whose parent the answer does not name', () => {
        // It can only come from a branch nobody asked about, and filing it under a guess is how a
        // tree comes to show a node somewhere it does not live.
        const found = childrenByParent(answer([{path: '/s/orphan', name: 'orphan'}]));

        expect(found).toEqual({});
    });

    it('answers nothing for an empty or missing response', () => {
        expect(childrenByParent(undefined)).toEqual({});
        expect(childrenByParent({jcr: {}})).toEqual({});
    });
});

describe('the branches that have to be open', () => {
    const root = pickerRootPath('luxe');

    it('names every ancestor from the root down to the parent', () => {
        // Deliberately not the path itself: opening a node shows its CHILDREN, and what is wanted
        // is for the node to be visible, which is its parent being open.
        expect(branchesTo('/sites/luxe/contents/content-types/luxe_blogPost', root))
            .toEqual(['/sites/luxe', '/sites/luxe/contents', '/sites/luxe/contents/content-types']);
    });

    it('names only the root for a child of the root', () => {
        expect(branchesTo('/sites/luxe/contents', root)).toEqual(['/sites/luxe']);
    });

    it('has nothing to open for the root itself, or for nothing at all', () => {
        expect(branchesTo(root, root)).toEqual([]);
        expect(branchesTo(null, root)).toEqual([]);
        expect(branchesTo(undefined, undefined)).toEqual([]);
    });

    it('refuses a path outside the root rather than opening its way towards one', () => {
        // A sibling site, and the near miss that a prefix test alone would let through.
        expect(branchesTo('/sites/other/contents', root)).toEqual([]);
        expect(branchesTo('/sites/luxe-archive/contents', root)).toEqual([]);
    });
});

describe('which path the creatable check is asked about', () => {
    const conventionPath = '/sites/luxe/contents/content-types/luxe_blogPost';
    const contentsPath = '/sites/luxe/contents';
    const where = selected => creatabilityPath(selected, {conventionPath, contentsPath});

    it('asks about the site content folder for the convention folder', () => {
        // Which may not exist yet - it is created on the way in - and contentTypesAsTree answers an
        // empty list for a path that is not there. That would read as "this type cannot be created
        // here" about the one place the module was always going to use.
        expect(where(conventionPath)).toBe(contentsPath);
    });

    it('asks about anywhere else directly', () => {
        // It was chosen out of the tree, so it exists.
        expect(where('/sites/luxe/contents/agency-1')).toBe('/sites/luxe/contents/agency-1');
        expect(where(contentsPath)).toBe(contentsPath);
    });

    it('has nothing to ask about with nothing selected', () => {
        expect(where(null)).toBeNull();
        expect(where(undefined)).toBeUndefined();
    });
});

describe('when a folder is created at all', () => {
    const conventionPath = '/sites/luxe/contents/content-types/luxe_blogPost';

    it('creates only for the convention folder', () => {
        expect(needsFolders(conventionPath, conventionPath)).toBe(true);
    });

    it('creates nothing for a location picked out of the tree', () => {
        // Those already exist, so there is nothing to make - and nothing left behind by a reader
        // who abandons the editor.
        expect(needsFolders('/sites/luxe/contents/agency-1', conventionPath)).toBe(false);
        expect(needsFolders(null, conventionPath)).toBe(false);
    });

    it('creates nothing for a type that has no convention folder', () => {
        // A type a content folder will not hold opens the picker with nothing selected.
        expect(needsFolders('/sites/luxe/contents/agency-1', null)).toBe(false);
    });
});
