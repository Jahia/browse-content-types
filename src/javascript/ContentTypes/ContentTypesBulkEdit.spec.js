import {FILTER_BOOLEAN, FILTER_CHOICE, FILTER_DATE, FILTER_IMAGE, FILTER_NUMBER, FILTER_TEXT} from './ContentTypesFieldTypes';
import {
    MUTATION_KINDS,
    bulkEditVariables,
    canApplyEdit,
    editableFields,
    editorKind,
    initialValue,
    isEditable,
    mutationKind,
    recordsWithValue
} from './ContentTypesBulkEdit';

/** A content type's own property, as useContentTypeColumns builds one. */
const own = overrides => ({
    key: 'ct_address',
    label: 'Address',
    propertyName: 'address',
    requiredType: 'STRING',
    multiple: false,
    isDynamic: true,
    filterType: FILTER_TEXT,
    ...overrides
});

/** A field from the fixed common catalog - metadata every node carries. */
const common = overrides => ({key: 'createdBy', label: 'Created by', filterType: FILTER_TEXT, ...overrides});

/**
 * The key useContentTypeColumns builds for a property - `ct_` plus its name - held in a constant and
 * used as a computed key below, so a deliberately non-camel-case name is not put in front of the
 * linter on every row.
 */
const ADDRESS = 'ct_address';

