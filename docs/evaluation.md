# Evaluation protocol

This is how to measure the rule engine. It is not a report of results.

## Offline rules (no network)

From the repo root:

```
cd services/core && go test ./internal/score ./internal/guard ./internal/httpapi
cd services/rdap && javac --release 21 -d build src/sentinel/*.java && java -cp build sentinel.ParseTest
cd apps/web && npx vitest run
```

`go test ./internal/score` includes the paper’s 85-point maximum and the band edges.

## Fixture eval

```
cd services/core && go run ./cmd/eval -fixtures ../../data/eval-fixtures.json
```

The fixtures are synthetic facts, not a labelled crawl. They check that weights still match the paper. They are not a detection rate.

## Live labelled eval (not run)

When a licensed set exists (Hannousse–Yahiouche, or PhishTank/OpenPhish plus a documented legitimate crawl):

1. Map the three-level verdict onto phish vs legitimate with a written decision rule.
2. Report accuracy, precision, recall, F1, and a confusion matrix.
3. Review false negatives by hand.
4. Record class counts and collection dates from the source. Do not guess them.

Until that file exists, this section has no numbers.
