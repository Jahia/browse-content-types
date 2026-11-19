# Moonstone CollectionBar, copied

`CollectionBar` and the hooks it needs, copied from [Jahia/moonstone#1625](https://github.com/Jahia/moonstone/pull/1625) at `0a6dc096`. No Moonstone release has them yet, and the app shell shares its own Moonstone with every module, so the module bundles this copy.

The selector has an apply button, which Moonstone does not have: it shows when `i18n.applyButton` is set, and closes the selector with the reason `applyButton`.

The other changes from the source are the imports only:

- `Button`, `Menu`, `MenuItem`, `Tooltip`, `Typography` and the icons come from the shared `@jahia/moonstone`.
- `useControllableState`, `useRovingTabIndex` and `mergeHandlers` are copied in `hooks/`: Moonstone does not export its hooks.
- `layout.module.scss` is Moonstone's `globals/_layout.module.scss`.
- The tests and the stories stay in Moonstone.

Delete this folder when the module requires a Moonstone version that contains `CollectionBar`, and import it from `@jahia/moonstone`.
