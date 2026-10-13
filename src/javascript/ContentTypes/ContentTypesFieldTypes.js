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
 * A media column, filtered on whether there is one.
 *
 * A reference stores a uuid, so asking *which* file needs a picker rather than a box - that is still
 * to come. Asking whether there is one at all needs neither: it is the presence of the property, and
 * the two operators that answer it already exist. Verified against a site, `exists` agrees exactly
 * with the data on every reference property there, splitting 3 from 5 on the one that is partly
 * filled.
 *
 * Named for the image it was built for and left that way: the string is the filter's identity, read
 * by the control that draws it, and renaming it would be a rename of the vocabulary rather than a
 * change to what it means. What widened is which properties get it - see isMediaReference.
 */
export const FILTER_IMAGE = 'image';

/** Reference types, which hold a uuid rather than anything a reader would recognise. */
const REFERENCE_TYPES = new Set(['REFERENCE', 'WEAKREFERENCE']);

/**
 * A node type constraint reduced to its local name, in either form Jahia may answer with.
 *
 * `constraints` usually comes back expanded - `{http://www.jahia.org/jahia/mix/1.0}image` - but the
 * prefixed form `jmix:image` is what the CND was written with and is not guaranteed to be expanded
 * on the way out. Both are stripped, because which one arrives is not something this module should
 * depend on: it was depending on it, and an image column that answered the prefixed form was
 * silently unselectable.
 *
 * The two strips are ordered and cannot collide. An expanded name loses its `{...}` and has no colon
 * left for the second to find; a prefixed one is untouched by the first.
 */
const constraintLocalName = constraint => String(constraint || '')
    .replace(/^\{[^}]*\}/, '')
    .replace(/^[^:\s]+:/, '')
    .toLowerCase();

/**
 * The kinds of thing a reference may point at and still make a readable column.
 *
 * Matched as a part of the constraint's local name rather than as the whole of it, because a site's
 * media fields are not all constrained to the plain types: an animated portrait is constrained to
 * whatever type carries the animation, and `jmix:animatedImage` or `jnt:videoFile` is as much a
 * media column as `jmix:image` is.
 *
 * **This started as `image` alone and that was too narrow twice over.** On a real site, estate and
 * textIllustrated were selectable while a realtor's animated portrait was not - offered in the
 * columns picker and refused, with a message about identifiers describing something it would never
 * have drawn. A field whose target may be a GIF or an MP4 is not less readable than one whose target
 * is a JPEG; it is the same cell, drawn the same way.
 */
const MEDIA_CONSTRAINT_PARTS = ['image', 'video', 'audio', 'file'];

/**
 * Whether a property points at media rather than at a content item.
 *
 * **Media is the line, not images.** What the table draws for a reference does not consult the
 * constraint at all: it resolves the target and draws a thumbnail where there is one, a link where
 * the target is a link, and the target's display name otherwise - so a video reads as its file name
 * and an image as a picture, and both are something a reader can use. What stays blocked is a
 * reference to a content item, where the display name is rarely the question - what is wanted is
 * nearly always *which* one, and that needs a picker this table does not have.
 *
 * The cost is a reference to something merely named like media - an `imageGallery` content type,
 * say - being treated as media. That reads as the gallery's name, which is no worse than what a
 * content reference would have drawn, and far cheaper than the other mistake: refusing a column
 * somebody wants and explaining it with a reason that is not true.
 *
 * **A field declaring no constraint at all is still blocked**, there being nothing to read. If the
 * animated portrait turns out to be one of those, this is the line that has to change again - and
 * the answer then is to stop blocking references altogether, not to guess harder here.
 */
export const isMediaReference = definition => REFERENCE_TYPES.has(definition.requiredType) &&
    (definition.constraints || []).some(constraint => {
        const name = constraintLocalName(constraint);
        return MEDIA_CONSTRAINT_PARTS.some(part => name.includes(part));
    });

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
export const NOT_SELECTABLE_RICHTEXT = 'richtext';

/**
 * The selector a rich text property is given in the CND - `- text (string, richtext)`.
 *
 * Matched case-insensitively against whatever the forms API answers with, because the name the CND
 * is written with and the name Jahia reports it under are registered separately and have never been
 * promised to agree on their capitals.
 */
const RICHTEXT_SELECTOR = 'richtext';

