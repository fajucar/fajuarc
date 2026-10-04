export const agenticCommerceAbi = [
  // ── Write ──────────────────────────────────────────────────────────────────
  {
    name: 'createJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'provider',    type: 'address' },
      { name: 'evaluator',   type: 'address' },
      { name: 'expiredAt',   type: 'uint256' },
      { name: 'description', type: 'string'  },
      { name: 'hook',        type: 'bytes'   },
    ],
    outputs: [{ name: 'jobId', type: 'uint256' }],
  },
  {
    name: 'setBudget',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId',     type: 'uint256' },
      { name: 'amount',    type: 'uint256' },
      { name: 'optParams', type: 'bytes'   },
    ],
    outputs: [],
  },
  {
    name: 'fund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId',     type: 'uint256' },
      { name: 'optParams', type: 'bytes'   },
    ],
    outputs: [],
  },
  {
    name: 'submit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId',       type: 'uint256' },
      { name: 'deliverable', type: 'bytes32' },
      { name: 'optParams',   type: 'bytes'   },
    ],
    outputs: [],
  },
  {
    name: 'complete',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId',     type: 'uint256' },
      { name: 'reason',    type: 'string'  },
      { name: 'optParams', type: 'bytes'   },
    ],
    outputs: [],
  },
  // ── Read ───────────────────────────────────────────────────────────────────
  {
    name: 'getJob',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'client',      type: 'address' },
          { name: 'provider',    type: 'address' },
          { name: 'evaluator',   type: 'address' },
          { name: 'budget',      type: 'uint256' },
          { name: 'expiredAt',   type: 'uint256' },
          { name: 'status',      type: 'uint8'   },
          { name: 'description', type: 'string'  },
          { name: 'deliverable', type: 'bytes32' },
        ],
      },
    ],
  },
  // ── Events ─────────────────────────────────────────────────────────────────
  {
    name: 'JobCreated',
    type: 'event',
    inputs: [
      { name: 'jobId',    type: 'uint256', indexed: true  },
      { name: 'client',   type: 'address', indexed: true  },
      { name: 'provider', type: 'address', indexed: true  },
    ],
  },
  {
    name: 'JobFunded',
    type: 'event',
    inputs: [{ name: 'jobId', type: 'uint256', indexed: true }],
  },
  {
    name: 'JobSubmitted',
    type: 'event',
    inputs: [{ name: 'jobId', type: 'uint256', indexed: true }],
  },
  {
    name: 'JobCompleted',
    type: 'event',
    inputs: [{ name: 'jobId', type: 'uint256', indexed: true }],
  },
] as const
