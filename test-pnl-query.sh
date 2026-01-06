#!/bin/bash

# Test query for PNL subgraph
# Replace the address with a real Polymarket user address to test

ENDPOINT="https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/pnl-subgraph/0.0.14/gn"
ADDRESS="0x1234567890123456789012345678901234567890" # Replace with real address

QUERY='{
  "query": "query GetUserPositions($address: Bytes!) { userPositions(where: { user: $address }, first: 5) { id user conditionId amount0 amount1 lpShares netDeposits netWithdrawals realizedPnl unrealizedPnl } }",
  "variables": {
    "address": "'$ADDRESS'"
  }
}'

echo "Testing PNL subgraph query for address: $ADDRESS"
echo "Endpoint: $ENDPOINT"
echo ""

curl -X POST \
  -H "Content-Type: application/json" \
  -d "$QUERY" \
  "$ENDPOINT" | jq .

echo ""
echo "To test with a different address, modify the ADDRESS variable in this script"