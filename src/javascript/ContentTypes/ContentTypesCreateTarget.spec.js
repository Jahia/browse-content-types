import {
    TARGET_CHOICE,
    TARGET_FOLDER,
    TARGET_NONE,
    TARGET_RESOLVING,
    TARGET_SINGLE,
    createRoute,
    parentTypeNames,
    targetDecision,
    targetsFrom
} from './ContentTypesCreateTarget';

/** The records query's shape: each record reporting the kind of node that holds it. */
const parents = (...types) => ({
    jcr: {nodesByCriteria: {nodes: types.map(name => ({parent: {primaryNodeType: {name}}}))}}
});

/** The containers query's shape. */
const containers = (...nodes) => ({jcr: {nodesByCriteria: {nodes}}});

describe('parentTypeNames', () => {
    it('reports the kind of node holding the records', () => {
        expect(parentTypeNames(parents('luxe:agency'))).toEqual(['luxe:agency']);
    });

    // 161 estates across four agencies must not offer the agency list four times over.
    it('reports each kind once, however many records there are', () => {
        expect(parentTypeNames(parents('luxe:agency', 'luxe:agency', 'luxe:agency'))).toEqual(['luxe:agency']);
    });

    it('reports every distinct kind, in the order first seen', () => {
        expect(parentTypeNames(parents('luxe:agency', 'jnt:contentList', 'luxe:agency')))
            .toEqual(['luxe:agency', 'jnt:contentList']);
    });

    it.each([
        ['no data at all', undefined],
        ['a query that answered nothing', {}],
        ['no records of the type anywhere', containers()]
    ])('answers empty for %s', (_, data) => {
        expect(parentTypeNames(data)).toEqual([]);
    });

    it('skips a record whose parent reports no type', () => {
        const data = {jcr: {nodesByCriteria: {nodes: [{parent: null}, {parent: {primaryNodeType: {name: 'luxe:agency'}}}]}}};
        expect(parentTypeNames(data)).toEqual(['luxe:agency']);
    });
});

describe('targetsFrom', () => {
    it('names each container by its display name', () => {
        expect(targetsFrom(containers(
            {path: '/sites/luxe/contents/agencies/a', name: 'a', displayName: 'Luxe - Europe'}
        ))).toEqual([{path: '/sites/luxe/contents/agencies/a', label: 'Luxe - Europe'}]);
    });

    // A container with no title of its own still has to be tellable apart in a list.
    it('falls back to the node name, then to the path', () => {
        expect(targetsFrom(containers(
            {path: '/sites/luxe/one', name: 'one', displayName: null},
            {path: '/sites/luxe/two', name: null, displayName: null}
        )).map(target => target.label)).toEqual(['/sites/luxe/two', 'one']);
    });

    it('orders them the way somebody reads them', () => {
        expect(targetsFrom(containers(
            {path: '/1', name: '1', displayName: 'Luxe Asia'},
            {path: '/2', name: '2', displayName: 'Luxe - Europe'},
            {path: '/3', name: '3', displayName: 'Luxe - US East Coast'}
        )).map(target => target.label)).toEqual(['Luxe - Europe', 'Luxe - US East Coast', 'Luxe Asia']);
    });

    it('lists a node once even where two inferred kinds both match it', () => {
        expect(targetsFrom(containers(
            {path: '/same', name: 'same', displayName: 'Same'},
            {path: '/same', name: 'same', displayName: 'Same'}
        ))).toHaveLength(1);
    });

    it('answers empty rather than throwing when nothing came back', () => {
        expect(targetsFrom(undefined)).toEqual([]);
        expect(targetsFrom({})).toEqual([]);
    });
});

describe('targetDecision', () => {
    // A question with one possible answer is ceremony, and avoiding ceremony is the whole point.
    it('does not ask when there is one place it could go', () => {
        const one = {path: '/a', label: 'A'};
        expect(targetDecision([one])).toEqual({kind: TARGET_SINGLE, target: one});
    });

    it('asks when there are several', () => {
        expect(targetDecision([{path: '/a', label: 'A'}, {path: '/b', label: 'B'}]))
            .toEqual({kind: TARGET_CHOICE, target: null});
    });

    it.each([['an empty list', []], ['nothing at all', null]])('reports nowhere for %s', (_, targets) => {
        expect(targetDecision(targets)).toEqual({kind: TARGET_NONE, target: null});
    });
});

describe('createRoute', () => {
    const route = overrides => createRoute({
        isCreatable: false,
        isCheckingFolder: false,
        isFindingParents: false,
        isFindingContainers: false,
        parentTypes: [],
        targets: [],
        ...overrides
    }).kind;

    it('uses the folder for a type a content folder will hold', () => {
        expect(route({isCreatable: true})).toBe(TARGET_FOLDER);
    });

    // The folder question is asked first, and its answer decides whether the others are asked at
    // all - so until it lands, nothing else is known either.
    it('waits while the folder question is still out', () => {
        expect(route({isCheckingFolder: true})).toBe(TARGET_RESOLVING);
        expect(route({isCheckingFolder: true, isCreatable: true})).toBe(TARGET_RESOLVING);
    });

    it.each([
        ['the records are being read', {isFindingParents: true}],
        ['the containers are being read', {isFindingContainers: true}]
    ])('waits while %s', (_, overrides) => {
        expect(route(overrides)).toBe(TARGET_RESOLVING);
    });

    /*
     * The gap between the two queries: the kind of container is known, the containers themselves
     * have not been asked for yet. Without this the button would say "nowhere" for a moment and
     * then change its mind, which is worse than waiting.
     */
    it('waits in the gap between knowing the kind and having the list', () => {
        expect(route({parentTypes: ['luxe:agency'], targets: []})).toBe(TARGET_RESOLVING);
    });

    it('says nowhere only once everything has been asked', () => {
        expect(route({parentTypes: [], targets: []})).toBe(TARGET_NONE);
    });

    it('files into the one container found, or asks between several', () => {
        expect(route({parentTypes: ['luxe:agency'], targets: [{path: '/a', label: 'A'}]})).toBe(TARGET_SINGLE);
        expect(route({parentTypes: ['luxe:agency'], targets: [{path: '/a', label: 'A'}, {path: '/b', label: 'B'}]}))
            .toBe(TARGET_CHOICE);
    });

    it('carries the container through, so the caller needs no second lookup', () => {
        const one = {path: '/sites/luxe/contents/agencies/only', label: 'Only'};
        expect(createRoute({isCreatable: false, parentTypes: ['luxe:agency'], targets: [one]}).target).toEqual(one);
    });
});
