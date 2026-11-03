//go:build windows
// +build windows

package webview2

import "github.com/jchv/go-webview2/pkg/edge"

// ChromiumOf returns the underlying *edge.Chromium of a WebView created by
// this package, or nil. Added by the TreinoTalTech local fork (see FORK.md).
func ChromiumOf(w WebView) *edge.Chromium {
	if v, ok := w.(*webview); ok {
		if c, ok := v.browser.(*edge.Chromium); ok {
			return c
		}
	}
	return nil
}
