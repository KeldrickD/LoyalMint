export type LoyalMint = {
  "version": "0.1.0",
  "name": "loyalmint",
  "instructions": [
    {
      "name": "mintPoints",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "loyaltyAccount",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "redeemPoints",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "loyaltyAccount",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "transferPoints",
      "accounts": [
        {
          "name": "from",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "to",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "fromLoyaltyAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "toLoyaltyAccount",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "loyaltyAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "points",
            "type": "u64"
          }
        ]
      }
    }
  ]
}; 