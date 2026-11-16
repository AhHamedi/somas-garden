// Every law and one-off decision an assembly can vote on, with each option
// the engine accepts and the legal range of every parameter. Kept terse:
// labels and ranges, not explanations. Checked against the engine catalogue
// in the tests. {setting} placeholders are filled from the run's settings.

export const STATUTE_GROUPS = [
  { id: "harvest", name: "Harvest", icon: "carrot" },
  { id: "treasury", name: "Treasury", icon: "granary" },
  { id: "borders", name: "Borders", icon: "gate" },
  { id: "power", name: "Power", icon: "hall" },
  { id: "federation", name: "Federation ties", icon: "federation" },
  { id: "charter", name: "Federation charter", icon: "federation" },
];

const RESIDENT = ["Resident", "one resident"];
const MEMBERS = ["Named", "residents, optional"];

export const STATUTES = [
  {
    key: "quota",
    scope: "local",
    group: "harvest",
    icon: "carrot",
    name: "Harvest quota",
    defaultValue: "No limit",
    perResident: true,
    options: [
      { mode: "unlimited", label: "No limit", short: "up to {harvestLimit} a day" },
      { mode: "limited", label: "Quota", short: "N a day", params: ["amount"] },
    ],
    params: {
      amount: ["N", "0–{harvestLimit}"],
      target: ["Resident", "optional personal allowance"],
    },
  },
  {
    key: "enforcement",
    scope: "local",
    group: "harvest",
    icon: "carrot",
    name: "Enforcement",
    defaultValue: "Advisory",
    options: [
      { mode: "soft", label: "Advisory", short: "breaches recorded" },
      { mode: "hard", label: "Hard", short: "blocked at the field" },
    ],
    params: {},
    service: {
      cost: "{enforcementCost} mind per resident a day",
      funded: "hardFunded",
      when: "hard",
    },
  },
  {
    key: "harvestOrder",
    scope: "local",
    group: "harvest",
    icon: "carrot",
    name: "Harvest order",
    defaultValue: "Random",
    options: [
      { mode: "random", label: "Random" },
      { mode: "rotating", label: "Rotating" },
      { mode: "lowestBody", label: "Hungriest first" },
      { mode: "highestInfluence", label: "Influential first" },
    ],
    params: {},
  },
  {
    key: "collection",
    scope: "local",
    group: "harvest",
    icon: "granary",
    name: "Field collection",
    defaultValue: "None",
    options: [
      {
        mode: "fixedBefore",
        label: "Fixed, before",
        short: "N before harvest",
        params: ["amount"],
      },
      {
        mode: "fixedAfter",
        label: "Fixed, after",
        short: "N after harvest",
        params: ["amount"],
      },
      {
        mode: "percentBefore",
        label: "Share, before",
        short: "P% of stock before",
        params: ["percent"],
      },
      {
        mode: "percentAfter",
        label: "Share, after",
        short: "P% of stock after",
        params: ["percent"],
      },
    ],
    params: { amount: ["N", "0+ carrots"], percent: ["P", "0–100"] },
  },
  {
    key: "tax",
    scope: "local",
    group: "treasury",
    icon: "granary",
    name: "Storage tax",
    defaultValue: "None",
    options: [
      {
        mode: "fixed",
        label: "Fixed",
        short: "N a day above E",
        params: ["amount", "exempt"],
      },
      {
        mode: "percent",
        label: "Percentage",
        short: "P% above E",
        params: ["percent", "exempt"],
      },
    ],
    params: {
      amount: ["N", "0+ carrots"],
      percent: ["P", "0–100"],
      exempt: ["E", "0+ carrots kept"],
    },
  },
  {
    key: "holding",
    scope: "local",
    group: "treasury",
    icon: "granary",
    name: "Holding limit",
    defaultValue: "None",
    options: [
      {
        mode: "advisory",
        label: "Advisory",
        short: "published only",
        params: ["amount"],
      },
      {
        mode: "collect",
        label: "Collected",
        short: "excess above N taken",
        params: ["amount"],
      },
    ],
    params: { amount: ["N", "0–{personalCapacity}"] },
  },
  {
    key: "distribution",
    scope: "local",
    group: "treasury",
    icon: "gift",
    name: "Hand-out",
    defaultValue: "None",
    options: [
      {
        mode: "equal",
        label: "Shared",
        short: "N split daily",
        params: ["amount", "members"],
      },
      {
        mode: "perMember",
        label: "Each",
        short: "N each daily",
        params: ["amount", "members"],
      },
      {
        mode: "named",
        label: "One resident",
        short: "N daily",
        params: ["amount", "target"],
      },
    ],
    params: {
      amount: ["N", "0+ carrots"],
      members: MEMBERS,
      target: RESIDENT,
      enabled: ["Standing", "on, or officer scope only"],
    },
  },
  {
    key: "inheritance",
    scope: "local",
    group: "treasury",
    icon: "skull",
    name: "Inheritance",
    defaultValue: "Lost",
    options: [
      { mode: "delete", label: "Lost" },
      { mode: "equal", label: "Shared", short: "among survivors" },
      { mode: "named", label: "Heir", short: "one resident", params: ["target"] },
      { mode: "government", label: "Treasury" },
    ],
    params: { target: RESIDENT },
  },
  {
    key: "entry",
    scope: "local",
    group: "borders",
    icon: "gate",
    name: "Entry",
    defaultValue: "Open",
    options: [
      { mode: "open", label: "Open" },
      { mode: "closed", label: "Closed" },
      { mode: "vote", label: "By vote", short: "per newcomer" },
      { mode: "officer", label: "By officer" },
    ],
    params: { limit: ["Cap", "max residents, optional"] },
  },
  {
    key: "exit",
    scope: "local",
    group: "borders",
    icon: "gate",
    name: "Exit",
    defaultValue: "Free",
    options: [
      { mode: "free", label: "Free" },
      { mode: "notice", label: "Notice", short: "1 day" },
      { mode: "vote", label: "By vote", short: "per departure" },
      { mode: "officer", label: "By officer" },
    ],
    params: {},
  },
  {
    key: "threshold",
    scope: "local",
    group: "power",
    icon: "ballot",
    name: "Threshold",
    defaultValue: "Majority",
    options: [
      { mode: "majority", label: "Majority", short: "> ½ of influence" },
      { mode: "twoThirds", label: "Two thirds", short: "≥ ⅔ of influence" },
    ],
    params: {},
  },
  {
    key: "proposers",
    scope: "local",
    group: "power",
    icon: "scroll",
    name: "Proposers",
    defaultValue: "Anyone",
    options: [
      { mode: "all", label: "Anyone" },
      { mode: "positive", label: "Influential", short: "influence > 0" },
      { mode: "officers", label: "Officers", params: ["members"] },
    ],
    params: { members: MEMBERS },
  },
  {
    key: "influence",
    scope: "local",
    group: "power",
    icon: "influence",
    name: "Influence",
    defaultValue: "{startingInfluence} each",
    perResident: true,
    options: [
      { mode: "", label: "Set", short: "one resident", params: ["target", "influence"] },
    ],
    params: { target: RESIDENT, influence: ["Value", "0–{maxInfluence}"] },
  },
  {
    key: "influenceBasis",
    scope: "local",
    group: "power",
    icon: "influence",
    name: "Influence basis",
    defaultValue: "Voted",
    options: [
      { mode: "voted", label: "Voted", short: "resident by resident" },
      {
        mode: "contribution",
        label: "By contribution",
        short: "{startingInfluence} + 1 per N points",
        params: ["amount", "limit"],
      },
      {
        mode: "contributionOnly",
        label: "Contribution only",
        short: "1 per N points",
        params: ["amount", "limit"],
      },
    ],
    params: {
      amount: ["Points per level", "1 or more"],
      limit: ["Window", "1–10 days"],
    },
  },
  {
    key: "office",
    scope: "local",
    group: "power",
    icon: "crown",
    name: "Officers",
    defaultValue: "None",
    perResident: true,
    options: [
      {
        mode: "appoint",
        label: "Appoint",
        params: ["target", "powers", "members", "limit", "expires", "enabled"],
      },
      { mode: "remove", label: "Remove", params: ["target"] },
    ],
    params: {
      target: RESIDENT,
      powers: [
        "Powers",
        "entry, exit, sanctions, apply sanctions, records, hand-outs, collection, donations, membership, charter",
      ],
      members: ["Scope", "residents, optional"],
      limit: ["Limit", "carrots a day, 0 = none"],
      expires: ["Term", "last day, optional"],
      enabled: ["Self-pay", "yes or no"],
    },
  },
  {
    key: "sanctions",
    scope: "local",
    group: "power",
    icon: "alert",
    name: "Sanctions",
    defaultValue: "None",
    options: [
      { mode: "field", label: "Fines to field", params: ["sanctions"] },
      { mode: "reserve", label: "Fines to treasury", params: ["sanctions"] },
    ],
    params: { sanctions: ["Allowed", "warning, fine, harvest last, expulsion"] },
  },
  {
    key: "records",
    scope: "local",
    group: "power",
    icon: "book",
    name: "Records",
    defaultValue: "Off",
    options: [
      { mode: "on", label: "On" },
      { mode: "off", label: "Off" },
    ],
    params: {},
    service: {
      cost: "{recordsCost} mind per resident a day",
      funded: "recordsFunded",
      when: "on",
    },
  },
  {
    key: "recordAccess",
    scope: "local",
    group: "power",
    icon: "eye",
    name: "Record access",
    defaultValue: "Anyone",
    options: [
      { mode: "all", label: "Anyone" },
      { mode: "officers", label: "Officers" },
      { mode: "named", label: "Named", params: ["members"] },
    ],
    params: { members: MEMBERS },
  },
  {
    key: "representative",
    scope: "local",
    group: "federation",
    icon: "flag",
    name: "Representatives",
    defaultValue: "None",
    perResident: true,
    requires: "federation",
    options: [
      { mode: "appoint", label: "Appoint", params: ["target", "fedPowers", "expires"] },
      { mode: "remove", label: "Remove", params: ["target"] },
    ],
    params: {
      target: RESIDENT,
      fedPowers: ["Powers", "propose, vote"],
      expires: ["Term", "last day, optional"],
    },
  },
  {
    key: "membershipMandate",
    scope: "local",
    group: "federation",
    icon: "federation",
    name: "Membership",
    defaultValue: "Residents",
    options: [
      { mode: "residents", label: "Residents" },
      { mode: "officers", label: "Officers", params: ["members"] },
    ],
    params: { members: MEMBERS },
  },
  {
    key: "charterMandate",
    scope: "local",
    group: "federation",
    icon: "federation",
    name: "Charter approval",
    defaultValue: "Residents",
    options: [
      { mode: "residents", label: "Residents" },
      { mode: "officers", label: "Officers", params: ["members"] },
    ],
    params: { members: MEMBERS },
  },
];

