# browse-content-types — end-to-end suite

Cypress tests that drive the Content Types accordion inside a **live** jContent. They exist because
the module's whole value is a surface wired into another product's registry: the unit specs cover
the rules, and nothing below this level can tell you whether the accordion renders, whether a role
can see it, or whether two queries settle in the order the code assumes.

## What is covered

| Spec | What it says |
|---|---|
| `accordion.cy.ts` | the accordion renders without throwing, lists the site's editorial types, opens on one of them, and is shown or hidden according to `contentTypesAccordionAccess` |
| `listing.cy.ts` | selecting a type lists every record of it **and only of it**, switching types switches the listing, an empty type is not an error |
| `columns.cy.ts` | a type's own properties are offered as columns, a ticked column draws its values, the choice persists and resets — and a corrupt stored choice does not blank the pane |
| `search.cy.ts` | a term narrows the listing, a mid-word fragment matches, `_` is a character rather than a wildcard, a short term says so |
| `settings.cy.ts` | the administrator's choice narrows the accordion and holds on reopen, and an empty choice means "list everything" |

Several of these are regression cover for defects found in review: the route crashing on a jContent
without the side-panel exports, the accordion being visible whatever an administrator revoked, the
tree navigating to an excluded type on a cached first render, and a non-array in `localStorage`
blanking the screen permanently.

## Running them

Needs a Jahia with `jcontent`, this module, and `tests/jahia-module` deployed.

```bash
yarn install

# against a local instance
JAHIA_URL=http://localhost:8080 SUPER_USER_PASSWORD=root1234 yarn e2e:ci

# interactive
JAHIA_URL=http://localhost:8080 SUPER_USER_PASSWORD=root1234 yarn e2e:debug
```

`JAHIA_URL` and `SUPER_USER_PASSWORD` are read by the `@jahia/cypress` plugin, which sets Cypress's
`baseUrl` and `env` from them. They default to `http://localhost:8080` and `root1234`.

> **Node ≥ 20.19.** `@jahia/cypress` 8.x pulls `@faker-js/faker` v10, which refuses to install on
> anything older — and the failure reads like a repository problem rather than a toolchain one.

## The test module

`tests/jahia-module` is a template set shipping two content types, `bctnt:product` and
`bctnt:supplier`. They exist so the suite has something to browse that the product does not ship —
and `bctnt:product` deliberately declares one property of each **shape** the column catalog branches
on: a number, a date, a multi-valued string, a choicelist, and an internationalized text. A suite
built on whatever types happened to be installed would exercise one branch and look thorough.

Build and deploy it the same way as the module under test.

## Provisioning

| File | Used by |
|---|---|
| `provisioning-manifest-build.yml` | a pull request — only external deps; the two modules are built by the pipeline |
| `provisioning-manifest-snapshot.yml` | a nightly — everything resolved from Nexus |
| `assets/dependencies.yml` | the external modules both variants need |

## Where this stands

Run against Jahia 8.2.3.0 (Discovery) with jcontent 3.7.2. Best full-suite run: **17 of 24**, with
`listing` (6/6), `search` (5/5) and `settings` (3/3) all green together; `columns` has reached 5/6
and `accordion` 3/4 on their own.

Two things are known and are **not** module defects:

- **The permission REVOKE test is pending, and not because the gate is in doubt.** Confirmed on a
  live instance: the permission is registered under
  `/modules/browse-content-types/<version>/permissions/jContent/jContentAccordions/`, next to
  jContent's own four `*AccordionAccess` permissions - module permissions live there, not under the
  core `/permissions` tree - and the `editor` role carries the grant. The positive direction passes.
  What does not work is revoking: writing `j:permissionNames` persists (read back, it is gone) and
  the next request still behaves as though it were there, through a fresh login, three reloads,
  `CacheHelper.flushAllCaches()` and a full container restart. The likely answer is to drive the
  change through the roles administration screen so the product re-saves the role itself.
- **A second backend user can hit a licence ceiling.** Seen once: jContent answered a 503 licence
  page rather than refusing the login, which renders as no accordion and would make the negative
  test pass for the wrong reason. The spec probes for it and skips with the reason logged; on a
  healthy instance it does not trip.
- **The first spec of a run is flaky on a cold instance.** The accordion is a federated bundle
  loading against a site created seconds earlier; when the first load lands before the registry,
  the site's module list and jContent's start-up agree, the screen stays empty with no error to
  retry against. `openAccordion` reloads up to twice before giving up, which covers most of it. A
  dedicated instance per run - what the CI workflow does - is the real answer.

### Environment traps this suite already pays for

Each of these fails **silently**, and each looks exactly like a module bug:

| Trap | What you see |
|---|---|
| A content type without `jmix:droppableContent` | fixtures fail, every table renders empty |
| An upper-case site key | the site is created and healthy, and the accordion never opens on it |
| A site server name other than `localhost` | same: the accordion never opens |
| `cy.session` on every navigation | it clears `localStorage`, so the columns picker "forgets" a choice it saved correctly |
| `ELECTRON_RUN_AS_NODE=1` (VS Code terminals) | Cypress will not start: `bad option: --smoke-test` |

`run.sh` unsets that last one and sets the instance variables, so `./run.sh` is the way to run this
locally.

## Conventions

Site-per-suite: every spec creates its own site in `before()` and deletes it in `after()`, so runs
are idempotent and specs cannot see each other's content.

Selectors are the `data-sel-*` attributes the module sets on purpose — never a class or a DOM shape,
both of which belong to Moonstone and move with it. If one stops matching, the module dropped a
hook, and that is worth failing on rather than routing around with a cleverer selector.
