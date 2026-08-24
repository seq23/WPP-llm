#!/usr/bin/env bash
set -Eeuo pipefail

message="${1:-Run governed workflow}"
workflow_id="${2:-unknown}"
target_branch="${CI_AUTONOMOUS_BRANCH:-main}"
validation_argv="${PRE_PUSH_VALIDATION_ARGV:-npm run release:push-gate}"
install_argv="${PRE_PUSH_INSTALL_ARGV:-bash scripts/ci_npm_install.sh}"
max_attempts="${PUSH_RETRY_ATTEMPTS:-3}"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

validate_exact_commit() {
  local sha tmp
  sha="$(git rev-parse HEAD)"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  git clone --shared --no-checkout . "$tmp/repo" >/dev/null
  git -C "$tmp/repo" checkout --detach "$sha" >/dev/null
  (
    cd "$tmp/repo"
    bash -lc "$install_argv"
    VALIDATED_COMMIT_SHA="$sha" bash -lc "$validation_argv"
    test "$(git rev-parse HEAD)" = "$sha"
  )
  rm -rf "$tmp"
  trap - RETURN
  echo "Exact candidate validated: $sha"
}

git add -A
if git diff --cached --quiet; then
  echo "No governed changes for $workflow_id"
  exit 0
fi
git commit -m "$message"
validate_exact_commit

attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  push_log="$(mktemp)"
  push_status=0
  git push origin "HEAD:$target_branch" 2>"$push_log" || push_status=$?
  cat "$push_log" >&2
  if [ "$push_status" -eq 0 ]; then
    rm -f "$push_log"
    echo "Pushed $workflow_id to $target_branch"
    exit 0
  fi
  if [ "$attempt" -eq "$max_attempts" ]; then
    rm -f "$push_log"
    echo "Push failed after $max_attempts attempts for $workflow_id" >&2
    exit "$push_status"
  fi
  if grep -Eqi '(non-fast-forward|fetch first|remote contains work|tip of your current branch is behind|failed to push some refs.*rejected)' "$push_log"; then
    rm -f "$push_log"
    git fetch origin "$target_branch"
    if ! git rebase "origin/$target_branch"; then
      git rebase --abort || true
      echo "Remote advance could not be reconciled safely; no unvalidated push was attempted" >&2
      exit 1
    fi
    validate_exact_commit
  elif grep -Eqi '(connection reset|connection timed out|could not resolve host|temporary failure in name resolution|remote end hung up|rpc failed|http 5[0-9][0-9]|requested url returned error: 5[0-9][0-9])' "$push_log"; then
    rm -f "$push_log"
    echo "Transient push failure; retrying the already validated commit" >&2
    sleep $((attempt * 2))
  else
    rm -f "$push_log"
    echo "Non-retryable push failure; refusing an unsafe replay" >&2
    exit "$push_status"
  fi
  attempt=$((attempt + 1))
done
