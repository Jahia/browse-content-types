import {parse} from 'graphql';

/**
 * Setting a tag list or a category list across the ticked rows.
 *
 * Free of React and of Apollo, like the other three logic modules here. The two operations differ
 * only in which mixin carries the property, what the property is called, what kind of value it holds
 * and which picker collects it - so they are one table and one dialog rather than two of each.
 */

/**
 * The two fields this menu can set in bulk.
 *
 * `selectorType` names a Content Editor selector type, which is fetched from the registry rather
 * than imported: jContent federates no picker at all, but Content Editor registers its selector
 * types on the same `@jahia/ui-extender` registry this module already takes `menuAction` from. That
 * is a registry key rather than an API, so it is named once, here, and the dialog degrades to
 * saying so if the key is ever gone.
 *
 * `valueType` is what the values are, and it matters: a tag is the string itself while a category is
 * a uuid the server has to resolve to a node. Sent untyped, the uuids would be stored as the text
 * they arrived as - a reference property holding something that resolves to nothing.
 */
export const BULK_FIELDS = {
    tag: {
        key: 'tag',
        mixin: 'jmix:tagged',
        property: 'j:tagList',
        valueType: 'STRING',
        selectorType: 'Tag',
        // What the row already holds, as the record query fetched it - see ContentTypesRecordQuery.
        // The table reads these for its own columns, so the dialog needs no query of its own to say
        // what is about to be replaced.
        readCurrent: node => node?.tags?.values || []
    },
    categorize: {
        key: 'categorize',
        mixin: 'jmix:categorized',
        property: 'j:defaultCategory',
        valueType: 'WEAKREFERENCE',
        selectorType: 'Category',
        readCurrent: node => node?.categories?.refNodes || []
    }
};

/**
 * How many of the ticked rows already hold something that setting this field would throw away.
 *
 * The whole point of the confirmation: replacing is the chosen behaviour, and it is the one
 * behaviour that can quietly destroy work on a record the editor never looked at. Saying "9 of 40
 * records already have categories" before the fact is what makes that a decision rather than an
 * accident.
 */
export const recordsWithValues = (nodes, field) => (nodes || [])
    .filter(node => field.readCurrent(node).length > 0)
    .length;

/**
 * The `field` object a Content Editor selector type expects to be handed.
 *
 * Built fresh on every call, and that is not an accident. `Category` pushes its `rootPath` and
 * `types` into `field.selectorOptions` **on every render**, so a memoised object would accumulate
 * the same two options without bound for as long as the dialog stayed open. A new object each time
 * is the cheap way to be safe against a component mutating what it was given.
 *
 * `multiple` is true for both: `Tag` refuses to render at all without it - it shows an
 * "invalid selector type" message instead - and a category field is a list by nature.
 */
export const pickerField = (field, label) => ({
    name: field.property,
    displayName: label,
    multiple: true,
    readOnly: false,
    requiredType: field.valueType === 'WEAKREFERENCE' ? 'WeakReference' : 'String',
    selectorType: field.selectorType,
    selectorOptions: []
});

/**
 * What the mutation is given.
 *
 * One call for the whole selection: `mutateNodes` takes every path at once, and each node gets the
 * mixin added and the property set. Adding the mixin is not optional even where the value list is
 * empty - a node that never had the mixin has no such property to clear, and asking to clear one is
 * an error rather than a no-op.
 *
 * `setValues` rather than `addValues`, and not only because replacing is the chosen behaviour:
 * measured against a site, `addValues` on a node whose property does not exist yet fails outright
 * with `PathNotFoundException: j:tagList`. Adding the mixin defines the property; it does not create
 * it. So the first tag ever put on a record could not be added, only set.
 */
export const bulkFieldVariables = ({field, nodes, values}) => ({
    paths: (nodes || []).map(node => node.path),
    mixins: [field.mixin],
    property: field.property,
    type: field.valueType,
    values: values || []
});

/**
 * The two ways the chosen values can meet what a record already holds.
 *
 * `REPLACE` is the original behaviour and stays the default: each record ends up holding exactly
 * what was picked, and whatever it held before is gone. `ADD` keeps what is there and adds to it.
 *
 * They are not the same operation underneath. Replacing sends one value list for the whole
 * selection, so it is a single `mutateNodes`. Adding gives every record a **different** final list -
 * its own values plus the chosen ones - so it needs one `mutateNode` per record, the same shape the
 * undo uses for the same reason.
 */
export const BULK_MODES = {
    REPLACE: 'replace',
    ADD: 'add'
};

/**
 * What a record ends up holding when the chosen values are added to it.
 *
 * A set, so a value the record already has is not stored twice - which is what makes picking a
 * category some of the selection already carries a silent no-op rather than an error. Existing
 * values keep their order and the new ones follow, so adding to a record does not reshuffle what was
 * already there.
 */
export const unionValues = (existing, selected) => [
    ...new Set([...(existing || []), ...(selected || [])])
];

/**
 * The records an "add" actually has to write, and what each should end up holding.
 *
 * `entries` are `{path, values}` as captured from the repository before the operation - the same
 * capture the undo takes, reused rather than re-queried. **The repository, not the table rows:** a
 * category cell carries display names, and what has to go back into the property is uuids.
 *
 * A record that already holds everything that was picked is left out entirely rather than written
 * with an identical list. Writing it would change nothing a reader can see, but it would still bump
 * `jcr:lastModified` and so flag the record as Modified for publication - a visible consequence for
 * an operation that did nothing.
 */
export const addRecords = ({entries, values}) => (entries || [])
    .map(entry => ({path: entry.path, values: unionValues(entry.values, values)}))
    .filter((record, index) => record.values.length > (entries[index].values || []).length);

/**
 * The mutation an "add" needs: one aliased `mutateNode` per record, each with its own list.
 *
 * The mixin is added on every one of them, exactly as the replace path does: a record that never
 * carried the mixin has no such property, and adding the mixin is what defines it.
 *
 * `setValues` with the union rather than `addValues` with the difference. `addValues` looks like the
 * natural fit and is the wrong tool twice over: measured against a site it fails outright with
 * `PathNotFoundException` on a record whose property does not exist yet - the mixin defines the
 * property without creating it - which is precisely the "record has no categories" case this mode
 * exists to serve. Sending the whole intended list sidesteps that, and makes the result independent
 * of what the property held a moment ago.
 */
export const buildAddDocument = ({records}) => {
    const declarations = ['$property: String!', '$type: JCRPropertyType!', '$mixins: [String]!'];

    const selections = (records || []).map((record, index) => {
        declarations.push(`$p${index}: String!`, `$v${index}: [String]!`);
        return `n${index}: mutateNode(pathOrId: $p${index}) {
                addMixins(mixins: $mixins)
                mutateProperty(name: $property) { setValues(type: $type, values: $v${index}) }
            }`;
    });

    return parse(`
        mutation addBulkField(${declarations.join(', ')}) {
            jcr(workspace: EDIT) {
                ${selections.join('\n                ')}
            }
        }
    `);
};

/** The variables that go with it, named to match. */
export const buildAddVariables = ({field, records}) => {
    const variables = {
        property: field.property,
        type: field.valueType,
        mixins: [field.mixin]
    };

    (records || []).forEach((record, index) => {
        variables[`p${index}`] = record.path;
        variables[`v${index}`] = record.values;
    });

    return variables;
};

/**
 * Whether there is anything to apply.
 *
 * An empty list is a legitimate thing to apply - it is how a set of records is cleared - so the only
 * thing that stops the button is having no records, which the bar makes impossible anyway.
 */
export const canApply = nodes => (nodes || []).length > 0;
