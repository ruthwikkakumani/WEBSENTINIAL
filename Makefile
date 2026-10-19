.PHONY: test test-go test-java build-web

test: test-go test-java test-web test-eval

test-eval:
	cd services/core && go run ./cmd/eval -fixtures ../../data/eval-fixtures.json

test-web:
	cd apps/web && npm test

test-go:
	cd services/core && go test ./...

test-java:
	cd services/rdap && javac --release 21 -d build src/sentinel/*.java && java -cp build sentinel.ParseTest

build-web:
	cd apps/web && npm install && npm run build
