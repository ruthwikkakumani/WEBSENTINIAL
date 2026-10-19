# ADR 0002 — Advisory assistant, not a detector

Status: accepted

Do not train a model in this repository until a licensed labelled set is in `data/` and `cmd/eval` has been run. Do not print accuracy, recall, or F1 as if they exist.

Why: the paper forbids fabricated metrics. A fake 97% is a product defect, not a feature.
