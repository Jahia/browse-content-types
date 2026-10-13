// Makes a role change visible to the next request.
//
// Jahia resolves a role's permissions through caches that a direct write to /roles does not
// invalidate: the node changes, and a session that has already asked keeps the old answer. A test
// that revokes a permission and then reloads is otherwise asserting against a stale cache, which
// looks exactly like the gate not working.
//
// Heavy-handed on purpose - this is a test instance, and the alternative is guessing which of the
// caches matters and being subtly wrong about it.
org.jahia.services.cache.CacheHelper.flushAllCaches()
"done"
