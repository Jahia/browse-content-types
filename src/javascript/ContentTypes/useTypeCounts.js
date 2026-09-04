import {useMemo} from 'react';
import {useQuery} from '@apollo/client';
import {buildTypeCountDocument, buildTypeCountVariables, readTypeCounts} from './ContentTypesCounts';

/**
 * A stand-in document for when there is nothing to count.
 *
 * Apollo's useQuery insists on a document even when `skip` is set, so this is handed over in that
 * case. Built once at module scope; it is never sent.
 */
const IDLE_DOCUMENT = buildTypeCountDocument(['jnt:content']);

/**
 * How many records of each type the site holds, for the settings panel to show beside each one.
 *
 * One request for the whole list - see buildTypeCountDocument for why that is one document rather
 * than one per type, and what it costs.
 *
 * The type list arrives from another query, so this waits for it: with nothing to count there is no
 * document to send, and Apollo is given `skip` rather than an empty document it would reject.
 *
 * Deliberately NOT `network-only`. A count is a hint for a decision, not the decision itself, and
 * the cached answer from a moment ago is worth more than a spinner beside every row. It refreshes
 * when the panel is reopened, which is when an administrator would look at it again.
 */
export const useTypeCounts = (typeNames, sitePath) => {
    // Joined into a string so the memos survive a NEW array holding the SAME names: the type list
    // is derived from a query result, so it is a fresh array on every render, and depending on it
    // directly would rebuild the document and re-run the query each time.
    const key = useMemo(() => (typeNames || []).join(' '), [typeNames]);
    const names = useMemo(() => (key ? key.split(' ') : []), [key]);

    const document = useMemo(() => buildTypeCountDocument(names), [names]);

    const {data, loading, error} = useQuery(document || IDLE_DOCUMENT, {
        variables: buildTypeCountVariables(names, sitePath),
        skip: !document || !sitePath
    });

    const counts = useMemo(() => readTypeCounts(data, names), [data, names]);

    return {counts, loading, error};
};

export default useTypeCounts;
