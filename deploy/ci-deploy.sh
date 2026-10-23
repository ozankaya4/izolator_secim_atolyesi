#!/usr/bin/env bash
set -euo pipefail

operation=${1:-deploy}
[[ "$operation" == deploy || "$operation" == rollback ]]
[[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]]
: "${DEPLOY_HOST:?}" "${DEPLOY_PORT:?}" "${DEPLOY_USER:?}"
: "${DEPLOY_KNOWN_HOSTS:?}" "${DEPLOY_SSH_KEY:?}" "${RUNNER_TEMP:?}"

ssh_dir=$(mktemp -d "$RUNNER_TEMP/izolator-ssh.XXXXXX")
cleanup() {
  rm -- "$ssh_dir/key" "$ssh_dir/known_hosts"
  rmdir -- "$ssh_dir"
}
trap cleanup EXIT
umask 077
printf '%s\n' "$DEPLOY_SSH_KEY" > "$ssh_dir/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
unset DEPLOY_SSH_KEY

log="$RUNNER_TEMP/izolator-$operation.log"
ssh -T -p "$DEPLOY_PORT" -i "$ssh_dir/key" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$ssh_dir/known_hosts" \
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
  "$DEPLOY_USER@$DEPLOY_HOST" "$operation $GITHUB_SHA" | tee "$log"

if [[ "$operation" == deploy ]]; then
  if grep -Fqx "ISOLATOR_DEPLOYED_SHA=$GITHUB_SHA" "$log"; then
    printf 'deployed=true\n' >> "$GITHUB_OUTPUT"
  else
    grep -Fqx "ISOLATOR_SKIPPED_SHA=$GITHUB_SHA" "$log"
    printf 'deployed=false\n' >> "$GITHUB_OUTPUT"
  fi
fi
