#!/bin/sh
unset ELECTRON_RUN_AS_NODE
export JAHIA_URL=http://localhost:8080
export SUPER_USER_PASSWORD=root1234
exec node_modules/.bin/cypress run --browser electron "$@"