describe('ContentTypesBulkEdit', () => {
    describe('isEditable', () => {
        it('allows a content type\'s own property', () => {
            expect(isEditable(own())).toBe(true);
        });

        // The line the whole feature is drawn on. These are maintained by the repository, and
        // writing to them would either be refused or falsify a record of what happened.
        it.each(['createdBy', 'createdDate', 'lastModified', 'publishedOn', 'publicationStatus', 'path', 'id', 'type'])(
            'refuses the common metadata column %s',
            key => {
                expect(isEditable(common({key}))).toBe(false);
            }
        );

        // A reference stores a uuid, so setting one means choosing a node - a box to type in would
        // be a box to type a uuid into. The filter feature left the same gap for the same reason.
        it('refuses a reference, which needs a picker rather than a box', () => {
            expect(isEditable(own({requiredType: 'WEAKREFERENCE', filterType: undefined}))).toBe(false);
        });

        it('refuses an image column, whose filter is a question about presence', () => {
            expect(isEditable(own({filterType: FILTER_IMAGE}))).toBe(false);
        });

        it('refuses anything with no kind of control to offer', () => {
            expect(isEditable(own({filterType: undefined}))).toBe(false);
            expect(isEditable(undefined)).toBe(false);
        });
    });

    describe('editableFields', () => {
        it('keeps the type\'s own properties and drops the rest, in catalog order', () => {
            const fields = [
                common({key: 'createdBy'}),
                own({key: 'ct_address', label: 'Address'}),
                own({key: 'ct_images', filterType: FILTER_IMAGE}),
                own({key: 'ct_price', label: 'Price', filterType: FILTER_NUMBER})
            ];
            expect(editableFields(fields).map(field => field.key)).toEqual(['ct_address', 'ct_price']);
        });

        it('copes with no catalog at all', () => {
            expect(editableFields(undefined)).toEqual([]);
        });
    });

    describe('editorKind', () => {
        it.each([
            [FILTER_CHOICE, 'choice'],
            [FILTER_BOOLEAN, 'boolean'],
            [FILTER_DATE, 'date'],
            [FILTER_NUMBER, 'number'],
            [FILTER_TEXT, 'text']
        ])('collects a %s column with a %s control', (filterType, expected) => {
            expect(editorKind(own({filterType}))).toBe(expected);
        });
    });

    describe('initialValue', () => {
        it('starts a multi-valued property on an empty list, which is what it will be sent as', () => {
            expect(initialValue(own({multiple: true}))).toEqual([]);
        });

        // It holds one of two things; there is no third state to offer.
        it('starts a boolean on false rather than on nothing', () => {
            expect(initialValue(own({filterType: FILTER_BOOLEAN}))).toBe('false');
        });

        it('starts everything else empty', () => {
            expect(initialValue(own())).toBe('');
        });
    });

    describe('recordsWithValue', () => {
        const nodes = [
            {path: '/a', [ADDRESS]: {value: '1 Main St'}},
            {path: '/b', [ADDRESS]: {value: null}},
            {path: '/c'},
            {path: '/d', [ADDRESS]: {value: '2 Main St'}}
        ];

        it('counts only the rows that stand to lose something', () => {
            expect(recordsWithValue(nodes, own(), true)).toBe(2);
        });

        it('counts an empty string as nothing', () => {
            expect(recordsWithValue([{path: '/a', [ADDRESS]: {value: ''}}], own(), true)).toBe(0);
        });

        it('counts a multi-valued property by whether it holds anything', () => {
            const rows = [{path: '/a', [ADDRESS]: {values: ['x']}}, {path: '/b', [ADDRESS]: {values: []}}];
            expect(recordsWithValue(rows, own({multiple: true}), true)).toBe(1);
        });

        // A column that is not on screen has had no values fetched, so the honest answer is that it
        // is not known - a reassuring zero would be a lie in front of a destructive action.
        it('answers null for a column the table is not showing, rather than zero', () => {
            expect(recordsWithValue(nodes, own(), false)).toBeNull();
        });
    });

    describe('canApplyEdit', () => {
        it('needs a column chosen', () => {
            expect(canApplyEdit({field: null, value: 'x'})).toBe(false);
        });

        it('needs something typed', () => {
            expect(canApplyEdit({field: own(), value: 'x'})).toBe(true);
            expect(canApplyEdit({field: own(), value: ''})).toBe(false);
            expect(canApplyEdit({field: own(), value: '   '})).toBe(false);
        });

        it('needs at least one value for a multi-valued property', () => {
            expect(canApplyEdit({field: own({multiple: true}), value: ['x']})).toBe(true);
            expect(canApplyEdit({field: own({multiple: true}), value: []})).toBe(false);
        });

        it('needs nothing typed to empty a property', () => {
            expect(canApplyEdit({field: own(), value: '', isClearing: true})).toBe(true);
        });

        // The server answers "This field is mandatory" and refuses the whole mutation; checking here
        // keeps an editor from being shown an error they could have been spared.
        it('refuses to empty a mandatory property', () => {
            expect(canApplyEdit({field: own({mandatory: true}), value: '', isClearing: true})).toBe(false);
        });

        it('still allows setting a mandatory property to something', () => {
            expect(canApplyEdit({field: own({mandatory: true}), value: 'x'})).toBe(true);
        });
    });

    describe('mutationKind', () => {
        it('picks the plain setter for a single, untranslated property', () => {
            expect(mutationKind({field: own()})).toBe(MUTATION_KINDS.set);
        });

        it('picks the multi setter for a multi-valued one', () => {
            expect(mutationKind({field: own({multiple: true})})).toBe(MUTATION_KINDS.setValues);
        });

        it('picks a per-language variant for a translated property', () => {
            expect(mutationKind({field: own({internationalized: true})})).toBe(MUTATION_KINDS.setI18n);
            expect(mutationKind({field: own({internationalized: true, multiple: true})}))
                .toBe(MUTATION_KINDS.setValuesI18n);
        });

        it('picks the right clear for each', () => {
            expect(mutationKind({field: own(), isClearing: true})).toBe(MUTATION_KINDS.clear);
            expect(mutationKind({field: own({internationalized: true}), isClearing: true}))
                .toBe(MUTATION_KINDS.clearI18n);
        });
    });

    describe('bulkEditVariables', () => {
        const nodes = [{path: '/a'}, {path: '/b'}];

        it('sends every selected path and the property name', () => {
            const variables = bulkEditVariables({field: own(), nodes, value: 'x', language: 'en'});
            expect(variables.paths).toEqual(['/a', '/b']);
            expect(variables.property).toBe('address');
        });

        it('sends the JCR type, so a number is stored as a number', () => {
            const field = own({requiredType: 'LONG', filterType: FILTER_NUMBER});
            expect(bulkEditVariables({field, nodes, value: '42', language: 'en'}).type).toBe('LONG');
        });

        // Setting title on luxe:estate with no language answers ConstraintViolationException: no
        // matching property definition found - the definition to match is the per-language one.
        it('carries the language for a translated property', () => {
            const variables = bulkEditVariables({field: own({internationalized: true}), nodes, value: 'x', language: 'fr'});
            expect(variables.language).toBe('fr');
        });

        // A property that is not internationalized has a single definition and needs no language;
        // sending null is not the same as omitting it.
        it('omits the language entirely for a property that is not translated', () => {
            const variables = bulkEditVariables({field: own(), nodes, value: 'x', language: 'en'});
            expect('language' in variables).toBe(false);
        });

        it('sends a list for a multi-valued property', () => {
            const variables = bulkEditVariables({field: own({multiple: true}), nodes, value: ['a', 'b'], language: 'en'});
            expect(variables.values).toEqual(['a', 'b']);
            expect('value' in variables).toBe(false);
        });

        // `delete` takes neither, so sending them would be sending arguments the document does
        // not declare.
        it('sends neither a value nor a type when emptying', () => {
            const variables = bulkEditVariables({field: own(), nodes, value: 'x', isClearing: true, language: 'en'});
            expect('value' in variables).toBe(false);
            expect('type' in variables).toBe(false);
            expect(variables.property).toBe('address');
        });

        it('still carries the language when emptying a translated property', () => {
            const field = own({internationalized: true});
            expect(bulkEditVariables({field, nodes, isClearing: true, language: 'fr'}).language).toBe('fr');
        });
    });
});
