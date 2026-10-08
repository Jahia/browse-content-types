/**
 * Where a new record goes, when the reader is the one deciding.
 *
 * Free of React and of Apollo, like the other logic modules here. What is worth getting right is how
 * a branch of the tree is assembled from an answer covering several branches at once, and which path
 * the creatable check is actually asked about - and both are pure functions of values.
 *
 * **Why the reader decides at all.** A record's path is not an implementation detail: it decides
 * which templates and areas can render it, who may edit it, what publishes alongside it, and where a
 * colleague looks for it next week. Filing it silently puts a mistake somewhere nobody sees, because
 * a record in the wrong place still appears in this table - the listing is by type, so the path it
 * landed at is exactly what the view does not show. That argument is `ContentTypesCreate`'s own, and
 * this is the module that acts on it.
 *
 * The convention folder has not gone anywhere. It is what the picker opens on, so the reader who
 * wants it confirms and is done - see `ContentTypesCreateAction`.
 */

/** The root of the picker: the site, so everything a site holds is reachable from it. */
export const pickerRootPath = siteKey => `/sites/${siteKey}`;

/** A node as the tree names it, falling back as far as the path so a row is never blank. */
export const locationLabel = node => node?.displayName || node?.name || node?.path || '';

/**
 * Every child the answer carried, grouped under the parent it belongs to.
 *
 * The query asks three criteria queries at once - folders, pages and content - and may ask them of
 * several parents in one go, so what comes back is three flat lists covering an unknown number of
 * branches. This is what turns that into one list per branch.
 *
 * Deduplicated by path, because the three kinds overlap: a type extending `jnt:content` that also
 * happens to match another arm would otherwise appear twice in the same branch. Sorted by label
 * rather than left in repository order, since a list somebody reads should be ordered the way they
 * read it.
 *
 * A node whose parent the answer does not name is dropped rather than filed under a guess. It can
 * only arrive from a branch nobody asked about, and putting it somewhere plausible is how a tree
 * comes to show a node in a place it does not live.
 */
export const childrenByParent = data => {
    const answered = data?.jcr || {};
    const nodes = [
        ...(answered.folders?.nodes || []),
        ...(answered.pages?.nodes || []),
        ...(answered.content?.nodes || [])
    ];

    const byParent = {};
    const seen = new Set();

    nodes.forEach(node => {
        const parentPath = node?.parent?.path;
        if (!node?.path || !parentPath || seen.has(node.path)) {
            return;
        }

        seen.add(node.path);
        byParent[parentPath] = byParent[parentPath] || [];
        byParent[parentPath].push(node);
    });

    Object.values(byParent).forEach(children => {
        children.sort((one, other) => locationLabel(one).localeCompare(locationLabel(other)));
    });

    return byParent;
};

/**
 * The branches that have to be open for a path to be visible, outermost first.
 *
 * What the picker opens on is a path somebody may never have expanded - the convention folder is
 * three levels down - so the tree is told to open the whole way to it rather than making the reader
 * find it. The path itself is NOT included: opening a node shows its children, and what is wanted is
 * for the node to be *visible*, which is its parent being open.
 *
 * Answers nothing for a path outside the root, including the root itself. Both are cases where there
 * is nothing between the two to open.
 */
export const branchesTo = (path, rootPath) => {
    if (!path || !rootPath || path === rootPath || !path.startsWith(`${rootPath}/`)) {
        return [];
    }

    const segments = path.slice(rootPath.length + 1).split('/').filter(Boolean);
    // Every ancestor from the root down to the parent, which is the last one that has to be open.
    return segments.slice(0, -1).reduce(
        (branches, segment) => [...branches, `${branches[branches.length - 1]}/${segment}`],
        [rootPath]
    );
};

/**
 * Which path to ask the creatable check about, which is not always the one that was chosen.
 *
 * **The convention folder may not exist yet.** It is created on the way in, by whoever files the
 * first record of the type - and `forms.contentTypesAsTree` answers an empty list for a path that is
 * not there, which would read as "this type cannot be created here" about the one place the module
 * was always going to put it.
 *
 * So the question is asked of the site's content folder instead, which is always there. The answer
 * is the same: both are `jnt:contentFolder`, and what decides it is the parent's child node
 * definitions, not the node. That equivalence is `ContentTypesCreateAction`'s own - verified against
 * a site, where estate, blogPost, agency and textIllustrated each answered the same at the site
 * content folder as at their own - and this is the second place that relies on it.
 *
 * Any other path is asked about directly. It was chosen out of the tree, so it exists.
 */
export const creatabilityPath = (selectedPath, {conventionPath, contentsPath}) =>
    (selectedPath && selectedPath === conventionPath ? contentsPath : selectedPath);

/**
 * Whether choosing this path means creating the folders it names on the way in.
 *
 * Only the convention folder is ever made by this module. Anywhere else in the tree was picked out
 * of nodes that already exist, so there is nothing to create and nothing to clean up if the reader
 * abandons the editor.
 */
export const needsFolders = (selectedPath, conventionPath) => Boolean(selectedPath) && selectedPath === conventionPath;
