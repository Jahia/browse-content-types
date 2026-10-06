import {parse} from 'graphql';
import {CAPTURE_REFERENCES, CAPTURE_TIMESTAMPS, CAPTURE_VALUES} from './ContentTypes.gql';

/**
 * Taking back the last bulk operation.
 *
 * One level, deliberately: what an editor wants after a bulk mistake is the state they were just in,
 * and a stack of them would be a promise this cannot honestly keep - each step back is written from
 * a snapshot taken before that step, and nothing here notices if somebody else has edited the same
 * records in between. One step, taken straight away, is a promise the data can keep.
 *
 * The snapshot is what the records held **before** the operation, read from the repository rather
 * than taken from the rows on screen. That matters for two cases the table cannot answer: a column
 * the reader has hidden has no values in the rows at all, and the category column carries only
 * display names, where restoring needs the uuids. Reading it explicitly is also simply what a
 * snapshot is - the state at that moment, not whatever the table last fetched.
 */

/**
 * What was there before, in the shape the restore will need.
 *
 * `values` is null where the record held nothing at all, which is not the same as holding an empty
 * list: the first restores by deleting the property, the second by setting it empty. Getting that
 * wrong leaves every record that had no tags carrying an empty tag list afterwards.
 */
export const snapshotEntries = (nodes, {isReference}) => (nodes || []).map(node => {
    const payload = node.property;

    if (!payload) {
        return {path: node.path, values: null};
    }

    if (isReference) {
        const uuids = (payload.refNodes || []).map(reference => reference.uuid).filter(Boolean);
        return {path: node.path, values: uuids.length > 0 ? uuids : null};
    }

    if (payload.values) {
        return {path: node.path, values: payload.values};
    }

    return {
        path: node.path,
        values: payload.value === null || payload.value === undefined ? null : [payload.value]
    };
});

/**
 * The whole record of one operation, and everything the undo needs to reverse it.
 *
 * `label` is what the message names - the column, in the reader's own words - because "Undo" on its
 * own beside a table that has just changed in several ways says too little.
 */
export const buildSnapshot = ({kind, label, property, type, language, multiple, entries, timestamps}) => ({
    kind,
    label,
    property,
    type,
    language,
    multiple,
    entries,
    // Absent where the capture failed, which costs the publication flag its restore but not the
    // values theirs.
    timestamps,
    count: entries.length
});

/**
 * The mutation that puts every record back, in one document.
 *
 * One aliased `mutateNode` per record rather than a single `mutateNodes`, because each record is
 * going back to its **own** previous value - `mutateNodes` applies one value to all of them, which
 * is what got us here. Verified against a site, including a document that sets some records and
 * deletes the property on others in the same call.
 *
 * Variables are declared only where they are used. GraphQL rejects a document declaring one it never
 * reads, so an undo where every record simply had nothing - restoring by deleting throughout - must
 * not announce a `$type` it has no value to put in.
 */
export const buildRestoreDocument = snapshot => {
    const {entries, multiple, language} = snapshot;
    const hasValues = entries.some(entry => entry.values !== null);
    const languageArgument = language ? ', language: $language' : '';

    const declarations = ['$property: String!'];
    if (hasValues) {
        declarations.push('$type: JCRPropertyType!');
    }

    if (language) {
        declarations.push('$language: String!');
    }

    const selections = entries.map((entry, index) => {
        declarations.push(`$p${index}: String!`);

        if (entry.values === null) {
            return `n${index}: mutateNode(pathOrId: $p${index}) {
                mutateProperty(name: $property) { delete${language ? '(language: $language)' : ''} }
            }`;
        }

        const setter = multiple ?
            `setValues(type: $type, values: $v${index}${languageArgument})` :
            `setValue(type: $type, value: $v${index}${languageArgument})`;

        declarations.push(`$v${index}: ${multiple ? '[String]!' : 'String!'}`);

        return `n${index}: mutateNode(pathOrId: $p${index}) {
                mutateProperty(name: $property) { ${setter} }
            }`;
    });

    return parse(`
        mutation undoBulkOperation(${declarations.join(', ')}) {
            jcr(workspace: EDIT) {
                ${selections.join('\n                ')}
            }
        }
    `);
};

/** The variables that go with it, named to match. */
export const buildRestoreVariables = snapshot => {
    const variables = {property: snapshot.property};

    if (snapshot.entries.some(entry => entry.values !== null)) {
        variables.type = snapshot.type;
    }

    if (snapshot.language) {
        variables.language = snapshot.language;
    }

    snapshot.entries.forEach((entry, index) => {
        variables[`p${index}`] = entry.path;
        if (entry.values !== null) {
            variables[`v${index}`] = snapshot.multiple ? entry.values : entry.values[0];
        }
    });

    return variables;
};

/**
 * How many of the records a restore would actually change.
 *
 * Not shown anywhere, and useful all the same: an undo of an operation that changed nothing is worth
 * knowing about while reading this back, and it is the one number a test can assert the snapshot
 * against without reaching for the repository.
 */
export const affectedCount = snapshot => (snapshot?.entries || []).length;

/**
 * What the undo bar says.
 *
 * The operation is named by the column it touched rather than by which menu entry raised it, since
 * that is what the reader recognises when they look back at the table - the tags went, not "the tag
 * operation happened".
 */