const onOff = (on = {}) => [
  { mode: "on", label: "On", ...on },
  { mode: "off", label: "Off" },
];

/** Federation charter: decided in the council by member plots. */
export const CHARTER = [
  {
    key: "donations",
    name: "Donations",
    icon: "gift",
    defaultValue: "Off",
    options: onOff({ params: ["limit"] }),
    params: { limit: ["Limit", "carrots a day, optional"] },
  },
  {
    key: "gifts",
    name: "Gifts",
    icon: "gift",
    defaultValue: "Off",
    options: onOff(),
    params: {},
  },
  {
    key: "data",
    name: "Stock data",
    icon: "eye",
    defaultValue: "Off",
    options: onOff(),
    params: {},
  },
  {
    key: "sharedRecords",
    name: "Shared records",
    icon: "book",
    defaultValue: "Off",
    options: onOff(),
    params: {},
  },
  {
    key: "recordAccess",
    name: "Record access",
    icon: "eye",
    defaultValue: "Anyone",
    options: [
      { mode: "all", label: "Anyone" },
      { mode: "officers", label: "Officers" },
      { mode: "named", label: "Named", params: ["members"] },
    ],
    params: { members: MEMBERS },
  },
  {
    key: "immigration",
    name: "Immigration",
    icon: "gate",
    defaultValue: "Local rules",
    options: [
      { mode: "restricted", label: "Local rules" },
      { mode: "open", label: "Open passage" },
      {
        mode: "checked",
        label: "Checked",
        short: "sanctions in {immigrationLookback} days",
      },
    ],
    params: {},
  },
  {
    key: "disputes",
    name: "Disputes",
    icon: "ballot",
    defaultValue: "Off",
    options: onOff({ params: ["remedies", "limit"] }),
    params: { remedies: ["Remedies", "warning, transfer"], limit: ["Limit", "carrots"] },
  },
  {
    key: "delegation",
    name: "Delegation",
    icon: "seal",
    defaultValue: "Off",
    options: onOff({ short: "donations without a ballot" }),
    params: {},
  },
].map((c) => ({ ...c, scope: "federation", group: "charter" }));

