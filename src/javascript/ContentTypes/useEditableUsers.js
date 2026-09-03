import {useMemo} from 'react';
import {useQuery} from '@apollo/client';
import {GET_EDITING_PRINCIPALS, GET_GROUP_MEMBERS, GET_USERS_BY_PATH} from './ContentTypes.gql';
import {editableUsers, editingPrincipals, rolesThatMayEdit, splitPrincipals} from './ContentTypesTasks';

/**
 * Everyone on this site who may be given a task, which is everyone who may change its content.
 *
 * Three round trips, and they cannot be folded into fewer: the site's access control has to answer
 * before it is known which groups need expanding, and a group's members have to be resolved before
 * their names can be read. The second and third are skipped entirely when the first found nothing to
 * expand, which on a site that grants its roles to users directly is the common case.
 *
 * Nothing here is per-keystroke. The whole set is fetched once and the typed term filters it in the
 * browser - a site has a handful of editors, not thousands, and searching a list that is already in
 * hand is instant where a query per keystroke is not. See `matchesTerm`.
 */
export const useEditableUsers = (siteKey, {skip = false} = {}) => {
    const {data, loading, error} = useQuery(GET_EDITING_PRINCIPALS, {
        variables: {sitePath: `/sites/${siteKey}`},
        skip: skip || !siteKey
    });

    // Which principals hold a role that can actually write, split into those who are people and
    // those who stand for a set of people.
    const {users: directPrincipals, groups} = useMemo(() => {
        const roles = data?.jcr?.roles?.descendants?.nodes;
        const entries = data?.jcr?.site?.acl?.aclEntries;
        return splitPrincipals(editingPrincipals(entries, rolesThatMayEdit(roles)));
    }, [data]);

    // The ACL gives a path but not the names a colleague is recognised by, so the user nodes are
    // read for those.
    const userPaths = useMemo(() => directPrincipals.map(user => user.path), [directPrincipals]);
    const {data: userData, loading: usersLoading} = useQuery(GET_USERS_BY_PATH, {
        variables: {paths: userPaths},
        skip: skip || userPaths.length === 0
    });

    const groupPaths = useMemo(() => groups.map(group => group.path), [groups]);
    const {data: groupData, loading: groupsLoading} = useQuery(GET_GROUP_MEMBERS, {
        variables: {paths: groupPaths},
        skip: skip || groupPaths.length === 0
    });

    const users = useMemo(() => {
        const readUser = node => node && ({
            name: node.name,
            path: node.path,
            firstName: node.firstName?.value,
            lastName: node.lastName?.value
        });

        const direct = (userData?.jcr?.nodesByPath || []).map(readUser).filter(Boolean);

        // A group may hold other groups, and their members are members of it too. Only people are
        // kept: a task is given to a person, and a nested group's own members are not reachable
        // without asking about that group in turn - which is a depth this deliberately does not go
        // to, since a group of groups is rare and the direct members are the honest answer.
        const fromGroups = (groupData?.jcr?.nodesByPath || [])
            .flatMap(group => group.members?.nodes || [])
            .map(member => member.member?.refNode)
            .filter(node => node?.primaryNodeType?.name === 'jnt:user')
            .map(readUser);

        return editableUsers(direct, fromGroups);
    }, [userData, groupData]);

    return {
        users,
        loading: loading || usersLoading || groupsLoading,
        error
    };
};

export default useEditableUsers;
