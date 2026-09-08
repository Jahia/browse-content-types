/**
 * Where a new record of the listed type is offered a home, and whether it may have one there.
 *
 * Free of React and of Apollo, like the other logic modules here: what is worth getting right is
 * where the picker opens and how the creatable types are read back, and both are pure functions of
 * values. The component that runs it is ContentTypesCreateAction.
 *
 * **Why a location is asked for at all.** This table is scoped to a type, not to a place, so nothing
 * about the view says where a new record belongs. That is unlike a task, whose home is an
 * implementation detail nobody browses and which this module therefore files by convention - see
 * `tasksPath`. A record's path is not an implementation detail: it decides which templates and areas
 * can render it, who may edit it, what publishes alongside it, and where a colleague looks for it
 * next week. Filing that silently would put the mistake somewhere nobody sees, because a record in
 * the wrong place still appears in this table - the listing is by type, so the path it landed at is
 * exactly what the view does not show.
 */

/**
 * Where the picker opens: the site's shared content folder.
 *
 * The one place on a site whose purpose is to hold content that is not part of a page, which is what
 * a record created from a listing of a type - rather than from a page being composed - almost always
 * is. Every site has one, and this module already leans on that in the settings panel, which reads
 * its type list from `<site>/contents`.
 *
 * Deliberately fixed, rather than inferred from where records of this type already sit. A folder
 * learned from existing records reads as the module knowing where this type belongs, and it is wrong
 * in the case that matters: a type dropped into pages would propose a page, which is not where a new
 * shared record should go and is somewhere the editor then has to navigate out of. Opening in the
 * same place every time is also something an editor can learn, where a proposal that moves with the
 * data is not.
 */
export const siteContentsPath = siteKey => `/sites/${siteKey}/contents`;

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