/** One-off decisions: actions rather than standing laws. */
export const DECISIONS = [
  {
    kind: "found",
    name: "Found a government",
    icon: "hall",
    requires: "noGovernment",
    short: "one vote each, {governmentCost} mind pledged",
  },
  {
    kind: "dissolve",
    name: "Dissolve",
    icon: "hall",
    requires: "government",
    short: "treasury returns to the field",
  },
  {
    kind: "repeal",
    name: "Repeal a law",
    icon: "close",
    requires: "government",
    short: "back to default",
  },
  {
    kind: "removeOffice",
    name: "Remove an officer",
    icon: "crown",
    requires: "government",
  },
  {
    kind: "sanction",
    name: "Sanction",
    icon: "alert",
    requires: "government",
    short: "for a recorded breach",
  },
  {
    kind: "distribution",
    name: "One-off hand-out",
    icon: "gift",
    requires: "government",
    short: "from the treasury",
  },
  { kind: "permitEntry", name: "Admit a newcomer", icon: "gate", requires: "government" },
  {
    kind: "permitExit",
    name: "Release a resident",
    icon: "gate",
    requires: "government",
  },
  {
    kind: "federationFound",
    name: "Form a federation",
    icon: "federation",
    requires: "noFederation",
    short: "{federationCost} mind, {foundingWindow} days",
  },
  {
    kind: "federationJoin",
    name: "Join a federation",
    icon: "federation",
    requires: "noFederation",
    short: "{joiningCost} mind",
  },
  {
    kind: "federationLeave",
    name: "Leave the federation",
    icon: "federation",
    requires: "federation",
    short: "1-day notice",
  },
  {
    kind: "donation",
    name: "Donate",
    icon: "gift",
    requires: "federation",
    short: "to a member plot",
  },
  {
    kind: "ratify",
    name: "Ratify a charter change",
    icon: "scroll",
    requires: "federation",
  },
  {
    kind: "federationAdmit",
    name: "Admit a plot",
    icon: "federation",
    requires: "federation",
    short: "every member plot agrees",
  },
  {
    kind: "dispute",
    name: "Raise a dispute",
    icon: "ballot",
    requires: "federation",
    short: "one vote per plot over five days",
  },
  {
    kind: "federationDissolve",
    name: "Dissolve the federation",
    icon: "federation",
    requires: "federation",
  },
];

export const KIND_TO_STATUTE = {
  policy: (i) => String(i.key || "").split(":")[0],
  repeal: (i) => String(i.key || "").split(":")[0],
  office: () => "office",
  removeOffice: () => "office",
};

/** Fills {setting} placeholders from the run's settings. */
export function fill(text, settings = {}) {
  return String(text || "").replace(/\{(\w+)\}/g, (_, k) => {
    const v = settings[k];
    return v === undefined ? `{${k}}` : String(Math.round(Number(v) * 100) / 100);
  });
}

export function statute(key, scope = "local") {
  return (scope === "federation" ? CHARTER : STATUTES).find((s) => s.key === key) || null;
}

/** The statute a motion is about, when it concerns a standing law. */
export function statuteOfMotion(p) {
  const i = p?.input || {};
  if (i.kind === "federationPolicy" || i.kind === "federationRepeal")
    return statute(String(i.key || "").split(":")[0], "federation");
  const f = KIND_TO_STATUTE[i.kind];
  return f ? statute(f(i), "local") : null;
}
