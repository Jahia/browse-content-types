/**
 * The export columns of jContent for the columns the table shows, so that an export starts from
 * what the reader sees. A property column is `prop:<name>`, a standard one `std:<key>`; a column
 * jContent cannot export is left out.
 */
const STANDARD_EXPORT_COLUMNS = {
    type: 'std:type',
    createdBy: 'std:createdBy',
    createdDate: 'std:created',
    lastModifiedBy: 'std:lastModifiedBy',
    lastModified: 'std:lastModified',
    publicationStatus: 'std:publicationStatus',
    tags: 'std:tags',
    categories: 'std:categories',
    path: 'std:path',
    id: 'std:uuid'
};

export const exportColumnsFor = fields => (fields || [])
    .map(field => (field.isDynamic ? `prop:${field.propertyName}` : STANDARD_EXPORT_COLUMNS[field.key]))
    .filter(Boolean);
