import {useEffect, useMemo, useState} from 'react';
import {useQuery} from '@apollo/client';
import {useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {GET_CONTENT_TYPE_FIELDS, GET_CONTENT_TYPE_VALUE_LABELS} from './ContentTypes.gql';
import {FILTER_BOOLEAN, FILTER_CHOICE, FILTER_DATE, FILTER_IMAGE, FILTER_NUMBER, FILTER_PUBLICATION, FILTER_TEXT, isImageReference, notSelectableReasonFor, publicationOptions} from './ContentTypesFieldTypes';
import {GET_SITE_LANGUAGES} from './ContentTypes.gql';
import {translatableProperties} from './ContentTypesTranslations';
import {NAMESPACE} from '../ContentTypes.register';

const STORAGE_PREFIX = 'content-types:columns:';

/**
 * Which property a common field can be filtered on, and with what kind of form.
 *
 * A filter is a constraint on a named JCR property, so a column can only offer one where it reads a
 * property in the first place. Four of them do not: Content Type and Publication are computed rather
 * than stored, Path is what the query already scopes itself by, and ID and Lock are neither. Those
 * columns simply get no filter control, which is more honest than a form that could not be answered.
 */
const COMMON_FILTERS = {
    createdBy: {jcrProperty: 'jcr:createdBy', filterType: FILTER_TEXT},
    createdDate: {jcrProperty: 'jcr:created', filterType: FILTER_DATE},
    lastModified: {jcrProperty: 'jcr:lastModified', filterType: FILTER_DATE},
    lastModifiedBy: {jcrProperty: 'jcr:lastModifiedBy', filterType: FILTER_TEXT},
    publishedOn: {jcrProperty: 'j:lastPublished', filterType: FILTER_DATE},
    publishedBy: {jcrProperty: 'j:lastPublishedBy', filterType: FILTER_TEXT},
    // Multi-valued, and a constraint on one matches a node holding it among others - which is what
    // filtering by a tag should mean.
    tags: {jcrProperty: 'j:tagList', filterType: FILTER_TEXT},
    // No `jcrProperty`, deliberately: there is no property to constrain, so nothing is asked of the
    // repository and the filter is applied to the records instead. See FILTER_PUBLICATION.
    publicationStatus: {filterType: FILTER_PUBLICATION},
    systemName: {jcrProperty: 'j:nodename', filterType: FILTER_TEXT}
};

/**
 * The property types a substring search can usefully run against.
 *
 * Text only. A number or a date is not something a reader searches by fragment, and both are absent
 * from the full text index anyway - a price of 6560000 finds nothing however it is asked for.
 */
const TEXT_SEARCH_TYPES = new Set(['STRING', 'NAME', 'PATH', 'URI']);

/**
 * The kind of filter form a content type's own property gets, or nothing where it gets none.
 *
 * References are left out for now: a constraint on one compares the uuid it stores, so a usable
 * filter needs a picker to turn a choice into that uuid rather than a box to type in.
 */
const FILTER_TYPES_BY_REQUIRED_TYPE = {
    STRING: FILTER_TEXT,
    NAME: FILTER_TEXT,
    PATH: FILTER_TEXT,
    URI: FILTER_TEXT,
    LONG: FILTER_NUMBER,
    DOUBLE: FILTER_NUMBER,
    DECIMAL: FILTER_NUMBER,
    DATE: FILTER_DATE,
    BOOLEAN: FILTER_BOOLEAN
};

/**
 * Metadata and content status are not part of any single content type's own definition, but every
 * node in the repository carries them, so they are offered from a fixed catalog instead of a
 * query. `sortProperty` is the GraphQL field path the record query aliases the same property to -
 * see ContentTypesRecordQuery - which is why the two files must agree on these key names.
 */
export const COMMON_FIELDS = [
    {key: 'type', labelKey: 'label.field.type', sortProperty: 'primaryNodeType.displayName'},
    {key: 'createdBy', labelKey: 'label.field.createdBy', sortProperty: 'createdBy.value'},
    {key: 'createdDate', labelKey: 'label.field.createdDate', sortProperty: 'createdDate.value'},
    {key: 'lastModified', labelKey: 'label.field.lastModified', sortProperty: 'lastModified.value', isDefault: true},
    {key: 'lastModifiedBy', labelKey: 'label.field.lastModifiedBy', sortProperty: 'lastModifiedBy.value', isDefault: true},
    {key: 'publicationStatus', labelKey: 'label.field.publicationStatus', isDefault: true},
    // Tags and categories belong here rather than among a type's own fields: they are carried by the
    // jmix:tagged and jmix:categorized mixins, so they can be put on any node and belong to no one
    // type's definition. That is also why they cannot arrive through the query below, which keeps
    // only properties the selected type itself declares - a mixin's are filtered out even on a node
    // that has it. Neither is sortable: both are multi-valued, with no single value to order by.
    {key: 'tags', labelKey: 'label.field.tags'},
    {key: 'categories', labelKey: 'label.field.categories'},
    // Which properties are filled in one language and not another. Computed from the per-language
    // translation subnodes the record query fetches, so - like the publication column - it has no
    // `jcrProperty` and no `sortProperty`: there is nothing on the record for `nodeConstraint` to
    // constrain or for `fieldSorter` to order on. Off by default. On a single-language site it is
    // still offered but always empty - there is no second language for anything to be missing from,
    // and the record query asks for no translation subnodes at all in that case.
    {key: 'missingTranslations', labelKey: 'label.field.missingTranslations'},
    // Locking is a state of the node rather than a property of any type, so it belongs here too.
    // Not sortable: what would be compared is a list of lock holders, and neither of the two fields
    // behind the column is a JCR property the repository could order on.
    {key: 'lock', labelKey: 'label.field.lock'},
    {key: 'publishedOn', labelKey: 'label.field.publishedOn', sortProperty: 'publishedOn.value'},
    {key: 'publishedBy', labelKey: 'label.field.publishedBy', sortProperty: 'publishedBy.value'},
    {key: 'path', labelKey: 'label.field.path'},
    {key: 'systemName', labelKey: 'label.field.systemName'},
    {key: 'id', labelKey: 'label.field.id'}
];

/**
 * What a reader sees before they have chosen anything: Name, then when a record was last touched, by
 * whom, and whether that has been published.
 *
 * One question answered across four columns - what state is this content in, and who to ask about
 * it. `createdBy` was among them and is not any more: on content that has been edited since, who
 * first made it answers a question nobody asked, and the last modifier is the person to go to.
 *
 * The order is this array's order, which is why the three sit in the sequence they are read in. Name
 * is not among them because it is not in this catalog at all - it is always drawn, as is the row
 * menu, which the table appends rather than taking from here.
 *
 * No field of a type's own is default, and there is no way to mark one: this catalog is the common
 * metadata every node carries, and which of a type's own properties matters most is not something
 * this module can know.
 */
const DEFAULT_VISIBLE_KEYS = COMMON_FIELDS.filter(field => field.isDefault).map(field => field.key);

/** A binary property (a large file's own bytes) has no reasonable display as a table cell. */
const isRenderable = definition => !definition.hidden && !definition.protected && definition.requiredType !== 'BINARY';

/**
 * How a property gets ordered, if it can be.
 *
 * There are two mechanisms and they are not interchangeable, so a field carries whichever one suits
 * it and the query sends only that one.
 *
 * `sortJcrProperty` names a property for the criteria query's own `ordering`, which sorts in the
 * repository against the property as what it actually is - a number as a number, a date as a date.
 * That is the right answer for any plain value, and it is what makes a numeric column sortable at
 * all: `fieldSorter` compares the *text* a GraphQL field returned, so it put a column of prices in
 * the order 1, 11, 12, 2 and there is no numeric mode to ask it for.
 *
 * `sortProperty` names a GraphQL field path for `fieldSorter`, and is kept for the one case ordering
 * cannot serve: a reference, where the repository would order by the stored uuid - nothing anybody
 * can see - and what is wanted is the name of the node it points at, which only exists once GraphQL
 * has resolved it.
 */
const sortingFor = (definition, key) => {
    // Nothing to order a row by: a multi-valued property holds a list, not a value.
    if (definition.multiple) {
        return {};
    }

    if (definition.requiredType === 'REFERENCE' || definition.requiredType === 'WEAKREFERENCE') {
        return {sortProperty: `${key}.refNode.displayName`};
    }

    return {sortJcrProperty: definition.name};
};

const readStoredKeys = storageKey => {
    try {
        const stored = window.localStorage.getItem(storageKey);
        return stored ? JSON.parse(stored) : DEFAULT_VISIBLE_KEYS;
    } catch {
        // A private window, a full quota, or corrupted JSON all land here. None of them should
        // stop the table from showing something - they just mean today's choice starts fresh.
        return DEFAULT_VISIBLE_KEYS;
    }
};

/**
 * Everything about the Name and Content Type columns picker for one content type: the catalog of
 * fields it could show, which of them are currently visible, and the one place that choice is
 * read from and saved to.
 *
 * The choice is stored in the browser, per site and per content type, rather than on the server:
 * unlike which content types the accordion lists at all, this is how one person prefers to look
 * at a table, not a decision that should change what a colleague sees. jContent keeps its own
 * per-site view state the same way.
 *
 * Every change is written as it is made, so leaving the screen and coming back shows the same
 * columns. The cost of that is there being no separate notion of a set you are trying out versus one
 * you meant to keep - what is on screen is what you get next time, and `resetToDefaults` is the way
 * back.
 */
/** The kind of filter a content type's own property gets. */
const filterTypeFor = (definition, valueLabels) => {
    if (valueLabels) {
        return FILTER_CHOICE;
    }

    if (isImageReference(definition)) {
        return FILTER_IMAGE;
    }

    return FILTER_TYPES_BY_REQUIRED_TYPE[definition.requiredType];
};

export const useContentTypeColumns = contentType => {
    const {t} = useTranslation(NAMESPACE);
    const site = useSelector(state => state.site);
    const uilang = useSelector(state => state.uilang);
    const language = useSelector(state => state.language);
    const storageKey = `${STORAGE_PREFIX}${site}:${contentType}`;

    const {data, loading} = useQuery(GET_CONTENT_TYPE_FIELDS, {
        variables: {type: contentType, language: uilang || 'en'},
        skip: !contentType
    });

    // The language the table is being read in, not the language of the interface around it. A reader
    // who has switched the table to French is reading French content and expects French values, even
    // with an English interface - and it is the language in the address, so it is the one thing on
    // screen that says which language the values are being shown in.
    //
    // Not part of `loading`: a column is worth showing as soon as its values arrive, and the labels
    // only change how those values read. Blocking the table on a second round trip would trade a
    // brief moment of raw codes for a longer wait on everything.
    const {data: labelData} = useQuery(GET_CONTENT_TYPE_VALUE_LABELS, {
        variables: {
            type: contentType,
            language: language || uilang || 'en',
            path: `/sites/${site}/contents`
        },
        skip: !contentType || !site
    });

    /**
     * Every constrained property of this type: the labels for looking a stored value up, and the
     * values in the order the definition lists them.
     *
     * Two shapes of the same thing because they are read differently. A cell looks one value up, once
     * per row, so that wants a map; the filter form offers the whole list, and an object would not
     * keep the definition's order for a list of numeric codes.
     */
    const {labelsByProperty, optionsByProperty} = useMemo(() => {
        const byProperty = {};
        const optionsFor = {};

        const collect = formField => {
            if (formField.declaringNodeType !== contentType) {
                return;
            }

            const labels = {};
            const options = [];
            (formField.valueConstraints || []).forEach(constraint => {
                const value = constraint.value?.string;
                // A constraint that is not a choicelist - a node type on a reference, the regex on
                // seoKeywords - answers with the value as its own label. Left out, so those fields
                // carry no list at all and are filtered as text, the way they always were.
                if (value && constraint.displayValue && constraint.displayValue !== value) {
                    labels[value] = constraint.displayValue;
                    options.push({value, label: constraint.displayValue});
                }
            });

            if (options.length > 0) {
                byProperty[formField.name] = labels;
                optionsFor[formField.name] = options;
            }
        };

        const sections = labelData?.forms?.createForm?.sections || [];
        sections.forEach(section => (section.fieldSets || []).forEach(fieldSet => (fieldSet.fields || []).forEach(collect)));

        return {labelsByProperty: byProperty, optionsByProperty: optionsFor};
    }, [labelData, contentType]);

    /*
     * The languages the missing-translations column compares, and the only new request this column
     * costs - the per-record values ride along in the table's own query.
     *
     * Only those active in edit: a language that has been switched off is not one anybody is
     * expected to have translated into, and counting it would flag every record on the site.
     *
     * Here rather than in the table, because this hook is where the columns are decided and a second
     * component querying it separately would ask twice for one answer. The export dialog was that
     * second component; the table is the only reader now.
     */
    const {data: languageData} = useQuery(GET_SITE_LANGUAGES, {
        variables: {sitePath: `/sites/${site}`},
        skip: !site
    });

    const languages = useMemo(
        () => (languageData?.jcr?.nodeByPath?.site?.languages || [])
            .filter(entry => entry.activeInEdit)
            .map(entry => entry.language),
        [languageData]
    );

    /*
     * The type's own text properties, so a search can match INSIDE a word.
     *
     * The full-text arm matches a whole word or a prefix - `(provence OR provence*)` - so a
     * fragment from the middle finds nothing: measured on a site, "rovenc" returned 0 records while
     * "provence" returned 27. Only the system name had a substring match, which made mid-word search
     * appear to work on records whose node name happened to contain the fragment and not otherwise.
     * A `LIKE %fragment%` arm per text property closes that: the same "rovenc" then returned 21.
     *
     * From the unfiltered definitions, so inherited properties count - `jcr:title` is declared by
     * `mix:title` and is the only text a `luxe:section` has. Single-valued only: the multi-valued
     * text that matters is the tag list, which already has an arm of its own.
     *
     * Cost, measured: ten arms on 161 records took 0.42s against 0.20s without them, and a
     * whole-word search was unchanged at 0.07s. `%fragment%` cannot use an index, so this grows with
     * both the property count and the record count - it is the part to look at first if search ever
     * feels slow on a large site.
     */
    const searchableTextProperties = useMemo(
        () => (data?.jcr?.nodeTypeByName?.properties || [])
            .filter(definition => TEXT_SEARCH_TYPES.has(definition.requiredType) &&
                !definition.hidden && !definition.multiple)
            .map(definition => definition.name),
        [data]
    );

    /*
     * Every property of the type that can be translated, for the missing-translations column.
     *
     * From the unfiltered definitions on purpose. `contentTypeFields` below keeps only what the
     * selected type declares ITSELF, because that is what makes sense as a column - but `jcr:title`
     * is declared by `mix:title`, and measured against a site it is where 10 of the 15 real
     * translation gaps were. Reusing the column list here would miss nearly all of them.
     */
    const translatableFields = useMemo(
        () => translatableProperties(data?.jcr?.nodeTypeByName?.properties || []),
        [data]
    );

    const contentTypeFields = useMemo(() => {
        const definitions = data?.jcr?.nodeTypeByName?.properties || [];
        return definitions
            .filter(definition => definition.declaringNodeType?.name === contentType && isRenderable(definition))
            .map(definition => {
                const key = `ct_${definition.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
                const valueLabels = labelsByProperty[definition.name];
                return {
                    key,
                    label: definition.displayName || definition.name,
                    propertyName: definition.name,
                    requiredType: definition.requiredType,
                    multiple: definition.multiple,
                    // `internationalized` is read by the untranslated column, which counts the
                    // per-language properties a record has not filled in. `mandatory` is read by
                    // nothing: it was what told the replace-a-value form that a property could not
                    // be cleared, and it is what that form would want back first. See DEFERRED.md.
                    internationalized: definition.internationalized,
                    mandatory: definition.mandatory,
                    isDynamic: true,
                    // Listed in the picker but not tickable - see notSelectableReasonFor.
                    notSelectableReason: notSelectableReasonFor(definition),
                    // Contributes one of `sortJcrProperty` or `sortProperty`, or neither - which is
                    // what leaves a multi-valued column without a sort arrow. See sortingFor.
                    ...sortingFor(definition, key),
                    // A filter constrains the property itself, so multi-valued is no obstacle the way
                    // it is for sorting: a constraint on one value matches a node holding it.
                    jcrProperty: definition.name,
                    // A value list decides how the column is filtered, whatever type the codes are
                    // stored as: the listed values are the only ones it can hold, so it is chosen
                    // from rather than typed into. An image is filtered on whether there is one.
                    filterType: filterTypeFor(definition, valueLabels),
                    valueLabels,
                    valueOptions: optionsByProperty[definition.name]
                };
            });
    }, [data, contentType, labelsByProperty, optionsByProperty]);

    /**
     * The Name column as a field in its own right.
     *
     * It shows a computed value rather than a property: what it draws is the type's primary item,
     * falling back to the node's own name where the type names a child node instead, or names
     * nothing at all. `jcrProperty` records which of the two a given type ended up with.
     *
     * Deliberately not part of `availableFields`: that list is the columns picker, and Name is
     * always shown. It is published on its own so that whatever needs to name every column a record
     * carries can reach this one too.
     *
     * **Read by nothing today.** The export dialog was its only consumer and is no longer in the
     * module; this is kept because it is what that dialog would want back first. See DEFERRED.md.
     */
    const nameField = useMemo(() => {
        const definitions = data?.jcr?.nodeTypeByName?.properties || [];
        const primaryItem = data?.jcr?.nodeTypeByName?.primaryItem?.name;
        const primaryDefinition = primaryItem && definitions.find(definition => definition.name === primaryItem);
        const isProperty = Boolean(primaryDefinition);

        return {
            key: 'displayName',
            label: t('label.table.name'),
            jcrProperty: isProperty ? primaryItem : 'j:nodename',
            filterType: FILTER_TEXT,
            multiple: false,
            // Only when falling back: the node name is punctuated where the displayed name has
            // spaces, so a space in what was typed has to match either. A primary item needs none of
            // this - its value is what the column draws, character for character.
            looseSeparators: !isProperty
        };
    }, [data, t]);

    const availableFields = useMemo(() => [
        ...COMMON_FIELDS.map(field => {
            const common = {...field, label: t(field.labelKey), ...COMMON_FILTERS[field.key]};
            if (common.filterType !== FILTER_PUBLICATION) {
                return common;
            }

            // The statuses are this module's own words rather than the definition's, so they are
            // built here where `t` is, in the same shape a value list arrives in.
            const options = publicationOptions(t);
            const labels = {};
            options.forEach(option => {
                labels[option.value] = option.label;
            });

            return {...common, valueOptions: options, valueLabels: labels};
        }),
        ...contentTypeFields
    ], [contentTypeFields, t]);

    const [visibleKeys, setVisibleKeys] = useState(() => readStoredKeys(storageKey));

    // A different type means a different storage key and a different catalog: read that type's
    // own choice instead of carrying the previous type's selection over.
    useEffect(() => {
        setVisibleKeys(readStoredKeys(storageKey));
    }, [storageKey]);

    // A field can disappear from under a stored choice - the module was updated, a property was
    // removed from the definition. Drop it silently rather than ask the table to render a column
    // with no data behind it.
    //
    // A field that is still there but may no longer be chosen goes the same way, and for the same
    // reason: a choice made before the rule existed is still a choice nobody could make today, and
    // leaving it would put a column on screen that the picker says is not available. Dropped from
    // the state only - `apply` is what writes, so the stored list keeps it until the next real
    // change, and a rule later relaxed gives the column back to whoever had chosen it.
    useEffect(() => {
        if (loading) {
            return;
        }

        const selectable = new Set(
            availableFields.filter(field => !field.notSelectableReason).map(field => field.key)
        );
        setVisibleKeys(previous => previous.filter(key => selectable.has(key)));
    }, [availableFields, loading]);

    /**
     * Applies a choice and remembers it, so leaving the screen and coming back shows the same
     * columns rather than starting over.
     *
     * Written here, from the things a person actually did, rather than from an effect watching
     * `visibleKeys`: that state also changes when the catalog prunes a field that no longer exists,
     * and on first mount when nothing has been chosen at all. Persisting either of those would save
     * a set nobody asked for over one somebody did.
     */
    const apply = keys => {
        setVisibleKeys(keys);
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(keys));
        } catch {
            // A private window, or a full quota. The choice still applies for this visit and simply
            // will not be there on the next one, which beats refusing to make the change at all.
        }
    };

    // A newly shown field is added at the end, in the order it was checked - the same place a
    // freshly added table column would land. Moving it anywhere else is what the arrows are for.
    //
    // Showing one that may not be chosen is refused here as well as disabled in the picker. The
    // effect above would take it straight back out, so without this a blocked field would flicker
    // on and the stored list would have been written with it in.
    const toggleField = key => {
        if (visibleKeys.includes(key)) {
            apply(visibleKeys.filter(existing => existing !== key));
            return;
        }

        if (availableFields.find(field => field.key === key)?.notSelectableReason) {
            return;
        }

        apply([...visibleKeys, key]);
    };

    // Swaps a visible field with its neighbour. Silently does nothing at either end of the list -
    // there is no neighbour to swap with, and the locked Name column is not part of this array at
    // all, so the first entry here is already the first field after it.
    const moveField = (key, direction) => {
        const index = visibleKeys.indexOf(key);
        const target = index + direction;
        if (index === -1 || target < 0 || target >= visibleKeys.length) {
            return;
        }

        const next = [...visibleKeys];
        [next[index], next[target]] = [next[target], next[index]];
        apply(next);
    };

    /**
     * Back to the columns this table starts with.
     *
     * Clears the stored choice rather than storing the current defaults, so a later version of this
     * module that starts with a different set gives it to someone who never chose their own - the
     * same reason the settings panel stores an empty list rather than every type.
     */
    const resetToDefaults = () => {
        try {
            window.localStorage.removeItem(storageKey);
        } catch {
            // Nothing to undo if it could not be read or written in the first place.
        }

        setVisibleKeys(DEFAULT_VISIBLE_KEYS);
    };

    // In visibleKeys' own order, not the catalog's: this is what the up/down arrows reorder, and
    // what the table's columns then follow, left to right.
    const visibleFields = useMemo(() => {
        const byKey = new Map(availableFields.map(field => [field.key, field]));
        return visibleKeys.map(key => byKey.get(key)).filter(Boolean);
    }, [availableFields, visibleKeys]);

    return {
        availableFields,
        nameField,
        visibleFields,
        visibleKeys,
        translatableFields,
        searchableTextProperties,
        languages,
        toggleField,
        moveField,
        resetToDefaults,
        loading
    };
};

export default useContentTypeColumns;
