.PHONY: all build build-wasm dev test test-go test-js lint format typecheck clean install

all: build

install:
	npm ci

build-wasm:
	./build-wasm.sh

build: install build-wasm
	npm run build

dev: install build-wasm
	npm run dev

test-go:
	cd wasm && go test ./...

test-js: install
	npm test

test: test-go test-js

lint:
	npm run lint

format:
	npm run format

typecheck:
	npm run typecheck

clean:
	rm -rf dist node_modules public/pdf.wasm