/**
 * Whether a property can be a column at all, and why not when it cannot.
 *
 * **A reference that is not to an image.** A reference stores a uuid, and a column of uuids says
 * nothing; what a reader wants is the thing pointed at, which means resolving each one and deciding
 * what to draw of it. An image reference is the exception the table already makes - it draws a
 * thumbnail, or an empty cell, and both are readable. The test is the same one the image filter
 * uses, so the two cannot drift into disagreeing about what an image column is.
 *
 * **Rich text**, for the same reason: a column of HTML markup is no more readable than a column of
 * uuids. What separates `- text (string, richtext)` from a plain string is the selector, and the
 * property definition cannot be asked for it. Jahia holds it on ExtendedPropertyDefinition, but
 * `JCRPropertyDefinition` in the GraphQL schema does not expose it - probed against a running 8.2,
 * `selector`, `selectorType` and `selectorOptions` all come back FieldUndefined, and the eleven
 * fields that do exist are already every one the columns query asks for.
 *
 * So the selector arrives from the other end, Content Editor's own form, whose fields do carry
 * `selectorType` - and which the columns picker was already asking, for its choicelist labels. See
 * GET_CONTENT_TYPE_FORM_FIELDS. That is why it is passed in rather than read off the definition:
 * the two halves of the answer come from two different queries, and only the caller holds both.
 *
 * **No selector means selectable.** The form is a second request that the table deliberately does
 * not wait on, so on the first render every property arrives here with nothing; on an installation
 * without Content Editor, or against a path the form cannot be built for, it never arrives at all.
 * All of those end the same way - the property is offered - because the alternative is blocking a
 * plain text column over a question nobody answered. The visible cost is that a rich text property
 * is briefly tickable before the form lands, and a stored choice of one is pruned a moment after
 * the table appears rather than never having been shown.
 *
 * Returns the reason rather than a boolean so the picker can say which rule it ran into, and so
 * that rule can be added without every caller having to change shape.
 */
export const notSelectableReasonFor = (definition, selectorType) => {
    if (REFERENCE_TYPES.has(definition.requiredType) && !isMediaReference(definition)) {
        return NOT_SELECTABLE_REFERENCE;
    }

    if (String(selectorType || '').toLowerCase() === RICHTEXT_SELECTOR) {
        return NOT_SELECTABLE_RICHTEXT;
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
export const labelForValue = (field, value) => {
    const labels = field?.valueLabels;
    // `hasOwnProperty` rather than a plain lookup: the labels are a plain object and the value is
    // content, so a record holding `__proto__` or `constructor` would otherwise answer with
    // something off Object.prototype - an object or a function where a label was expected, which
    // `??` does not catch because it is not nullish, and which React throws on as a child.
    if (labels && Object.prototype.hasOwnProperty.call(labels, value)) {
        return labels[value];
    }

    return value;
};

/**
 * The property names that hold a language rather than prose.
 *
 * Matched on the name, because holding a language is not something the definition records - the type
 * says `STRING` and nothing more, whether the value is `en` or a paragraph. The same approach the
 * column widths take, and the same cost: a site naming the field something else gets the ordinary
 * treatment, and this list is the place to add it.
 *
 * Exported because the widths need exactly these names too. One list rather than two, so a name
 * added for the badges cannot quietly fail to narrow the column it is drawn in.
 */
export const LANGUAGE_PROPERTY_NAMES = [
    'language',
    'languages',
    'languagecode',
    'language_code',
    'lang',
    'forcelanguage',
    'locale'
];

const LANGUAGE_PROPERTIES = new Set(LANGUAGE_PROPERTY_NAMES);

/** Whether a column draws languages, and so should draw them as codes. */
export const isLanguageField = field => LANGUAGE_PROPERTIES.has(String(field?.propertyName || '').toLowerCase());

/**
 * The shape of a language tag: `en`, `fra`, `pt-BR`, `en_US`.
 *
 * Deliberately a test of the STORED value rather than a list of the world's languages. What is being
 * asked is "is this a code at all", and a code is what a reader can be shown in two or three
 * characters; which language it names is the resource bundle's business, not this module's.
 */
const LANGUAGE_TAG = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i;

/**
 * A language value as a badge draws it: the code, upper case.
 *
 * The code rather than the label, which is the whole point - a row of `EN FR DE IT` is read at a
 * glance where "English, French, German, Italian" is read as a sentence, and the four of them do not
 * fit a column anybody can spare the width for.
 *
 * **Falls back to the label when the stored value is not a code.** A choicelist is free to store
 * `english` and label it English, and upper-casing that gives ENGLISH - longer than what it
 * replaced and shouting. So the code is only used where there is actually a code to use.
 *
 * `_` is normalised to `-` so one site's `en_US` and another's `en-US` read alike.
 */
export const languageCodeFor = (field, value) => {
    const stored = String(value ?? '').trim();

    return LANGUAGE_TAG.test(stored) ? stored.toUpperCase().replace(/_/g, '-') : labelForValue(field, value);
};
