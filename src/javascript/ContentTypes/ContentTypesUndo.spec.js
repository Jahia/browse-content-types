import {print} from 'graphql';
import {
    affectedCount,
    buildRestoreDocument,
    buildRestoreVariables,
    buildSnapshot,
    buildTimestampDocument,
    buildTimestampVariables,
    snapshotEntries,
    taskSnapshot,
    timestampEntries,
    undoMessageKey
} from './ContentTypesUndo';

const node = (path, property) => ({path, property});

/** A snapshot as the dialogs build one. */
const snapshot = overrides => buildSnapshot({
    kind: 'property',
    label: 'Tags',
    property: 'j:tagList',
    type: 'STRING',
    multiple: true,
    entries: [],
    ...overrides
});

describe('ContentTypesUndo', () => {
    describe('snapshotEntries', () => {
        it('captures a single value as a one-item list', () => {
            const entries = snapshotEntries([node('/a', {value: '1 Main St', values: null})], {isReference: false});
            expect(entries).toEqual([{path: '/a', values: ['1 Main St']}]);
        });

        it('captures a multi-valued property as it stands', () => {
            const entries = snapshotEntries([node('/a', {value: null, values: ['sea', 'view']})], {isReference: false});
            expect(entries).toEqual([{path: '/a', values: ['sea', 'view']}]);
        });

        // The distinction the whole restore turns on: nothing at all is put back by deleting the
        // property, an empty list by setting it empty. Confusing the two leaves every record that
        // had no tags carrying an empty tag list after an undo.
        it('records a record that held nothing as null, not as an empty list', () => {
            expect(snapshotEntries([node('/a', null)], {isReference: false}))
                .toEqual([{path: '/a', values: null}]);
            expect(snapshotEntries([node('/a', {value: null, values: null})], {isReference: false}))
                .toEqual([{path: '/a', values: null}]);
        });

        // The table shows category display names; restoring needs what the property actually stores.
        it('captures references by uuid, which is what the property holds', () => {
            const entries = snapshotEntries(
                [node('/a', {refNodes: [{uuid: 'u1'}, {uuid: 'u2'}]})],
                {isReference: true}
            );
            expect(entries).toEqual([{path: '/a', values: ['u1', 'u2']}]);
        });

        it('records an empty reference list as nothing held', () => {
            expect(snapshotEntries([node('/a', {refNodes: []})], {isReference: true}))
                .toEqual([{path: '/a', values: null}]);
        });

        it('copes with no records at all', () => {
            expect(snapshotEntries(undefined, {isReference: false})).toEqual([]);
        });
    });

    describe('buildRestoreDocument', () => {
        const documentFor = entries => print(buildRestoreDocument(snapshot({entries})));

        // Each record goes back to its own previous value, which is exactly what a single
        // mutateNodes cannot express - it applies one value to all of them.
        it('writes one aliased mutation per record', () => {
            const text = documentFor([
                {path: '/a', values: ['sea']},
                {path: '/b', values: ['view']}
            ]);
            expect(text).toContain('n0: mutateNode(pathOrId: $p0)');
            expect(text).toContain('n1: mutateNode(pathOrId: $p1)');
        });

        it('restores a record that held nothing by deleting the property', () => {
            const text = documentFor([{path: '/a', values: null}]);
            expect(text).toContain('delete');
            expect(text).not.toContain('setValues');
        });

        // Verified against a site: one document can set some records and delete on others.
        it('mixes setting and deleting in one document', () => {
            const text = documentFor([{path: '/a', values: ['sea']}, {path: '/b', values: null}]);
            expect(text).toContain('setValues');
            expect(text).toContain('delete');
        });

        it('uses the single-value setter for a property that is not multi-valued', () => {
            const text = print(buildRestoreDocument(snapshot({
                multiple: false,
                entries: [{path: '/a', values: ['1 Main St']}]
            })));
            expect(text).toContain('setValue(');
            expect(text).not.toContain('setValues(');
        });

        // GraphQL rejects a document declaring a variable it never reads, so an undo where every
        // record simply had nothing must not announce a $type it has no value for.
        it('declares no $type when every record is restored by deleting', () => {
            const text = documentFor([{path: '/a', values: null}, {path: '/b', values: null}]);
            expect(text).not.toContain('$type');
        });

        it('declares $type as soon as one record has a value to put back', () => {
            const text = documentFor([{path: '/a', values: null}, {path: '/b', values: ['sea']}]);
            expect(text).toContain('$type: JCRPropertyType!');
        });

        it('declares no $language for a property that is not translated', () => {
            expect(documentFor([{path: '/a', values: ['x']}])).not.toContain('$language');
        });

        it('carries the language through both the setter and the delete when translated', () => {
            const text = print(buildRestoreDocument(snapshot({
                language: 'fr',
                multiple: false,
                entries: [{path: '/a', values: ['Bonjour']}, {path: '/b', values: null}]
            })));
            expect(text).toContain('$language: String!');
            expect(text).toContain('language: $language');
            expect(text).toContain('delete(language: $language)');
        });

        it('produces a document graphql itself accepts', () => {
            expect(() => buildRestoreDocument(snapshot({
                entries: [{path: '/a', values: ['x']}, {path: '/b', values: null}]
            }))).not.toThrow();
        });
    });

    describe('buildRestoreVariables', () => {
        it('names a path and a value per record, matching the document', () => {
            const variables = buildRestoreVariables(snapshot({
                entries: [{path: '/a', values: ['sea']}, {path: '/b', values: ['view']}]
            }));
            expect(variables).toMatchObject({
                property: 'j:tagList',
                type: 'STRING',
                p0: '/a',
                v0: ['sea'],
                p1: '/b',
                v1: ['view']
            });
        });

        it('sends a bare value rather than a list for a single-valued property', () => {
            const variables = buildRestoreVariables(snapshot({
                multiple: false,
                entries: [{path: '/a', values: ['1 Main St']}]
            }));
            expect(variables.v0).toBe('1 Main St');
        });

        it('sends no value for a record restored by deleting', () => {
            const variables = buildRestoreVariables(snapshot({entries: [{path: '/a', values: null}]}));
            expect(variables.p0).toBe('/a');
            expect('v0' in variables).toBe(false);
        });

        it('omits $type when the document declares none', () => {
            const variables = buildRestoreVariables(snapshot({entries: [{path: '/a', values: null}]}));
            expect('type' in variables).toBe(false);
        });

        it('carries the language only when the property is translated', () => {
            expect(buildRestoreVariables(snapshot({entries: [{path: '/a', values: ['x']}]})).language)
                .toBeUndefined();
            expect(buildRestoreVariables(snapshot({language: 'fr', entries: [{path: '/a', values: ['x']}]})).language)
                .toBe('fr');
        });
    });

    describe('the snapshot itself', () => {
        it('counts the records it covers', () => {
            const built = snapshot({entries: [{path: '/a', values: null}, {path: '/b', values: null}]});
            expect(built.count).toBe(2);
            expect(affectedCount(built)).toBe(2);
        });

        // Assign to created something rather than replacing anything, so there is no previous value
        // - taking it back means removing the task again.
        it('records a task by its uuid rather than by previous values', () => {
            const built = taskSnapshot({label: 'Assign content', uuid: 'task-uuid', count: 3});
            expect(built).toEqual({kind: 'task', label: 'Assign content', uuid: 'task-uuid', count: 3});
        });

        it('names each kind of operation differently in the bar', () => {
            expect(undoMessageKey(snapshot())).toBe('label.undo.property');
            expect(undoMessageKey(taskSnapshot({uuid: 'x'}))).toBe('label.undo.task');
        });
    });

    describe('the publication stamps', () => {
        const stamped = (path, overrides = {}) => ({
            path,
            lastModified: {value: '2025-09-29T15:41:22.408Z'},
            lastModifiedBy: {value: 'root'},
            lastPublished: {value: '2025-09-29T15:43:15.466Z'},
            ...overrides
        });

        describe('timestampEntries', () => {
            it('captures the record\'s own stamps', () => {
                expect(timestampEntries([stamped('/a')])).toEqual([{
                    path: '/a',
                    lastModified: '2025-09-29T15:41:22.408Z',
                    lastModifiedBy: 'root',
                    lastPublished: '2025-09-29T15:43:15.466Z'
                }]);
            });

            // An internationalized property's modification date does not live on the node but on a
            // hidden j:translation_<language> child with its own pair - and that is the one an edit
            // to a translated property actually moves.
            it('captures the translation subnode alongside the record', () => {
                const entries = timestampEntries([
                    stamped('/a', {translation: stamped('/a/j:translation_en')})
                ]);
                expect(entries.map(entry => entry.path)).toEqual(['/a', '/a/j:translation_en']);
            });

            it('leaves out a translation subnode the record does not have', () => {
                expect(timestampEntries([stamped('/a', {translation: null})])).toHaveLength(1);
            });

            // `j:lastPublished` is absent entirely on a record that has never been published, and
            // writing an empty value there would make it look published to nothing.
            it('records an absent stamp as null', () => {
                const entries = timestampEntries([stamped('/a', {lastPublished: null})]);
                expect(entries[0].lastPublished).toBeNull();
            });

            it('copes with nothing captured', () => {
                expect(timestampEntries(undefined)).toEqual([]);
            });
        });

        describe('buildTimestampDocument', () => {
            const entry = overrides => ({
                path: '/a',
                lastModified: '2025-09-29T15:41:22.408Z',
                lastModifiedBy: 'root',
                lastPublished: '2025-09-29T15:43:15.466Z',
                ...overrides
            });

            it('puts all three stamps back on each record', () => {
                const text = print(buildTimestampDocument([entry()]));
                expect(text).toContain('jcr:lastModified');
                expect(text).toContain('jcr:lastModifiedBy');
                expect(text).toContain('j:lastPublished');
            });

            it('writes one aliased mutation per node, record and translation alike', () => {
                const text = print(buildTimestampDocument([entry(), entry({path: '/a/j:translation_en'})]));
                expect(text).toContain('s0: mutateNode(pathOrId: $p0)');
                expect(text).toContain('s1: mutateNode(pathOrId: $p1)');
            });

            it('restores an absent stamp by deleting it rather than writing an empty one', () => {
                const text = print(buildTimestampDocument([entry({lastPublished: null})]));
                expect(text).toContain('delete');
                expect(text).not.toContain('$u0');
            });

            it('produces a document graphql itself accepts', () => {
                expect(() => buildTimestampDocument([entry(), entry({path: '/b', lastPublished: null})]))
                    .not.toThrow();
            });
        });

        describe('buildTimestampVariables', () => {
            it('names a path and the three stamps per node', () => {
                const variables = buildTimestampVariables([{
                    path: '/a',
                    lastModified: '2025-09-29T15:41:22.408Z',
                    lastModifiedBy: 'root',
                    lastPublished: '2025-09-29T15:43:15.466Z'
                }]);
                expect(variables).toEqual({
                    p0: '/a',
                    m0: '2025-09-29T15:41:22.408Z',
                    b0: 'root',
                    u0: '2025-09-29T15:43:15.466Z'
                });
            });

            it('sends nothing for a stamp that is being deleted', () => {
                const variables = buildTimestampVariables([{
                    path: '/a',
                    lastModified: '2025-09-29T15:41:22.408Z',
                    lastModifiedBy: 'root',
                    lastPublished: null
                }]);
                expect('u0' in variables).toBe(false);
            });

            it('copes with nothing to restore', () => {
                expect(buildTimestampVariables(undefined)).toEqual({});
            });
        });

        it('carries the stamps on the snapshot, and tolerates their absence', () => {
            const withStamps = buildSnapshot({...snapshot(), timestamps: [{path: '/a'}]});
            expect(withStamps.timestamps).toHaveLength(1);
            expect(buildSnapshot(snapshot()).timestamps).toBeUndefined();
        });
    });
});
