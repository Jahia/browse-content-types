// Entry point used when jahia-ui-root is the host. The module's real entry is ./init, exposed
// through module federation and called by the app shell.
import('@jahia/app-shell/bootstrap').then(res => {
    window.jahia = res;
    res.startAppShell(window.appShell.remotes, window.appShell.targetId);
});
