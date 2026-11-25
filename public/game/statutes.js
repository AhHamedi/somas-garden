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
      "Plots choose what share of the tokens cast must support a rule change. The current threshold also applies to a vote to change the threshold itself.",
    options: [
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
        mode: "restraint",
        label: "Reward harvesting less",
        short:
          "Divide the bonus limit by yesterday’s harvest, using 1 for a zero harvest. Round down.",
        params: ["amount", "limit"],
      },
      {
        mode: "participation",
        label: "Reward participation",
        short: "Every Yes or No ballot counts once, whichever side wins.",
        params: ["amount", "limit"],
      },
    ],
    params: {
      amount: ["Base grant", "1 to 10,000 tokens per resident"],
      limit: [
        "Bonus rate",
        "For harvest restraint, the maximum bonus (1–10,000). For participation, the number of ballots per bonus token (at least 1).",
      ],
    },
  },
].map((rule) => ({ ...rule, scope: "local" }));

export const hasTokenOnlyVoting = (s) => !(s?.version > 0 && s.version < 8);
export const usesLegacyRules = (s) =>
  s?.legacyRules === true || (s?.version > 0 && s.version < 7);
export const defaultTallyBasis = (s) =>
  hasTokenOnlyVoting(s) ? "tokens" : s.settings?.ruleThreshold || "voters";

// Historical snapshots show the rules that applied when their ballots were cast.
export function statuteForVersion(st, s) {
  if (st?.key === "threshold" && !hasTokenOnlyVoting(s))
    return {
      ...st,
      description:
        "Plots choose what share must support a rule change and whether to count eligible residents or tokens cast.",
      options: [
        {
          mode: "voters",
          label: "Eligible voters",
          short: "One resident counts once",
          params: ["amount"],
        },
        ...st.options,
      ],
    };
  if (st?.key !== "tokenAllocation" || !usesLegacyRules(s)) return st;
  return {
    ...st,
    options: [
      st.options[0],
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
      ...st.params,
      limit: ["Bonus rate", "Whole carrots or aligned votes per additional token"],
    },
  };
}

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
