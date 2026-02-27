export const counterAddress = (
  process.env.NEXT_PUBLIC_COUNTER_ADDRESS ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

export const counterAbi = [
  {
    type: "function",
    name: "count",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "increment",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "reset",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "event",
    name: "Incremented",
    inputs: [
      { type: "address", name: "by", indexed: true },
      { type: "uint256", name: "newCount", indexed: false },
    ],
  },
] as const;
