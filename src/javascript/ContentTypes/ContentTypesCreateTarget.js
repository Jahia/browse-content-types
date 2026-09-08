/**
 * Where to create a record of a type that a content folder will not hold.
 *
 * Free of React and of Apollo, like the other logic modules here.
 *
 * **Why this exists.** Most types are `jmix:droppableContent` and go straight into this module's own
 * folder - see typeFolderPath, which is the whole "nothing is asked" bargain. A type that is not
 * droppable has no home there: a JCR content folder's child node definition admits droppable
 * content and nothing else, so the repository refuses the node outright
 * (`ConstraintViolationException: No child node definition`). On the site this was built against
 * that is exactly one listed type - luxe:estate, which by definition is a child of luxe:agency.
 *
 * **How a home is found.** There is no API for "which node types accept a child of type X", so the
 * question is turned around and asked of the content itself: the records of this type that already
 * exist are, by construction, in places that accept them. Their parents' TYPES are what is
 * inferred - not their parents - and then every node of those types in the site is a candidate.
 *
 * Inferring the type rather than taking the parents directly is what makes a new container
 * reachable. Measured on the site: four agencies hold estates and there are five, the fifth having
 * been created by this module minutes earlier. Taking the parents would have offered four and
 * hidden the empty one, which is precisely the agency somebody would be filing a first estate into.
 *
 * The cost, stated plainly: a type with no records anywhere has nothing to infer from and gets no
 * candidates. That is a real limit and not a silent one - the button says the type cannot be
 * created here, which is the truth as far as this can establish it.
 */

/**
 * The node types that hold records of this type today.
 *
 * Distinct, in first-seen order, and only from records that actually have a parent type to report.
 * A duplicate would offer the same container list twice.
 */
export const parentTypeNames = data => {
    const nodes = data?.jcr?.nodesByCriteria?.nodes || [];
    const seen = [];

    nodes.forEach(node => {
        const name = node?.parent?.primaryNodeType?.name;
        if (name && !seen.includes(name)) {
            seen.push(name);
        }
    });

    return seen;
};

/**
 * The containers a record could be filed into, as the chooser needs them.
 *
 * Named by their display name, falling back to the node name: a container is picked out of a list by
 * what it is called, and a node with no title of its own still has to be distinguishable.
 *
 * Sorted by that name rather than left in query order, since what comes back is ordered by the
 * repository and a list somebody reads should be ordered the way they read it. Deduplicated by path,
 * a node matching two of the inferred types otherwise appearing twice.
 */
export const targetsFrom = data => {
    const nodes = data?.jcr?.nodesByCriteria?.nodes || [];
    const byPath = new Map();

    nodes.forEach(node => {
        if (node?.path && !byPath.has(node.path)) {
            byPath.set(node.path, {
                path: node.path,
                label: node.displayName || node.name || node.path
            });
        }
    });

    return [...byPath.values()].sort((one, other) => one.label.localeCompare(other.label));
};

/** Nothing found: there is nowhere this module can offer. */
export const TARGET_NONE = 'none';

/** Exactly one place it could go, so there is nothing worth asking. */
export const TARGET_SINGLE = 'single';

/** Several, which is the one case that has to be asked about. */
export const TARGET_CHOICE = 'choice';

/**
 * What to do about the containers found.
 *
 * One is answered rather than asked: the whole point of the create button is that filing a record
 * takes no ceremony, and a question with one possible answer is ceremony. Several is a genuine
 * question - which agency this estate belongs to is not something this module can know - so it is
 * put to the reader.
 */
export const targetDecision = targets => {
    const found = targets || [];

    if (found.length === 0) {
        return {kind: TARGET_NONE, target: null};
    }

    if (found.length === 1) {
        return {kind: TARGET_SINGLE, target: found[0]};
    }

    return {kind: TARGET_CHOICE, target: null};
};

/** The ordinary route: this module's own folder, which most types can use. */
export const TARGET_FOLDER = 'folder';

/** Not known yet. Distinct from `none`, which is an answer. */
export const TARGET_RESOLVING = 'resolving';

/**
 * What a click on the create button should do, from everything currently known.
 *
 * One value rather than five flags read at four call sites - the label, the tooltip, the disabled
 * state and the click all need the same answer, and four separate readings of the same flags is how
 * they come to disagree. It also keeps the branching here, where it is tested, rather than in a
 * component where it can only be read.
 *
 * `resolving` is deliberately not `none`. Not knowing yet looks identical from the outside and means
 * the opposite: the button waits, where `none` says no.
 */
export const createRoute = ({isCreatable, isCheckingFolder, isFindingParents, isFindingContainers, parentTypes, targets}) => {
    if (isCheckingFolder) {
        return {kind: TARGET_RESOLVING, target: null};
    }

    if (isCreatable) {
        return {kind: TARGET_FOLDER, target: null};
    }

    if (isFindingParents || isFindingContainers) {
        return {kind: TARGET_RESOLVING, target: null};
    }

    // Parent kinds are in hand but the containers have not been asked for yet - the gap between the
    // two queries, which without this would read as "nowhere" for a moment.
    if ((parentTypes || []).length > 0 && (targets || []).length === 0) {
        return {kind: TARGET_RESOLVING, target: null};
    }

    return targetDecision(targets);
};