export const undoMessageKey = () => 'label.undo.property';

/**
 * The stamps a record carried before the operation, flattened.
 *
 * One entry per JCR node whose stamps can move - the record itself, and its translation subnode
 * where the property that was written is internationalized. Flat rather than nested because the
 * restore treats them identically: each is a node with the same three properties to put back.
 *
 * A null stands for a property the record did not have, and is restored by deleting rather than by
 * writing an empty value - `j:lastPublished` is absent entirely on a record that has never been
 * published, and writing an empty string there would make it look published to nothing.
 */
export const timestampEntries = nodes => (nodes || []).flatMap(node => {
    const read = target => target && ({
        path: target.path,
        lastModified: target.lastModified?.value ?? null,
        lastModifiedBy: target.lastModifiedBy?.value ?? null,
        lastPublished: target.lastPublished?.value ?? null
    });

    return [read(node), read(node.translation)].filter(Boolean);
});

/** The three properties a stamp entry puts back, and the JCR type each is written as. */
const STAMP_PROPERTIES = [
    {key: 'lastModified', property: 'jcr:lastModified', type: 'DATE', prefix: 'm'},
    {key: 'lastModifiedBy', property: 'jcr:lastModifiedBy', type: 'STRING', prefix: 'b'},
    {key: 'lastPublished', property: 'j:lastPublished', type: 'DATE', prefix: 'u'}
];

/**
 * The mutation that puts the stamps back.
 *
 * Sent **after** the values have been restored, never with them: restoring a value is itself a write
 * and moves `jcr:lastModified` forward again, so a document that did both would leave the stamp it
 * had just corrected pointing at the moment of the undo.
 *
 * These properties are declared `protected` in the definitions, which normally means a mutation
 * cannot touch them - measured against a site, Jahia's GraphQL writes them anyway. This is
 * deliberate rather than accidental, and it is a forgery: a record changed twice will afterwards
 * claim it was never touched, and `jcr:lastModifiedBy` will name whoever held it before rather than
 * whoever ran the operation. Clement chose that trade against leaving the publication flag wrong.
 */
export const buildTimestampDocument = timestamps => {
    const declarations = [];
    const selections = (timestamps || []).map((entry, index) => {
        declarations.push(`$p${index}: String!`);

        const parts = STAMP_PROPERTIES.map(({key, property, type, prefix}) => {
            if (entry[key] === null || entry[key] === undefined) {
                return `${prefix}${index}: mutateProperty(name: "${property}") { delete }`;
            }

            declarations.push(`$${prefix}${index}: String!`);
            return `${prefix}${index}: mutateProperty(name: "${property}") { setValue(type: ${type}, value: $${prefix}${index}) }`;
        });

        return `s${index}: mutateNode(pathOrId: $p${index}) {
                ${parts.join('\n                ')}
            }`;
    });

    return parse(`
        mutation undoBulkTimestamps(${declarations.join(', ')}) {
            jcr(workspace: EDIT) {
                ${selections.join('\n                ')}
            }
        }
    `);
};

/** The variables that go with it, named to match. */
export const buildTimestampVariables = timestamps => {
    const variables = {};

    (timestamps || []).forEach((entry, index) => {
        variables[`p${index}`] = entry.path;
        STAMP_PROPERTIES.forEach(({key, prefix}) => {
            if (entry[key] !== null && entry[key] !== undefined) {
                variables[`${prefix}${index}`] = entry[key];
            }
        });
    });

    return variables;
};

/**
 * What the records hold now, read just before an operation replaces it.
 *
 * The one piece of reading every surface that writes a property has to do first, and it was written
 * out at each of them. Here instead, because the two captures are easy to get subtly wrong in
 * different ways in different copies - and a copy that drifts does not fail loudly, it just restores
 * something slightly wrong when somebody finally presses undo.
 *
 * Both are best-effort on purpose: losing a capture costs the undo, not the edit. An editor who has
 * just corrected a value would rather have the correction saved with no way back than be told the
 * save failed because a snapshot could not be read. A caller that cannot honestly proceed without
 * the values - an Add, which computes a union against them - checks `entries` itself and says so.
 *
 * The timestamps go with the values because Jahia reads the publication flag from jcr:lastModified
 * against j:lastPublished, and never from comparing the two workspaces: restoring values alone
 * leaves every record still marked Modified.
 */
export const captureUndo = async (client, {paths, property, language, isReference = false}) => {
    let entries = null;
    try {
        const captured = await client.query({
            query: isReference ? CAPTURE_REFERENCES : CAPTURE_VALUES,
            variables: {paths, property, language},
            fetchPolicy: 'network-only'
        });
        entries = snapshotEntries(captured.data?.jcr?.nodesByPath, {isReference});
    } catch {
        entries = null;
    }

    let timestamps = null;
    try {
        const stamped = await client.query({
            query: CAPTURE_TIMESTAMPS,
            variables: {paths, translationPath: `j:translation_${language}`},
            fetchPolicy: 'network-only'
        });
        timestamps = timestampEntries(stamped.data?.jcr?.nodesByPath);
    } catch {
        timestamps = null;
    }

    return {entries, timestamps};
};
