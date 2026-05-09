/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/whisper.json`.
 */
export type Whisper = {
  "address": "6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H",
  "metadata": {
    "name": "whisper",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "commitAndUndelegateTest",
      "discriminator": [
        10,
        201,
        178,
        176,
        91,
        11,
        207,
        100
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "agent"
          ]
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createListing",
      "discriminator": [
        18,
        168,
        45,
        24,
        191,
        31,
        117,
        54
      ],
      "accounts": [
        {
          "name": "supplierAgent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "supplierAgent"
              },
              {
                "kind": "arg",
                "path": "listingId"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "supplierAgent"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "listingId",
          "type": "u64"
        },
        {
          "name": "category",
          "type": {
            "defined": {
              "name": "category"
            }
          }
        },
        {
          "name": "priceLamports",
          "type": "u64"
        },
        {
          "name": "payloadCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "supplierPayloadCid",
          "type": "string"
        },
        {
          "name": "ttlSlot",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegateForPurchase",
      "discriminator": [
        137,
        147,
        118,
        200,
        163,
        14,
        224,
        255
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "buyerAgent"
          ]
        },
        {
          "name": "buyerAgent",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "bufferListing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                82,
                230,
                53,
                179,
                131,
                174,
                153,
                161,
                206,
                210,
                68,
                98,
                51,
                219,
                76,
                157,
                43,
                211,
                31,
                106,
                147,
                76,
                135,
                86,
                52,
                167,
                72,
                2,
                246,
                157,
                70,
                152
              ]
            }
          }
        },
        {
          "name": "delegationRecordListing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataListing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "listingSupplier"
              },
              {
                "kind": "arg",
                "path": "listingId"
              }
            ]
          }
        },
        {
          "name": "listingSupplier"
        },
        {
          "name": "bufferPurchase",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "purchase"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                82,
                230,
                53,
                179,
                131,
                174,
                153,
                161,
                206,
                210,
                68,
                98,
                51,
                219,
                76,
                157,
                43,
                211,
                31,
                106,
                147,
                76,
                135,
                86,
                52,
                167,
                72,
                2,
                246,
                157,
                70,
                152
              ]
            }
          }
        },
        {
          "name": "delegationRecordPurchase",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "purchase"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPurchase",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "purchase"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "purchase",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  117,
                  114,
                  99,
                  104,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "listingId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "delegateTest",
      "discriminator": [
        222,
        26,
        91,
        203,
        49,
        99,
        157,
        160
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferAgent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                82,
                230,
                53,
                179,
                131,
                174,
                153,
                161,
                206,
                210,
                68,
                98,
                51,
                219,
                76,
                157,
                43,
                211,
                31,
                106,
                147,
                76,
                135,
                86,
                52,
                167,
                72,
                2,
                246,
                157,
                70,
                152
              ]
            }
          }
        },
        {
          "name": "delegationRecordAgent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataAgent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "6ac2jbi5FMSj9NQRxzWPgWjbd6WJR7CiaPXxeTW2SW7H"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "delegateTestWithTransfer",
      "discriminator": [
        140,
        10,
        157,
        46,
        168,
        24,
        45,
        67
      ],
      "accounts": [
        {
          "name": "agent",
          "docs": [
            "The delegated test PDA (delegated via delegate_test prior to this call).",
            "Marked mut so the tx is recognized as ER-routable."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "agent"
          ]
        },
        {
          "name": "receiver",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "deliverPayload",
      "discriminator": [
        7,
        71,
        231,
        79,
        172,
        241,
        139,
        104
      ],
      "accounts": [
        {
          "name": "purchase",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  117,
                  114,
                  99,
                  104,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              }
            ]
          }
        },
        {
          "name": "listing",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "listing.supplier",
                "account": "listing"
              },
              {
                "kind": "account",
                "path": "listing.listing_id",
                "account": "listing"
              }
            ]
          }
        },
        {
          "name": "supplierAgent",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "supplierAgent"
          ]
        }
      ],
      "args": [
        {
          "name": "buyerPayloadCid",
          "type": "string"
        }
      ]
    },
    {
      "name": "initPurchaseForDelegation",
      "discriminator": [
        218,
        44,
        206,
        223,
        251,
        110,
        26,
        215
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "buyerAgent"
          ]
        },
        {
          "name": "buyerAgent",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "listing",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "listingSupplier"
              },
              {
                "kind": "arg",
                "path": "listingId"
              }
            ]
          }
        },
        {
          "name": "listingSupplier",
          "docs": [
            "Read-only ref used to derive listing seeds. listing.supplier == listing_supplier.key()."
          ]
        },
        {
          "name": "purchase",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  117,
                  114,
                  99,
                  104,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "listingId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer"
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "purchaseListingPrivate",
      "discriminator": [
        74,
        131,
        23,
        233,
        17,
        173,
        27,
        104
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "buyerAgent"
          ]
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "listing.supplier",
                "account": "listing"
              },
              {
                "kind": "account",
                "path": "listing.listing_id",
                "account": "listing"
              }
            ]
          }
        },
        {
          "name": "purchase",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  117,
                  114,
                  99,
                  104,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              }
            ]
          }
        },
        {
          "name": "buyerAgent",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "purchaseListingPublic",
      "discriminator": [
        52,
        98,
        23,
        61,
        132,
        203,
        243,
        199
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "listing.supplier",
                "account": "listing"
              },
              {
                "kind": "account",
                "path": "listing.listing_id",
                "account": "listing"
              }
            ]
          }
        },
        {
          "name": "purchase",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  117,
                  114,
                  99,
                  104,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              }
            ]
          }
        },
        {
          "name": "buyerAgent",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "supplierAgent",
          "docs": [
            "Supplier Agent (read) — used to resolve the supplier's wallet."
          ]
        },
        {
          "name": "supplierAuthority",
          "docs": [
            "Supplier wallet — receives lamports. Must match supplier_agent.authority."
          ],
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "buyerAgent"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "registerAgent",
      "discriminator": [
        135,
        157,
        66,
        195,
        2,
        113,
        175,
        30
      ],
      "accounts": [
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "handle",
          "type": "string"
        },
        {
          "name": "pubkeyX25519",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "settlePurchase",
      "discriminator": [
        96,
        123,
        151,
        42,
        186,
        39,
        84,
        111
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "buyerAgent"
          ]
        },
        {
          "name": "buyerAgent",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "listing",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "listing.supplier",
                "account": "listing"
              },
              {
                "kind": "account",
                "path": "listing.listing_id",
                "account": "listing"
              }
            ]
          }
        },
        {
          "name": "purchase",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  117,
                  114,
                  99,
                  104,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              }
            ]
          }
        },
        {
          "name": "supplierAgent",
          "docs": [
            "Supplier's Agent (read) — used to resolve supplier_authority."
          ]
        },
        {
          "name": "supplierAuthority",
          "docs": [
            "Supplier's wallet — receives lamports."
          ],
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "submitRating",
      "discriminator": [
        238,
        207,
        253,
        243,
        170,
        69,
        73,
        199
      ],
      "accounts": [
        {
          "name": "purchase",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  117,
                  114,
                  99,
                  104,
                  97,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "listing"
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "listing.supplier",
                "account": "listing"
              },
              {
                "kind": "account",
                "path": "listing.listing_id",
                "account": "listing"
              }
            ]
          }
        },
        {
          "name": "rating",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "purchase"
              }
            ]
          }
        },
        {
          "name": "supplierAgent",
          "writable": true
        },
        {
          "name": "buyerAgent",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "buyerAgent"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "verdict",
          "type": {
            "defined": {
              "name": "verdict"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "agent",
      "discriminator": [
        47,
        166,
        112,
        147,
        155,
        197,
        86,
        7
      ]
    },
    {
      "name": "listing",
      "discriminator": [
        218,
        32,
        50,
        73,
        43,
        134,
        26,
        58
      ]
    },
    {
      "name": "purchase",
      "discriminator": [
        33,
        203,
        1,
        252,
        231,
        228,
        8,
        67
      ]
    },
    {
      "name": "rating",
      "discriminator": [
        203,
        130,
        231,
        178,
        120,
        130,
        70,
        17
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "listingExpired",
      "msg": "Listing has expired (past ttl_slot)"
    },
    {
      "code": 6001,
      "name": "listingNotActive",
      "msg": "Listing is not in Active status"
    },
    {
      "code": 6002,
      "name": "notBuyer",
      "msg": "Signer is not the buyer of this purchase"
    },
    {
      "code": 6003,
      "name": "notSupplier",
      "msg": "Signer is not the supplier of this listing"
    },
    {
      "code": 6004,
      "name": "alreadyDelivered",
      "msg": "Payload has already been delivered"
    },
    {
      "code": 6005,
      "name": "listingIdMismatch",
      "msg": "listing_id does not match supplier's counter"
    },
    {
      "code": 6006,
      "name": "unauthorizedSupplier",
      "msg": "Supplier authority wallet does not match supplier agent"
    },
    {
      "code": 6007,
      "name": "handleTooLong",
      "msg": "Handle exceeds 32 characters"
    },
    {
      "code": 6008,
      "name": "cidTooLong",
      "msg": "CID exceeds 64 characters"
    },
    {
      "code": 6009,
      "name": "notDelivered",
      "msg": "Payload has not been delivered yet"
    },
    {
      "code": 6010,
      "name": "alreadySettled",
      "msg": "Purchase has already been settled"
    },
    {
      "code": 6011,
      "name": "notSettled",
      "msg": "Purchase has not been settled — buyer must pay before delivery"
    },
    {
      "code": 6012,
      "name": "purchaseListingMismatch",
      "msg": "Purchase.listing does not match the Listing PDA passed"
    },
    {
      "code": 6013,
      "name": "priceMismatch",
      "msg": "Purchase.price_paid_lamports does not match Listing.price_lamports"
    }
  ],
  "types": [
    {
      "name": "agent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "handle",
            "type": "string"
          },
          {
            "name": "pubkeyX25519",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "reputationNum",
            "type": "u64"
          },
          {
            "name": "reputationDen",
            "type": "u64"
          },
          {
            "name": "listingsCreated",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "category",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "whale"
          },
          {
            "name": "mev"
          },
          {
            "name": "mint"
          },
          {
            "name": "imbal"
          },
          {
            "name": "insdr"
          },
          {
            "name": "bridge"
          }
        ]
      }
    },
    {
      "name": "listing",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "supplier",
            "type": "pubkey"
          },
          {
            "name": "listingId",
            "type": "u64"
          },
          {
            "name": "category",
            "type": {
              "defined": {
                "name": "category"
              }
            }
          },
          {
            "name": "priceLamports",
            "type": "u64"
          },
          {
            "name": "payloadCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "supplierPayloadCid",
            "type": "string"
          },
          {
            "name": "ttlSlot",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "listingStatus"
              }
            }
          },
          {
            "name": "buyer",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "purchaseSlot",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "listingStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "sold"
          },
          {
            "name": "expired"
          },
          {
            "name": "rated"
          }
        ]
      }
    },
    {
      "name": "purchase",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "pricePaidLamports",
            "type": "u64"
          },
          {
            "name": "buyerPayloadCid",
            "type": "string"
          },
          {
            "name": "purchasedAtSlot",
            "type": "u64"
          },
          {
            "name": "delivered",
            "type": "bool"
          },
          {
            "name": "settled",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "rating",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "purchase",
            "type": "pubkey"
          },
          {
            "name": "rater",
            "type": "pubkey"
          },
          {
            "name": "verdict",
            "type": {
              "defined": {
                "name": "verdict"
              }
            }
          },
          {
            "name": "ratedAt",
            "type": "i64"
          },
          {
            "name": "weight",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "verdict",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "true"
          },
          {
            "name": "false"
          },
          {
            "name": "partial"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "seed",
      "type": "string",
      "value": "\"anchor\""
    }
  ]
};
