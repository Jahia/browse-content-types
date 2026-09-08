/**
 * Where a new record of the listed type is offered a home, and whether it may have one there.
 *
 * Free of React and of Apollo, like the other logic modules here: what is worth getting right is
 * which parent gets proposed and how the creatable types are read back, and both are pure functions
 * of values. The component that runs it is ContentTypesCreateAction.
 *
 * **Why a location is asked for at all.** This table is scoped to a type, not to a place, so nothing
 * about the view says where a new record belongs. That is unlike a task, whose home is an
 * implementation detail nobody browses and which this module therefore files by convention - see
 * `tasksPath`. A record's path is not an implementation detail: it decides which templates and areas
 * can render it, who may edit it, what publishes alongside it, and where a colleague looks for it
 * next week. Filing that silently would put the mistake somewhere nobody sees, because a record in
 * the wrong place still appears in this table - the listing is by type, so the path it landed at is
 * exactly what the view does not show.
 *
 * What the module can do is not ask blindly. The records that already exist say where this type
 * tends to live, so one of them is proposed and the editor confirms or moves it.
 */

/** A site's shared content folder - the fallback home, and where jContent puts unplaced content. */
export const siteContentsPath = siteKey => `/sites/${siteKey}/contents`;

/**
 * The parent of a path, or null when there isn't one.
 *
 * Null rather than `/` for a top-level path: the caller is choosing somewhere to create content, and
 * the repository root is never that. Returning it would offer a target that cannot accept the write.
 */
export const parentPathOf = path => {
    if (typeof path !== 'string') {
        return null;
    }

    const cut = path.lastIndexOf('/');
    if (cut <= 0) {
        return null;
    }

    return path.substring(0, cut);
};

/** How deep a path sits, used only to break a tie between two equally common parents. */
const depthOf = path => path.split('/').length;

/**
 * The parent to propose, read from where records of this type already sit.
 *
 * The most common parent wins, which is the whole point: on a site where a type is kept in one
 * folder, that folder is the answer every time, and the editor confirms rather than navigates.
 *
 * Ties are broken deterministically - shallower first, then alphabetically - so that the proposal
 * does not depend on the order the repository happened to return records in. A proposal that moved
 * between two openings of the same menu would be worse than a fixed default, because it would be
 * read as the module knowing something it does not.
 *
 * Falls back to the site's shared content folder when there is nothing to learn from: a type with no
 * records yet, or a sample whose paths are all top-level. That is a guess, and it is why the picker
 * opens on it rather than the record being created there outright.
 */
export const proposeParentPath = (paths, siteKey) => {
    const counts = new Map();

    (paths || []).forEach(path => {
        const parent = parentPathOf(path);
        if (parent) {
            counts.set(parent, (counts.get(parent) || 0) + 1);
        }
    });

    if (counts.size === 0) {
        return siteContentsPath(siteKey);
    }

    return [...counts.entries()]
        .sort(([leftPath, leftCount], [rightPath, rightCount]) =>
            rightCount - leftCount ||
            depthOf(leftPath) - depthOf(rightPath) ||
            leftPath.localeCompare(rightPath)
        )[0][0];
};

/**
 * The type names `forms.contentTypesAsTree` says may be created at the path it was asked about.
 *
 * The tree's top level is a mix of categories and types: a category carries its types as `children`,
 * while a type resolved on its own stands at the top with none. Descending one level where there are
 * children and taking the entry itself where there are not is how Content Editor reads the same
 * answer, so this module agrees with the editor it is about to open rather than inventing a second
 * reading of one API.
 *
 * An empty list is the answer that matters here: it means this type may **not** be created at that
 * path. `CE_API.create` does not say so - it branches on one type and on several, and does nothing at
 * all for none - so the caller has to know before it asks. See ContentTypesCreateAction.
 */
export const readCreatableTypeNames = data => {
    const tree = data?.forms?.contentTypesAsTree || [];

    return tree
        .flatMap(entry => (entry?.children?.length > 0 ? entry.children : [entry]))
        .map(entry => entry?.name)
        .filter(Boolean);
};
