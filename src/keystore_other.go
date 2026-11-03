//go:build !windows

package main

import "errors"

// Fora do Windows (só testes/desenvolvimento): sem DPAPI. Ofusca para o arquivo nunca ter a chave
// em texto puro, mas NÃO é proteção real; o app de verdade só roda no Windows.
const keystoreSecure = false

var xorPad = []byte("TreinoTalTech-not-secure-test-only")

func protectData(plain []byte) ([]byte, error) {
	out := append([]byte("TTX1"), plain...)
	for i := 4; i < len(out); i++ {
		out[i] ^= xorPad[(i-4)%len(xorPad)]
	}
	return out, nil
}

func unprotectData(enc []byte) ([]byte, error) {
	if len(enc) < 4 || string(enc[:4]) != "TTX1" {
		return nil, errors.New("formato inválido")
	}
	out := append([]byte(nil), enc[4:]...)
	for i := range out {
		out[i] ^= xorPad[i%len(xorPad)]
	}
	return out, nil
}
