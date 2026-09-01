import {useCallback, useMemo} from 'react';
import {shallowEqual, useDispatch, useSelector} from 'react-redux';
import {registry} from '@jahia/ui-extender';
import {ACCORDION_KEY} from './registerContentTypesAccordion';

/**
 * The filters for this location, and the way to change them.
 *
 * Reading and writing both go through jContent's own params: the accordion already puts `searchPath`
 * there, so it is spread back on every write rather than replaced. Navigating with the goto action is
 * what updates the address bar, which also means the browser's back button steps back through the
 * filters one at a time.
 */
export const useColumnFilters = () => {
    const dispatch = useDispatch();
    const {params, path} = useSelector(state => ({
        params: state.jcontent.params,
        path: state.jcontent.path
    }), shallowEqual);

    const filters = useMemo(() => {
        const stored = params?.filters;
        return Array.isArray(stored) ? stored.filter(filter => filter?.c && filter?.o) : [];
    }, [params]);

    // Memoised because the table's columns are built from these, and a callback with a new identity
    // on every render would rebuild every column on every render.
    const write = useCallback(next => {
        const goto = registry.get('redux-action', 'jcontentGoto');
        if (!goto) {
            return;
        }

        const nextParams = {...params};
        if (next.length > 0) {
            nextParams.filters = next;
        } else {
            // Deleted, not set to undefined. A spread keeps the key, and rison - which is what
            // jContent encodes params with - refuses an undefined value outright: "rison can't
            // encode the undefined value". That threw inside the navigation, so the address never
            // changed and clearing a filter appeared to do nothing whatsoever.
            delete nextParams.filters;
        }

        dispatch(goto.action({mode: ACCORDION_KEY, path, params: nextParams}));
    }, [dispatch, params, path]);

    /** One filter per column: setting another on the same column replaces it. */
    const setFilter = useCallback((columnKey, filter) => write([
        ...filters.filter(existing => existing.c !== columnKey),
        {c: columnKey, ...filter}
    ]), [filters, write]);

    const clearFilter = useCallback(
        columnKey => write(filters.filter(existing => existing.c !== columnKey)),
        [filters, write]
    );

    const clearAll = useCallback(() => write([]), [write]);

    return {filters, setFilter, clearFilter, clearAll};
};
