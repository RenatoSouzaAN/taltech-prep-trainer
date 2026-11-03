// Abrir pastas no Explorer: preparação do caminho e ordem das tentativas (testável fora do Windows).
package main

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var winEnvRe = regexp.MustCompile(`%([A-Za-z_][A-Za-z0-9_()]*)%`)

// expandWinEnv troca %VAR% (estilo Windows) pelo valor da variável; desconhecidas ficam como estão.
func expandWinEnv(p string) string {
	return winEnvRe.ReplaceAllStringFunc(p, func(m string) string {
		if v, ok := os.LookupEnv(m[1 : len(m)-1]); ok && v != "" {
			return v
		}
		return m
	})
}

// prepareFolder devolve o caminho absoluto e limpo de uma pasta que existe (criando-a se create).
func prepareFolder(dir string, create bool) (string, error) {
	dir = strings.TrimSpace(expandWinEnv(dir))
	if dir == "" || winEnvRe.MatchString(dir) {
		return "", errors.New("pasta:invalida")
	}
	abs, err := filepath.Abs(filepath.FromSlash(dir))
	if err != nil {
		return "", errors.New("pasta:invalida")
	}
	abs = filepath.Clean(abs)
	if create {
		if err := os.MkdirAll(abs, 0o755); err != nil {
			return "", errors.New("pasta:criar: " + err.Error())
		}
	}
	st, err := os.Stat(abs)
	if err != nil {
		if os.IsNotExist(err) {
			return "", errors.New("pasta:nao_existe")
		}
		return "", errors.New("pasta:abrir: " + err.Error())
	}
	if !st.IsDir() {
		return "", errors.New("pasta:nao_e_pasta")
	}
	return abs, nil
}

// openFolderWith tenta ShellExecute "explore", depois "open" e por fim explorer.exe (só iniciado,
// sem olhar o código de saída: o explorer.exe sai com 1 mesmo quando abre a janela).
func openFolderWith(dir string, create bool, shellExec func(verb, path string) error, startExplorer func(path string) error) error {
	p, err := prepareFolder(dir, create)
	if err != nil {
		return err
	}
	var errs []string
	for _, verb := range []string{"explore", "open"} {
		if err := shellExec(verb, p); err == nil {
			return nil
		} else {
			errs = append(errs, verb+": "+err.Error())
		}
	}
	if err := startExplorer(p); err == nil {
		return nil
	} else {
		errs = append(errs, "explorer.exe: "+err.Error())
	}
	return errors.New("pasta:abrir: " + strings.Join(errs, "; "))
}
