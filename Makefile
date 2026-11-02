.PHONY: all build test test-ui clean data winres

# Build for Windows from Linux
all: build

build:
	cd src && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-H windowsgui -s -w" -o ../TreinoTalTech.exe

# Regenerate the Windows resources (icon, manifest, version info) from src/winres/winres.json
# Requires: go install github.com/tc-hib/go-winres@latest
winres:
	cd src && go-winres make --in winres/winres.json --arch amd64

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

# Check if required tools are installed
check-deps:
	@command -v go >/dev/null 2>&1 || { echo "Go is not installed"; exit 1; }
	@echo "Go version: $$(go version)"
