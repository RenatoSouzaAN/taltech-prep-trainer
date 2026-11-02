.PHONY: all build test clean data

# Build for Windows from Linux
all: build

build:
	cd src && GOOS=windows GOARCH=amd64 go build -ldflags="-H windowsgui" -o ../TreinoTalTech.exe

# Generate data.json from Python script
data:
	python3 build_data.py > src/data.json

# Run Go tests
test:
	cd src && go test -v

# Run UI tests (requires Node.js, puppeteer-core, and Chrome)
test-ui:
	cd src && node ui_test.js

# Clean build artifacts
clean:
	rm -f TreinoTalTech.exe
	rm -f src/rsrc_windows_amd64.syso

# Check if required tools are installed
check-deps:
	@command -v go >/dev/null 2>&1 || { echo "Go is not installed"; exit 1; }
	@echo "Go version: $$(go version)"
