import React, {useEffect, useMemo, useState} from 'react';
import PropTypes from 'prop-types';
import {useQuery} from '@apollo/client';
import {shallowEqual, useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {Chip, DataTable, Loader, Pagination, Typography} from '@jahia/moonstone';
import {DisplayAction} from '@jahia/ui-extender';
import {ButtonRendererNoLabel} from '@jahia/jcontent';
import {buildListingQuery, buildSearchQuery} from './ContentTypesRecordQuery';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

const DEFAULT_ITEMS_PER_PAGE = 25;
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

/** Nothing is searched for until the fourth character, so short terms cost no query. */
const MIN_SEARCH_LENGTH = 4;

/** Pause after the last keystroke before searching, so a typed word is one query, not several. */
const SEARCH_DEBOUNCE_MS = 300;

/** Same cut-off jContent uses for a node name in its own lists. */
const MAX_NAME_LENGTH = 50;

/**
 * A rich text node's display name is its whole body, which arrives from the query untruncated and
 * would otherwise stretch the Name column to hundreds of characters. Cut on a word boundary when
 * there is one near the end, as jContent does; the full text stays in the cell's title.
 */
const ellipsize = text => {
    if (!text || text.length <= MAX_NAME_LENGTH) {
        return text;
    }

    const cut = text.slice(0, MAX_NAME_LENGTH);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > MAX_NAME_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/**
 * Publication status to the chip that shows it.
 *
 * Only the three states asked for are named. Anything else - unpublished, marked for deletion,
 * a conflict - keeps its own status text in a neutral chip rather than being folded into one of
 * the three, which would state something untrue about the record.
 */
const PUBLICATION_CHIPS = {
    PUBLISHED: {labelKey: 'label.publication.published', color: 'success'},
    MODIFIED: {labelKey: 'label.publication.modified', color: 'warning'},
    NOT_PUBLISHED: {labelKey: 'label.publication.notPublished', color: 'default'}
};

const humanise = status => status.toLowerCase().replace(/_/g, ' ');

const renderDate = (value, dateFormat) => (value ? dateFormat.format(new Date(value)) : '-');

/**
 * How each field common to every node reads its value off the row, keyed by the same field.key
 * used everywhere else - the picker, the hook's catalog, and ContentTypesRecordQuery's aliases.
 * A few (path, systemName, id) were already being fetched for other reasons, so they need no
 * property alias of their own; the rest read the alias ContentTypesRecordQuery adds for them.
 */
const COMMON_RENDERERS = {
    type: data => data.primaryNodeType?.displayName || data.primaryNodeType?.name || '-',
    createdBy: data => data.createdBy?.value || '-',
    createdDate: (data, {dateFormat}) => renderDate(data.createdDate?.value, dateFormat),
    lastModified: (data, {dateFormat}) => renderDate(data.lastModified?.value, dateFormat),
    lastModifiedBy: data => data.lastModifiedBy?.value || '-',
    publicationStatus: (data, {t}) => {
        const status = data.aggregatedPublicationInfo?.publicationStatus;
        if (!status) {
            return null;
        }

        const chip = PUBLICATION_CHIPS[status];
        return (
            <Chip color={chip ? chip.color : 'default'}
                  label={chip ? t(chip.labelKey) : humanise(status)}
                  data-sel-publication-status={status}
            />
        );
    },
    publishedOn: (data, {dateFormat}) => renderDate(data.publishedOn?.value, dateFormat),
    publishedBy: data => data.publishedBy?.value || '-',
    path: data => data.path,
    systemName: data => data.name,
    id: data => data.uuid
};

/**
 * How a content type's own field reads its value off the row. The same shape is read whatever the
 * underlying property type is: a reference resolves through `refNode`/`refNodes` to the target's
 * display name rather than its raw uuid, a multi-valued property joins its values, and everything
 * else falls back to the plain value string.
 */
const renderDynamicField = (field, payload, {t}) => {
    if (!payload) {
        return '-';
    }

    if (field.multiple) {
        const items = payload.refNodes?.length > 0 ?
            payload.refNodes.map(node => node.displayName) :
            (payload.values || []);
        return items.length > 0 ? items.join(', ') : '-';
    }

    if (payload.refNode) {
        return payload.refNode.displayName || '-';
    }

    if (payload.value === null || payload.value === undefined) {
        return '-';
    }

    if (field.requiredType === 'BOOLEAN') {
        return payload.value === 'true' ? t('label.yes') : t('label.no');
    }

    return payload.value;
};

const toRow = node => ({...node, displayName: node.displayName || node.name});

/**
 * Characters the full text parser reads as syntax. Left in a term they change the query, and a
 * stray quote makes it invalid outright: the server answers with a RepositoryException rather
 * than an empty result.
 */
const FULLTEXT_OPERATORS = /["'()[\]^~?:\\*%]/g;

/** Words the parser reads as operators rather than as something to look for. */
const BOOLEAN_WORDS = new Set(['and', 'or', 'not']);

const sanitiseTokens = term => term
    .split(/\s+/)
    .map(token => token.replace(FULLTEXT_OPERATORS, '').replace(/^-+/, ''))
    .filter(token => token.length > 0 && !BOOLEAN_WORDS.has(token.toLowerCase()));

/**
 * Each word matched two ways at once, as `(word OR word*)`.
 *
 * The index stores analysed, stemmed words, so a bare term matches whole words and their
 * variants: "visits" finds "visit". A wildcard term skips the analyser and matches the raw
 * indexed form, so it finds prefixes but loses stemming: "visits*" finds nothing, while "visi*"
 * finds "visit". Neither alone is enough, and asking for both is why typing part of a word works
 * without breaking the whole words that already did.
 */
const toFullTextExpression = tokens => tokens.map(token => `(${token} OR ${token}*)`).join(' ');

/**
 * Holds back the term until typing pauses and it is long enough to be worth a query, then turns
 * it into the two forms the query needs. `isSearching` false is what sends the table back to the
 * full listing, so a term that is only punctuation searches for nothing rather than erroring.
 */
const useSearchTerm = search => {
    const [debounced, setDebounced] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [search]);

    return useMemo(() => {
        const tokens = sanitiseTokens(debounced);
        const cleaned = tokens.join(' ');

        if (cleaned.length < MIN_SEARCH_LENGTH) {
            return {isSearching: false, terms: '', nameTerms: '', typed: ''};
        }

        return {
            isSearching: true,
            terms: toFullTextExpression(tokens),
            // The node name arm is a LIKE, not a full text match, so it takes the plain words.
            nameTerms: `%${cleaned.toLowerCase()}%`,
            typed: cleaned
        };
    }, [debounced]);
};

export const ContentTypesTable = ({contentType, search, visibleFields}) => {
    const {t} = useTranslation(NAMESPACE);
    const {site, language, uilang} = useSelector(state => ({
        site: state.site,
        language: state.language,
        uilang: state.uilang
    }), shallowEqual);

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
    const [sortBy, setSortBy] = useState('displayName');
    const [sortDirection, setSortDirection] = useState('ascending');
    const [selection, setSelection] = useState([]);

    const {isSearching, terms, nameTerms, typed} = useSearchTerm(search);

    // Page numbers do not carry across types, and no more across a change of search: page 4 of one
    // result set is very likely past the end of the next, which would show an empty table for a
    // type that has content. The selection goes with it, since it holds uuids that belong to the
    // set being left behind.
    useEffect(() => {
        setCurrentPage(1);
        setSelection([]);
    }, [contentType, terms]);

    // Reset the sort whenever the chosen column disappears - hiding a column that the table was
    // sorted by would otherwise keep silently requesting a sort the picker no longer offers.
    useEffect(() => {
        if (sortBy !== 'displayName' && !visibleFields.some(field => field.key === sortBy)) {
            setSortBy('displayName');
            setSortDirection('ascending');
        }
    }, [visibleFields, sortBy]);

    const dynamicFields = useMemo(() => visibleFields.filter(field => field.isDynamic), [visibleFields]);

    // Rebuilt only when the set of content-type-specific columns actually shown changes - not on
    // every render, and not when a common field becomes visible, since those are always fetched.
    const dynamicFieldsKey = dynamicFields.map(field => field.key).join(',');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const listingQuery = useMemo(() => buildListingQuery(dynamicFields), [dynamicFieldsKey]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const searchQuery = useMemo(() => buildSearchQuery(dynamicFields), [dynamicFieldsKey]);

    const sortProperty = useMemo(() => {
        if (sortBy === 'displayName') {
            return 'displayName';
        }

        return visibleFields.find(field => field.key === sortBy)?.sortProperty || 'displayName';
    }, [sortBy, visibleFields]);

    const common = {
        sitePath: `/sites/${site}`,
        type: contentType,
        language,
        offset: (currentPage - 1) * itemsPerPage,
        limit: itemsPerPage,
        fieldSorter: {
            fieldName: sortProperty,
            sortType: sortDirection === 'descending' ? 'DESC' : 'ASC',
            ignoreCase: true
        }
    };

    const ready = Boolean(site) && Boolean(contentType);

    const listing = useQuery(listingQuery, {
        variables: common,
        skip: !ready || isSearching
    });

    const found = useQuery(searchQuery, {
        variables: {
            ...common,
            terms,
            // LOWER_CASE lowercases the column server-side, so an upper-case pattern would never
            // match. jContent lowercases the pattern here for the same reason.
            nameTerms
        },
        skip: !ready || !isSearching
    });

    const {data, loading, error, previousData} = isSearching ? found : listing;

    const dateFormat = useMemo(
        () => new Intl.DateTimeFormat(uilang || language || undefined, {dateStyle: 'medium', timeStyle: 'short'}),
        [uilang, language]
    );

    const renderContext = useMemo(() => ({t, dateFormat}), [t, dateFormat]);

    const columns = useMemo(() => {
        // A content type's own field can hold anything up to a full rich text body, so it is
        // bounded and scrollable rather than growing the column to fit whatever the longest
        // value happens to be, or wrapping every row to several lines. `path` gets the same
        // treatment: unbounded, a deeply nested site pushes every column after it off screen.
        const fieldColumns = visibleFields.map(field => (field.isDynamic ? {
            key: field.key,
            label: field.label,
            width: '220px',
            isScrollable: true,
            render: ({value}) => renderDynamicField(field, value, renderContext)
        } : {
            key: field.key,
            label: field.label,
            isSortable: Boolean(field.sortProperty),
            width: '160px',
            isScrollable: field.key === 'path',
            render: ({data: row}) => COMMON_RENDERERS[field.key](row, renderContext)
        }));

        return [
            {
                key: 'displayName',
                label: t('label.table.name'),
                isSortable: true,
                render: ({value}) => <span title={value}>{ellipsize(value)}</span>
            },
            ...fieldColumns,
            {
                // Renders jContent's own row menu rather than a copy of it: the same registered
                // action its list view uses, so the entries and their behaviour stay in step for
                // free. It hides while a selection is active, as the list view does, because what
                // applies then is a bulk action on the selection, not an action on one row.
                key: 'actions',
                label: '',
                width: '60px',
                // Without this, clicking the menu also toggles the row's checkbox.
                cellProps: {onClick: event => event.stopPropagation()},
                render: ({data: row}) => (selection.length === 0 ? (
                    <DisplayAction
                        actionKey="contentItemActionsMenu"
                        path={row.path}
                        render={ButtonRendererNoLabel}
                        buttonProps={{variant: 'ghost', size: 'big'}}
                    />
                ) : null)
            }
        ];
    }, [visibleFields, t, renderContext, selection]);

    // Falling back to previousData keeps the table on screen while a page or sort change is in
    // flight, instead of collapsing to a loader and back on every click.
    const current = data || previousData;
    // The two queries return the same shape in different places; past here nothing else cares
    // which one ran.
    const connection = isSearching ? current?.jcr?.nodesByCriteria : current?.jcr?.nodeByPath?.descendants;
    const rows = useMemo(() => (connection?.nodes || []).map(toRow), [connection]);
    const totalItems = connection?.pageInfo?.totalCount || 0;

    if (loading && !current) {
        return <Loader size="big" classNameWrapper={styles.centered}/>;
    }

    if (error) {
        return (
            <Typography className={styles.message} variant="body" data-sel-role="content-error">
                {t('label.contentError')}
            </Typography>
        );
    }

    if (totalItems === 0) {
        return (
            <Typography className={styles.message} variant="body" data-sel-role="content-empty">
                {isSearching ? t('label.noSearchResults', {terms: typed}) : t('label.noContent')}
            </Typography>
        );
    }

    return (
        <div className={styles.tableArea}>
            {/*
                The table's own rows scroll in here; pagination sits outside this box, in its own
                reserved space below, the way jContent's own content list does - a Table plus a
                separate TablePagination sibling, not one component owning both. DataTable's
                bundled pagination has no scroll boundary of its own to anchor to inside a page
                that can grow taller than the viewport, and ended up drawn over the last rows
                instead of pinned below them.
            */}
            <div className={styles.tableScroll}>
                <DataTable
                    enableSorting
                    enableSelection
                    enablePagination={false}
                    className={styles.table}
                    data={rows}
                    columns={columns}
                    primaryKey="uuid"
                    selection={selection}
                    sortBy={sortBy}
                    sortDirection={sortDirection}
                    data-sel-role="content-types-table"
                    rowProps={({data: row}) => ({
                        'data-sel-role': 'content-row',
                        'data-sel-path': row.path
                    })}
                    onChangeSelection={setSelection}
                    onSortChange={(by, direction) => {
                        setSortBy(by);
                        setSortDirection(direction);
                        setCurrentPage(1);
                    }}
                />
            </div>
            <Pagination
                className={styles.tablePagination}
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                itemsPerPageOptions={ITEMS_PER_PAGE_OPTIONS}
                totalOfItems={totalItems}
                data-sel-role="content-types-pagination"
                onPageChange={setCurrentPage}
                onItemsPerPageChange={size => {
                    setItemsPerPage(size);
                    setCurrentPage(1);
                }}
            />
        </div>
    );
};

ContentTypesTable.propTypes = {
    contentType: PropTypes.string.isRequired,
    search: PropTypes.string,
    visibleFields: PropTypes.array
};

ContentTypesTable.defaultProps = {
    search: '',
    visibleFields: []
};

export default ContentTypesTable;
