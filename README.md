# Browse Content Types

Adds a **Content Types** accordion to jContent: instead of walking the content tree looking for
where records of a type happen to live, you pick the type and get every record of it on the site,
in one sortable, searchable, paginated table.

A Jahia module — JavaScript only, no Java. It extends jContent through the
[`@jahia/ui-extender`](https://www.npmjs.com/package/@jahia/ui-extender) registry and is delivered
as an OSGi bundle built by Maven.

## What it gives you

- **A table per content type**, with the columns you choose — the type's own properties alongside
  the common metadata every node carries, remembered per site and per type in your browser.
- **Search and filter** across a record, or on one named property, composing with each other.
- **Sorting the repository performs**, so a column of numbers sorts as numbers rather than as text.
- **A missing-translations column** that counts, per active language, what a record has not filled
  in — folded into the table's own query, so it costs no extra request.
- **Create a record of the type**, with the picker opening where records of that type already live.
- **jContent's own side panel** on a row — Preview, Details, History, Usages. Not a copy of it: the
  tabs are whatever is registered on `sidePanelTabsActions`, so this screen follows the content
  list when that changes.
- **An administrator setting** choosing which types the accordion lists, stored on the site node so
  everyone working on that site sees the same list.

## Requirements

| | |
|---|---|
| Jahia | 8.2.0.0 or later |
| jContent | installed on the site (`jahia-depends`) |
| Node / Yarn (dev) | v24.12.0 / v1.22.19 — the Maven build installs these itself |

> **The side panel needs a jContent that exports it.** Those exports are added by
> [Jahia/jcontent#2842](https://github.com/Jahia/jcontent/pull/2842), which is not merged at the
> time of writing. The module feature-detects them, so against a jContent without them everything
> else works and the panel is simply not offered. Once that ships, pin the floor in `pom.xml`
> (`<jahia-depends>jcontent=<version></jahia-depends>`).

## Permissions

| Permission | Gates | Granted by default to |
|---|---|---|
| `contentTypesAccordionAccess` | seeing the accordion at all | `editor`, `site-administrator` |
| `siteAdminContentTypes` | the Administration settings page | `site-administrator` |

Both are declared in `src/main/import/permissions.xml` and granted in `roles.xml`, which **merges**
into the roles already present rather than replacing them. Revoke
`contentTypesAccordionAccess` from a role to take the accordion away from it.

## Build and deploy

```bash
mvn clean install          # builds the bundle into target/
```

Deploy the resulting jar through Jahia's Module Management, or drop it in the provisioning folder.

For the front-end alone, without Maven:

```bash
yarn install
yarn build                 # development build
yarn build:production      # what the Maven build runs
yarn watch                 # rebuild on change
```

## Developing

```bash
yarn test                  # jest, jsdom
yarn tdd                   # jest --watch
yarn lint                  # eslint; must be clean
yarn lint:fix
```

`yarn lint`, `yarn test` and `yarn build:production` all run in CI on every push and pull request —
see [`.github/workflows/build.yml`](.github/workflows/build.yml).

### End-to-end tests

The unit specs cover the rules; they cannot tell you whether the accordion renders inside a real
jContent, whether a role can see it, or whether two queries settle in the order the code assumes.
That is [`tests/`](tests/) — a Cypress suite driving a live Jahia, with its own
[README](tests/README.md). It runs nightly and on pull requests via
[`.github/workflows/e2e.yml`](.github/workflows/e2e.yml).

```bash
cd tests && yarn install
JAHIA_URL=http://localhost:8080 SUPER_USER_PASSWORD=root1234 yarn e2e:ci
```

### How it is laid out

| Path | What it holds |
|---|---|
| `src/javascript/init.js` | the module's federated entry; registers on `jahiaApp-init:60` |
| `src/javascript/ContentTypes.register.js` | loads translations, then registers accordion, settings and action overrides |
| `src/javascript/ContentTypes/*.jsx` | the components — route, table, tree, pickers, toolbar |
| `src/javascript/ContentTypes/*.js` | the rules, free of React and Apollo, each with a `.spec.js` |
| `src/main/resources/META-INF/definitions.cnd` | the `ct:` node types |
| `src/main/import/` | permissions and roles |

The `.js` modules are where the decisions live and are tested directly; the `.jsx` files are the
wiring around them. If you are adding logic, put it in a `.js` sibling and test it there.

## Held-back features

Seven features were built, work, and are deliberately not in 1.0. **[`DEFERRED.md`](DEFERRED.md)**
is the map back to them: what each was, which commit removed it, which branch carries it, and what
is worth reworking before it returns.

## Licence

[MIT](LICENSE).
