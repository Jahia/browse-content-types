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
 * The site's shared content folder, which is what everything below hangs off.
 *
 * The one place on a site whose purpose is to hold content that is not part of a page, which is what
 * a record created from a listing of a type - rather than from a page being composed - almost always
 * is. Every site has one, and this module already leans on that in the settings panel, which reads
 * its type list from `<site>/contents`.
 */
export const siteContentsPath = siteKey => `/sites/${siteKey}/contents`;

/**
 * The folder name a type's records are kept under.
 *
 * The type name with its colon replaced, because a colon in a JCR name is the namespace separator and
 * `luxe:blogPost` as a node name would be read as a prefix that is not registered.
 *
 * The prefix is kept rather than dropped, which is the whole reason this is a function and not an
 * inline `split`. `jnt:text` and `luxe:text` both end at `text` once the prefix goes, and two
 * different types sharing one folder is precisely the confusion this layout exists to remove - the
 * same collision `countAlias` documents for its own aliases.
 */
export const typeFolderName = contentType => String(contentType || '').replace(/:/g, '_');

/**
 * Where records of one type are created: a folder of that type's own name, under the site's content
 * folder.
 *
 * **Why a folder per type, made on the way in.** Creating a record used to ask where it should go,
 * which is a question the editor cannot get wrong but also cannot skip - and asking it every time to
 * hear the same answer is the kind of ceremony that gets in the way of the actual work. Filing by the
 * type's own name needs no answer, puts the records of a type together where somebody looking for
 * them would look, and is nothing the editor is stuck with: content moves, and a record created here
 * can be moved anywhere afterwards by the ordinary means.
 *
 * This is the same bargain `tasksPath` strikes for tasks, one step further: the container is created
 * on first use rather than assumed to exist.
 */
export const typeFolderPath = (siteKey, contentType) =>
    `${siteContentsPath(siteKey)}/${typeFolderName(contentType)}`;

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
