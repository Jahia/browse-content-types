import i18next from 'i18next';
import registerContentTypesAccordion from './ContentTypes/registerContentTypesAccordion';
import registerContentTypesBulkActions from './ContentTypes/registerContentTypesBulkActions';
import registerContentTypesSettings from './ContentTypes/registerContentTypesSettings';

export const NAMESPACE = 'browse-content-types';

export default async function () {
    // Awaited before registering: jContent draws the accordion label with its own `t`, bound to
    // the jcontent namespace, so the "content-types:" prefix only resolves once this namespace is
    // loaded. Register first and the accordion shows its raw key.
    await i18next.loadNamespaces(NAMESPACE);

    registerContentTypesAccordion();
    registerContentTypesBulkActions();
    registerContentTypesSettings();
}
