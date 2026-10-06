import {FILTER_BOOLEAN, FILTER_CHOICE, FILTER_DATE, FILTER_IMAGE, FILTER_NUMBER, FILTER_TEXT} from './ContentTypesFieldTypes';

/**
 * Replacing one property's value across the ticked rows.
 *
 * Free of React and of Apollo, like the other logic modules here: which columns may be written, what
 * shape of control collects a value, and what the mutation is given are all decidable from the field
 * catalog the table already built.
 */

/**
 * Which columns this may write.
 *
 * **A content type's own properties only.** The metadata every node carries is off limits by design,
 * not by omission: `jcr:createdBy`, `jcr:lastModified`, `j:lastPublished` and the publication status
 * are maintained by the repository, and a column like Path or Content Type is not a property at all.
 * Writing to them would either be refused or would falsify a record of what actually happened.
 * `isDynamic` is exactly the line between the two - it marks a field built from the selected type's
 * own definition rather than from the fixed common catalog.
 *
 * References are excluded too, for the reason they carry no filter either: a reference stores a uuid,
 * so setting one means choosing a node, and a box to type in would be a box to type a uuid into.
 * That is the same gap the filter feature left open, and it wants the same answer - a picker.
 * `filterType` already encodes this: a non-image reference gets none, and an image reference gets
 * FILTER_IMAGE, which is a question about presence rather than a value anyone could enter.
 *
 * Hidden, protected and binary properties never reach the catalog at all - see `isRenderable`.
 */
export const isEditable = field => Boolean(
    field?.isDynamic &&
    field.filterType &&
    field.filterType !== FILTER_IMAGE
);

/** The writable columns, in the order the catalog lists them. */
export const editableFields = fields => (fields || []).filter(isEditable);

/**
 * What kind of control collects the new value.
 *
 * The same five kinds the filter form already distinguishes, and for the same reasons - a value list
 * is chosen from, a boolean is one of two, a date wants a date control. Reusing `filterType` rather
 * than mapping `requiredType` again is what keeps the two from drifting into disagreeing about what
 * a column holds.
 */
export const EDITOR_KINDS = {
    [FILTER_CHOICE]: 'choice',
    [FILTER_BOOLEAN]: 'boolean',
    [FILTER_DATE]: 'date',
    [FILTER_NUMBER]: 'number',
    [FILTER_TEXT]: 'text'
};

export const editorKind = field => EDITOR_KINDS[field?.filterType] || 'text';

/**
 * The value a freshly opened form starts on.
 *
 * A list for a multi-valued property whatever its kind, since that is what it will be sent as, and
 * an empty string otherwise. A boolean starts at `false` rather than empty: it holds one of two
 * things, and there is no third state to offer.
 */
export const initialValue = field => {
    if (field?.multiple) {
        return [];
    }

    return editorKind(field) === 'boolean' ? 'false' : '';
};

/**
 * How many of the ticked rows already hold something this would overwrite.
 *
 * The same warning the tag and category dialogs carry, for the same reason: replacing across a
 * selection is the one operation that can quietly destroy work on a record nobody opened. The table
 * has already fetched every visible column's value, so the count costs no request - but only for a
 * column that is actually on screen. For one that is not, the honest answer is that it is not known,
 * which is what `null` says here rather than a reassuring zero.
 */
export const recordsWithValue = (nodes, field, isVisible) => {
    if (!isVisible) {
        return null;
    }

    return (nodes || []).filter(node => {
        const payload = node?.[field.key];
        if (!payload) {
            return false;
        }

        return field.multiple ?
            (payload.values || []).length > 0 :
            payload.value !== null && payload.value !== undefined && payload.value !== '';
    }).length;
};

/**
 * Whether the form can be applied.
 *
 * Clearing needs nothing typed, so it is allowed on anything the definition does not make mandatory.
 * Otherwise a value is needed - and for a multi-valued property, at least one.
 *
 * A mandatory property cannot be cleared, and the server says so: it answers "This field is
 * mandatory" and refuses the whole mutation. Checking here is not a substitute for that, it is what
 * keeps an editor from being shown an error they could have been spared.
 */
export const canApplyEdit = ({field, value, isClearing}) => {
    if (!field) {
        return false;
    }

    if (isClearing) {
        return !field.mandatory;
    }

    return field.multiple ? (value || []).length > 0 : String(value ?? '').trim() !== '';
};

/**
 * What the mutation is given.
 *
 * `language` travels only for an internationalized property, and travels *always* for one. Measured
 * against a site: setting `title` on `luxe:estate` with no language answers
 * `ConstraintViolationException: no matching property definition found`, because the definition the
 * value has to match is the per-language one. A property that is not internationalized has a single
 * definition and needs no language to find it.
 *
 * The JCR type is sent as well, so a number is stored as a number rather than as the text a form
 * collected it as.
 */
export const bulkEditVariables = ({field, nodes, value, isClearing, language}) => {
    const variables = {
        paths: (nodes || []).map(node => node.path),
        property: field.propertyName
    };

    // Present for a per-language property, absent otherwise - never sent as null, which the schema
    // would take as "no language" and the server would reject just as it rejects an omitted one.
    if (field.internationalized) {
        variables.language = language;
    }

    if (isClearing) {
        return variables;
    }

    variables.type = field.requiredType;
    if (field.multiple) {
        variables.values = value || [];
    } else {
        variables.value = String(value ?? '');
    }

    return variables;
};

/**
 * Which of the six mutations this edit needs.
 *
 * The choice is entirely determined by the field and whether the value is being cleared, so it is
 * decided here beside the variables that go with it rather than in the dialog, where the two could
 * drift apart - a document taking a language paired with variables carrying none is a runtime error
 * with nothing on screen to explain it.
 */
export const MUTATION_KINDS = {
    clear: 'CLEAR_PROPERTY',
    clearI18n: 'CLEAR_PROPERTY_I18N',
    set: 'SET_PROPERTY',
    setI18n: 'SET_PROPERTY_I18N',
    setValues: 'SET_PROPERTY_VALUES',
    setValuesI18n: 'SET_PROPERTY_VALUES_I18N'
};

export const mutationKind = ({field, isClearing}) => {
    const i18n = Boolean(field?.internationalized);

    if (isClearing) {
        return i18n ? MUTATION_KINDS.clearI18n : MUTATION_KINDS.clear;
    }

    if (field?.multiple) {
        return i18n ? MUTATION_KINDS.setValuesI18n : MUTATION_KINDS.setValues;
    }

    return i18n ? MUTATION_KINDS.setI18n : MUTATION_KINDS.set;
};
