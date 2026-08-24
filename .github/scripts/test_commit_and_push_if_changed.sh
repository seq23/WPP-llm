#!/usr/bin/env bash
set -Eeuo pipefail

helper="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/commit_and_push_if_changed.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

git init --bare "$tmp/remote.git" >/dev/null
git clone "$tmp/remote.git" "$tmp/writer" >/dev/null 2>&1
git -C "$tmp/writer" config user.name test
git -C "$tmp/writer" config user.email test@example.com
printf '%s\n' base > "$tmp/writer/base.txt"
git -C "$tmp/writer" add base.txt
git -C "$tmp/writer" commit -m base >/dev/null
git -C "$tmp/writer" branch -M main
git -C "$tmp/writer" push -u origin main >/dev/null

git clone --branch main "$tmp/remote.git" "$tmp/concurrent" >/dev/null 2>&1
git -C "$tmp/concurrent" config user.name test
git -C "$tmp/concurrent" config user.email test@example.com
printf '%s\n' remote-advance > "$tmp/concurrent/remote.txt"
git -C "$tmp/concurrent" add remote.txt
git -C "$tmp/concurrent" commit -m remote-advance >/dev/null
git -C "$tmp/concurrent" push origin main >/dev/null

printf '%s\n' local-change > "$tmp/writer/local.txt"
(
  cd "$tmp/writer"
  CI_AUTONOMOUS_BRANCH=main \
  PRE_PUSH_INSTALL_ARGV=true \
  PRE_PUSH_VALIDATION_ARGV='test "$VALIDATED_COMMIT_SHA" = "$(git rev-parse HEAD)"' \
    "$helper" 'local governed change' helper-regression
)

git --git-dir="$tmp/remote.git" show main:remote.txt | grep -qx remote-advance
git --git-dir="$tmp/remote.git" show main:local.txt | grep -qx local-change
test "$(git -C "$tmp/writer" rev-parse HEAD)" = "$(git --git-dir="$tmp/remote.git" rev-parse main)"

(
  cd "$tmp/writer"
  CI_AUTONOMOUS_BRANCH=main PRE_PUSH_INSTALL_ARGV=true PRE_PUSH_VALIDATION_ARGV=true \
    "$helper" 'no-op' helper-regression
)

echo 'commit_and_push_if_changed integration tests: PASS'
