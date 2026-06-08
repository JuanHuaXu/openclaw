## 2026-06-08 - Node stdin argument order

- Category: error
- Context: A one-off JSONL repair command used `node <<'NODE' "$SESSION"`, causing Node to treat the JSONL path as the script.
- Evidence: Node failed with `ERR_UNKNOWN_FILE_EXTENSION` for the `.jsonl` session file.
- Lesson: When passing arguments to inline Node scripts, use `node - "$arg" <<'NODE'` so stdin is the script and later values are arguments.
- Scope: Project-local.
