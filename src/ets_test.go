package main

import "testing"

func TestEtsHelpers(t *testing.T) {
	if _, err := etsAudio("../x"); err == nil {
		t.Fatal("aceitou chave inválida")
	}
	if _, err := etsAudio("flpt1/../../main"); err == nil {
		t.Fatal("aceitou path traversal")
	}
	for _, bad := range []string{"http://ets.org", "file:///c:/x", "javascript:alert(1)", "https://"} {
		if _, err := safeURL(bad); err == nil {
			t.Fatalf("aceitou %q", bad)
		}
	}
	if u, err := safeURL("https://www.ets.org/toefl.html"); err != nil || u == "" {
		t.Fatal(err)
	}
	if d := etsData(); d != "" {
		if _, err := etsAudio("flpt1/L1_q1"); err != nil {
			t.Fatal(err)
		}
	}
}
