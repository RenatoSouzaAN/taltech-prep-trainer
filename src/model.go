package main

// Modelo do whisper (v1.6.0): em vez de vir no zip (~57 MB), é baixado na primeira vez do Hugging Face
// (repositório público ggerganov/whisper.cpp) para %APPDATA%\TreinoTalTech\stt-modelo\, com SHA-256 conferido.
// Instalações antigas que já têm stt\ggml-base.en-q5_1.bin ao lado do exe continuam usando esse arquivo.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var (
	modelURL          = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/" + sttModelName
	modelSHA256       = "4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f"
	modelSize   int64 = 59721011
	modelMu     sync.Mutex
)

func modelDir() (string, error) {
	d, err := appDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "stt-modelo"), nil
}

// sttModelPath: primeiro o stt\ ao lado do exe (v1.5), depois o baixado. "" se nenhum.
func sttModelPath() string {
	if p := filepath.Join(sttDir(), sttModelName); fileOK(p, 1<<20) {
		return p
	}
	if d, err := modelDir(); err == nil {
		if p := filepath.Join(d, sttModelName); fileOK(p, 1<<20) {
			return p
		}
	}
	return ""
}

func fileOK(p string, min int64) bool {
	fi, err := os.Stat(p)
	return err == nil && fi.Mode().IsRegular() && fi.Size() >= min
}

// downloadModel baixa para .part, confere tamanho e SHA-256 e só então renomeia.
func downloadModel(prog func(done, total int64)) (any, error) {
	if !modelMu.TryLock() {
		return nil, errors.New("dl:em_andamento")
	}
	defer modelMu.Unlock()
	if p := sttModelPath(); p != "" {
		return map[string]any{"path": p, "already": true}, nil
	}
	d, err := modelDir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(d, 0o755); err != nil {
		return nil, err
	}
	final := filepath.Join(d, sttModelName)
	part := final + ".part"
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Minute)
	defer cancel()
	if err := downloadVerified(ctx, modelURL, part, modelSize, modelSHA256, 200<<20, prog); err != nil {
		os.Remove(part)
		return nil, err
	}
	if err := os.Rename(part, final); err != nil {
		os.Remove(part)
		return nil, err
	}
	return map[string]any{"path": final}, nil
}

var dlClient = &http.Client{Transport: &http.Transport{Proxy: http.ProxyFromEnvironment, ResponseHeaderTimeout: 30 * time.Second, TLSHandshakeTimeout: 20 * time.Second}}

// stallReader cancela o download se ficar 60 s sem receber nada.
type stallReader struct {
	r     io.Reader
	timer *time.Timer
}

func (s *stallReader) Read(p []byte) (int, error) {
	n, err := s.r.Read(p)
	if n > 0 {
		s.timer.Reset(60 * time.Second)
	}
	return n, err
}

// downloadVerified baixa url para dst. size > 0 exige esse tamanho; sha != "" exige esse SHA-256.
// Devolve erros com prefixo dl: para o JS traduzir.
func downloadVerified(ctx context.Context, url, dst string, size int64, sha string, max int64, prog func(done, total int64)) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", appName+"/"+appVersion)
	req.Header.Set("Accept", "application/octet-stream")
	resp, err := dlClient.Do(req)
	if err != nil {
		return netDlErr(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("dl:http: %d", resp.StatusCode)
	}
	total := size
	if total <= 0 {
		total = resp.ContentLength
	}
	if total > max || resp.ContentLength > max {
		return errors.New("dl:grande_demais")
	}
	f, err := os.Create(dst)
	if err != nil {
		return err
	}
	h := sha256.New()
	timer := time.AfterFunc(60*time.Second, cancel)
	defer timer.Stop()
	var done int64
	buf := make([]byte, 256<<10)
	src := &stallReader{r: io.LimitReader(resp.Body, max+1), timer: timer}
	last := time.Time{}
	for {
		n, rerr := src.Read(buf)
		if n > 0 {
			if _, werr := f.Write(buf[:n]); werr != nil {
				f.Close()
				return werr
			}
			h.Write(buf[:n])
			done += int64(n)
			if prog != nil && time.Since(last) > 150*time.Millisecond {
				prog(done, total)
				last = time.Now()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			f.Close()
			return netDlErr(rerr)
		}
	}
	if err := f.Close(); err != nil {
		return err
	}
	if prog != nil {
		prog(done, total)
	}
	if done > max {
		return errors.New("dl:grande_demais")
	}
	if size > 0 && done != size {
		return errors.New("dl:incompleto")
	}
	if sha != "" && hex.EncodeToString(h.Sum(nil)) != sha {
		return errors.New("dl:sha")
	}
	return nil
}

func netDlErr(err error) error {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return errors.New("dl:tempo")
	}
	return fmt.Errorf("dl:offline: %v", err)
}
