Local fork of github.com/jchv/go-webview2 v0.0.0-20260205173254-56598839c808 (MIT, see LICENSE).
Changes for TreinoTalTech:
1. pkg/edge/chromium.go PermissionRequested: GetPermissionKind now receives &kind (upstream passed
   the value, so the requested kind was always read as 0 and per-kind permissions never matched).
2. treinotaltech_fork.go: exported ChromiumOf(WebView) to reach SetPermission and
   ICoreWebView2_3.SetVirtualHostNameToFolderMapping.
3. Removed cmd/ (demo).
