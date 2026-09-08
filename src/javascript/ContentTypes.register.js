import i18next from 'i18next';
import registerContentTypesAccordion from './ContentTypes/registerContentTypesAccordion';
import registerContentTypesBulkActions from './ContentTypes/registerContentTypesBulkActions';
import registerContentTypesSettings from './ContentTypes/registerContentTypesSettings';

export const NAMESPACE = 'content-types';

export default async function () {
    /*
     * Awaited before registering: jContent draws the accordion label with its own `t`, bound to
     * the jcontent namespace, so the "content-types:" prefix only resolves once this namespace is
     * loaded. Register first and the accordion shows its raw key.
     *
     * `jcontent` is loaded alongside because this module borrows several of its strings rather than
     * starting a second set of translations for words jContent already has - the create button's
     * "New {{typeName}}", and the selection bar's actions. Borrowing them only works while that
     * namespace happens to be loaded for the current language, which is jContent's business and not
     * something to rely on: asking for it here makes the borrowing hold on its own terms rather
     * than on load order.
     */
    await i18next.loadNamespaces([NAMESPACE, 'jcontent']);

    registerContentTypesAccordion();
    registerContentTypesBulkActions();
    registerContentTypesSettings();
}
