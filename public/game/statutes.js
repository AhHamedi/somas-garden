// Votable local rules and institution decisions, shared by the assembly and rulebook.
export const STATUTE_GROUPS = [
  { id: "harvest", name: "Harvest", icon: "carrot" },
  { id: "voting", name: "Voting", icon: "ballot" },
];

export const STATUTES = [
  {
    key: "harvestOrder",
    group: "harvest",
    icon: "carrot",
    name: "Harvest order",
    defaultValue: "Resident rankings",
    description:
      "Each active resident may submit a complete ordering of their plotmates, including themselves. In a plot of four, each ballot awards 3, 2, 1 and 0 points in order. The highest total harvests first. A seeded draw breaks ties, and Justice can move a sanctioned resident to the back.",
    options: [
      { mode: "ranked", label: "Resident rankings" },
      { mode: "random", label: "Random order" },
    ],
    params: {},
  },
  {
    key: "quota",
    group: "harvest",
    icon: "scroll",
    name: "Harvest quota",
    defaultValue: "No quota",
    description:
      "Residents may agree on an advisory daily allowance. A resident can take more if carrots and space are available. Justice can review the public breach.",
    options: [
      { mode: "unlimited", label: "No quota" },
      { mode: "limited", label: "Advisory quota", params: ["amount"] },
    ],
    params: { amount: ["Carrots per resident", "Zero or more whole carrots per day"] },
  },
  {
    key: "threshold",
    group: "voting",
    icon: "ballot",
    name: "Rule threshold",
    defaultValue: "World setting",
    description:
      "Plots choose how to count support for adopting or repealing a rule. The current threshold applies to the vote that changes it.",
    options: [
      {
        mode: "voters",
        label: "Eligible voters",
        short: "One resident counts once",
        params: ["amount"],
      },
      {
        mode: "tokens",
        label: "Tokens cast",
        short: "Each spent token counts once",
        params: ["amount"],
      },
    ],
    params: {
      amount: [
        "Required fraction",
        "A fraction from above zero to one. Support must exceed it, or be unanimous at one.",
      ],
    },
  },
  {
    key: "tokenAllocation",
    group: "voting",
    icon: "ballot",
    name: "Voting token allocation",
    defaultValue: "Equal daily grant",
    description:
      "Voting weight sets the number of tokens issued to a resident. Residents choose which proposals to spend them on.",
    options: [
      { mode: "equal", label: "Equal daily grant", params: ["amount"] },
      {
        mode: "productivity",
        label: "Reward productivity",
        short: "Previous day's harvest",
        params: ["amount", "limit"],
      },
      {
        mode: "alignment",
        label: "Reward alignment",
        short: "Votes matching the previous day's decisions",
        params: ["amount", "limit"],
      },
    ],
    params: {
      amount: ["Base grant", "1 to 10,000 tokens per resident"],
      limit: [
        "Bonus rate",
        "Positive whole units of harvest or aligned votes per additional token",
      ],
    },
  },
].map((rule) => ({ ...rule, scope: "local" }));

export const DECISIONS = [
  {
    kind: "found",
    name: "Found a government",
    icon: "hall",
    requires: "noGovernment",
    short: "Residents vote to form a local assembly and pledge its founding cost.",
  },
  {
    kind: "dissolve",
    name: "Dissolve the government",
    icon: "hall",
    requires: "government",
    short: "End local rules and departmental powers.",
  },
  {
    kind: "repeal",
    name: "Repeal a rule",
    icon: "scroll",
    requires: "government",
    short: "Return a local rule to its default under the current rule threshold.",
  },
  {
    kind: "elect",
    name: "Elect a department holder",
    icon: "crown",
    requires: "government",
    short:
      "Choose a resident for Justice or Trade. Justice decides sanctions. Trade receives donations and gives carrots to residents or another plot’s representative.",
  },
  {
    kind: "revoke",
    name: "Revoke a department role",
    icon: "close",
    requires: "government",
    short: "Residents can remove the holder of Justice or Trade by vote.",
  },
];

export const fill = (value, settings = {}) =>
  String(value || "").replace(
    /\{(\w+)\}/g,
    (placeholder, key) => settings[key] ?? placeholder,
  );
export const statute = (key, scope = "local") =>
  scope === "local" ? STATUTES.find((rule) => rule.key === key) || null : null;
export const statuteOfMotion = (motion) =>
  ["policy", "repeal"].includes(motion?.input?.kind) ? statute(motion.input.key) : null;
