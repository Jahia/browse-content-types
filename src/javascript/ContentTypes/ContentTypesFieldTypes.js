/**
 * What kind of value a column holds, and how a stored one reads to a person.
 *
 * The vocabulary every other part of the table is built on: which control an editor offers, how a
 * cell is drawn, what a CSV writes, and - while there is one - what a filter may ask. Kept apart
 * from any of those so that none of them owns it, and so that dropping one does not take the
 * vocabulary with it.
 */

/** The kinds of form a filter can take, which is what decides the operators on offer. */
export const FILTER_TEXT = 'text';
export const FILTER_NUMBER = 'number';
export const FILTER_DATE = 'date';
export const FILTER_BOOLEAN = 'boolean';

/**
 * A property that can only hold one of a listed set of values.
 *
 * Its own kind rather than text or number, because what it holds is a code from the definition -
 * `swimmingPool`, `house`, `AF` - and the reader is shown the label. Typing is the wrong control for
 * it: the values are known, finite, and already on the client, so they are offered as a list.
 */
export const FILTER_CHOICE = 'choice';

/**
 * Publication status, which is not a property at all.
 *
 * Its own kind because it cannot be asked of the repository. The status is computed per node and per
 * language from `j:published` and a comparison of `jcr:lastModified` against `j:lastPublished` on the
 * language's own `j:translation_<lang>` node - and a query can compare a property to a literal but
 * never to another property, which the engine rejects outright. So there is no constraint to build,
 * and this filter is applied to the records after they arrive. See matchesPublication.
 */
export const FILTER_PUBLICATION = 'publication';

/**
 * An image column, filtered on whether there is one.
 *
 * A reference stores a uuid, so asking *which* image needs a picker rather than a box - that is still
 * to come. Asking whether there is one at all needs neither: it is the presence of the property, and
 * the two operators that answer it already exist. Verified against a site, `exists` agrees exactly
 * with the data on every reference property there, splitting 3 from 5 on the one that is partly
 * filled.
 */
export const FILTER_IMAGE = 'image';

/** Reference types, which hold a uuid rather than anything a reader would recognise. */
const REFERENCE_TYPES = new Set(['REFERENCE', 'WEAKREFERENCE']);

/**
 * Whether a property points at images.
 *
 * A reference records what its target must be, as an expanded node type name - so an image column
 * says `{http://www.jahia.org/jahia/mix/1.0}image` while a reference to a file or to another content
 * type says something else. Matched on the local name so the namespace can move.
 *
 * References that are not to images are left unfiltered: whether one is set is a fair question of an
 * image, which a reader sees as a thumbnail or an empty cell, and a vaguer one of a reference to a
 * content item, where what is wanted is nearly always *which* one.
 */
export const isImageReference = definition => REFERENCE_TYPES.has(definition.requiredType) &&
    (definition.constraints || []).some(constraint => constraint.replace(/^\{[^}]*\}/, '').toLowerCase() === 'image');

/**
 * Why a property may be listed in the columns picker but not ticked.
 *
 * Listed rather than hidden on purpose: someone looking for a property they know the type has
 * should find it and be told why it is not on offer, rather than be left searching a list it was
 * quietly dropped from.
 *
 * Only a content type's own properties are ever blocked. The common metadata is this module's own
 * fixed catalog - every entry in it was written to be a column.
 */
export const NOT_SELECTABLE_REFERENCE = 'reference';

/**
 * Whether a property can be a column at all, and why not when it cannot.
 *
 * **A reference that is not to an image.** A reference stores a uuid, and a column of uuids says
 * nothing; what a reader wants is the thing pointed at, which means resolving each one and deciding
 * what to draw of it. An image reference is the exception the table already makes - it draws a
 * thumbnail, or an empty cell, and both are readable. The test is the same one the image filter
 * uses, so the two cannot drift into disagreeing about what an image column is.
 *
 * Returns the reason rather than a boolean so the picker can say which rule it ran into, and so a
 * second rule can be added without every caller having to change shape.
 */
export const notSelectableReasonFor = definition => {
    if (REFERENCE_TYPES.has(definition.requiredType) && !isImageReference(definition)) {
        return NOT_SELECTABLE_REFERENCE;
    }

    return undefined;
};

/**
 * The statuses offered, in the order a record moves through them.
 *
 * Four of the eleven Jahia can report. The rest - conflict, the mandatory-language pair, live-only,
 * deleted - are states a reader of this table cannot act on, and none occurs on a working site. A
 * record in one of them still shows its own chip; it just cannot be filtered for.
 *
 * `NOT_PUBLISHED` and `UNPUBLISHED` are kept apart because they mean different things: never
 * published at all, against published once and since withdrawn. In the data that is the difference
 * between having no `j:lastPublished` anywhere and having one with `j:published` false.
 */
export const PUBLICATION_STATUSES = [
    {value: 'PUBLISHED', labelKey: 'label.publication.published'},
    {value: 'MODIFIED', labelKey: 'label.publication.modified'},
    {value: 'UNPUBLISHED', labelKey: 'label.publication.unpublished'},
    {value: 'NOT_PUBLISHED', labelKey: 'label.publication.notPublished'}
];

/** The statuses as the form offers them. */
export const publicationOptions = t => PUBLICATION_STATUSES.map(status => ({
    value: status.value,
    label: t(status.labelKey)
}));

/**
 * A stored value as the reader knows it.
 *
 * A constrained property keeps a code while its label belongs to the defining module's resource
 * bundle. `valueLabels` carries what Content Editor shows for the same field, in the same language.
 * Falls through to the value for anything not in the map: a property with no value list, and a code
 * that is stored but no longer offered by the definition, which would otherwise render as nothing.
 */
export const labelForValue = (field, value) => field?.valueLabels?.[value] ?? value;
