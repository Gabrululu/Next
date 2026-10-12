#!/usr/bin/env bash
# Verify the deployed contracts on MonadVision via Sourcify (no API key needed).
# Command and verifier URL from https://docs.monad.xyz/guides/verify-smart-contract/foundry.md
# Usage: (from /contracts, with ../.env loaded) ./script/verify.sh
set -euo pipefail
: "${CHAIN_ID:?}" "${NEXT_ADDRESS:?}" "${NEXT_PASS_ADDRESS:?}"
VERIFIER_URL="${SOURCIFY_VERIFIER_URL:-https://sourcify-api-monad.blockvision.org/}"

forge verify-contract "$NEXT_ADDRESS" src/Next.sol:Next \
  --chain "$CHAIN_ID" --verifier sourcify --verifier-url "$VERIFIER_URL" \
  --constructor-args "$(cast abi-encode 'constructor(uint256)' 300)"

# NextPass was created by Next's constructor with minter = Next
forge verify-contract "$NEXT_PASS_ADDRESS" src/NextPass.sol:NextPass \
  --chain "$CHAIN_ID" --verifier sourcify --verifier-url "$VERIFIER_URL" \
  --constructor-args "$(cast abi-encode 'constructor(address)' "$NEXT_ADDRESS")"
