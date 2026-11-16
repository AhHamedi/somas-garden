// Plain-language reading of observer snapshots. Pure functions only: the world
// renderer and every panel take their words and derived numbers from here, so
// the same rule is never described two different ways.

export const PHASES = [
  { id: "environment", name: "Dawn", verb: "Weather and growth" },
  { id: "movement", name: "Migration", verb: "Choosing a home" },
  { id: "harvest", name: "Harvest", verb: "Gathering carrots" },
  { id: "proposals", name: "Motions", verb: "Tabling proposals" },
  { id: "voting", name: "Vote", verb: "Assemblies vote" },
  { id: "transfers", name: "Exchange", verb: "Officers and gifts" },
  { id: "eating", name: "Supper", verb: "Eating and thinking" },
  { id: "close", name: "Night", verb: "The day closes" },
];
export const WEATHER = ["Sunny", "Cloudy", "Dark"];
export const TEAM_COLORS = [
  "#62c3a0",
  "#9d8ff0",
  "#f2a65a",
  "#58b6e6",
  "#ef7c9c",
  "#d4cf58",
];

export const phaseIndex = (phase) => PHASES.findIndex((p) => p.id === phase);
export const fmt = (value, decimals = 0) =>
  Number(value || 0).toLocaleString("en-GB", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
export const lcFirst = (t) => String(t).replace(/^./, (c) => c.toLowerCase());
export const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

export function teamColor(team) {
  return TEAM_COLORS[
    ((team % TEAM_COLORS.length) + TEAM_COLORS.length) % TEAM_COLORS.length
  ];
}

/** Indexes a snapshot once so panels never search 300 agents repeatedly. */
export function indexSnapshot(s) {
  const agents = new Map(s.agents.map((a) => [a.id, a]));
  const plots = new Map(s.plots.map((p) => [p.id, p]));
  const residents = new Map(s.plots.map((p) => [p.id, []]));
  residents.set(-1, []);
  for (const a of s.agents)
    if (a.alive) (residents.get(a.plot) || residents.get(-1)).push(a);
  const roles = new Map();
  for (const p of s.plots) {
    for (const [id, office] of Object.entries(p.officers || {})) {
      const r = roles.get(Number(id)) || [];
      const powers = office.powers || [];
      const civic = powers.filter((x) => !x.startsWith("federation"));
      if (civic.length) r.push({ kind: "officer", plot: p.id, office });
      if (powers.some((x) => x.startsWith("federation")))
        r.push({ kind: "representative", plot: p.id, office });
      roles.set(Number(id), r);
    }
    for (const [key, rule] of Object.entries(p.rules || {})) {
      const [base, target] = key.split(":");
      if (base !== "representative" || target === undefined) continue;
      const id = Number(target);
      const r = roles.get(id) || [];
      if (!r.some((x) => x.kind === "representative" && x.plot === p.id))
        r.push({ kind: "representative", plot: p.id, office: rule });
      roles.set(id, r);
    }
  }
  const federations = new Map(
    (s.federations || []).filter((f) => !f.dissolved).map((f) => [f.id, f]),
  );
  return { s, agents, plots, residents, roles, federations };
}

export function agentName(ix, id) {
  id ??= 0; // Go omits zero-valued targets
  return ix.agents.get(Number(id))?.name || `Resident ${Number(id) + 1}`;
}
export function plotName(ix, id) {
  if (Number(id) < 0) return "the wilds";
  return ix.plots.get(Number(id))?.name || `Plot ${String.fromCharCode(65 + Number(id))}`;
}
export function plotLetter(p) {
  return String(p.name || "").replace(/^Plot\s*/i, "") || String.fromCharCode(65 + p.id);
}
export function dayLabel(s, absoluteDay) {
  const days = s.settings.days;
  const month = Math.floor((absoluteDay - 1) / days) + 1;
  const day = ((absoluteDay - 1) % days) + 1;
  return month === s.month ? `day ${day}` : `month ${month}, day ${day}`;
}
export const absoluteToday = (s) => s.absoluteDay;

// ---------------------------------------------------------------------------
// Laws

const POWER_NAMES = {
  entry: "approve newcomers",
  exit: "approve departures",
  sanctions: "judge sanctions",
  applySanction: "apply sanctions",
  records: "read records",
  distribution: "hand out reserves",
  collection: "collect carrots",
  donation: "send donations",
  federationPropose: "propose in the federation",
  federationVote: "vote in the federation",
  membership: "decide membership",
  charter: "approve charter changes",
  warning: "warnings",
  fine: "carrot fines",
  lastPlace: "harvest-last penalties",
  expulsion: "expulsion",
};
export const powerName = (p) => POWER_NAMES[p] || humanise(p);
export function humanise(v) {
  return String(v || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .toLowerCase();
}
const listText = (items) =>
  items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

export const LAW_GROUPS = [
  { id: "harvest", name: "Harvest and land", icon: "carrot" },
  { id: "treasury", name: "Treasury", icon: "granary" },
  { id: "borders", name: "Borders", icon: "gate" },
  { id: "power", name: "Power and office", icon: "hall" },
  { id: "federation", name: "Federation ties", icon: "federation" },
];
const LAW_META = {
  quota: ["harvest", "Harvest quota"],
  enforcement: ["harvest", "Quota enforcement"],
  harvestOrder: ["harvest", "Harvest order"],
  collection: ["harvest", "Field collection"],
  tax: ["treasury", "Storage tax"],
  holding: ["treasury", "Holding limit"],
  distribution: ["treasury", "Reserve hand-out"],
  inheritance: ["treasury", "Inheritance"],
  entry: ["borders", "Entry"],
  exit: ["borders", "Exit"],
  threshold: ["power", "Passing threshold"],
  proposers: ["power", "Who may propose"],
  influence: ["power", "Influence"],
  influenceBasis: ["power", "Influence basis"],
  office: ["power", "Officer"],
  sanctions: ["power", "Sanctions"],
  records: ["power", "Records"],
  recordAccess: ["power", "Record access"],
  representative: ["federation", "Representative"],
  membershipMandate: ["federation", "Membership mandate"],
  charterMandate: ["federation", "Charter mandate"],
  donations: ["federation", "Donations"],
  gifts: ["federation", "Cross-plot gifts"],
  data: ["federation", "Shared stock data"],
  sharedRecords: ["federation", "Shared records"],
  immigration: ["federation", "Immigration"],
  disputes: ["federation", "Disputes"],
  delegation: ["federation", "Donation delegation"],
};
/** Laws that can be enacted locally but have not been. */
export const LOCAL_LAW_KEYS = [
  "quota",
  "enforcement",
  "harvestOrder",
  "collection",
  "tax",
  "holding",
  "distribution",
  "inheritance",
  "entry",
  "exit",
  "threshold",
  "proposers",
  "influenceBasis",
  "sanctions",
  "records",
];
export const DEFAULT_LAW = {
  quota: "No harvest limit beyond the physical 4 a day.",
  enforcement: "Quotas, if any, are advisory.",
  harvestOrder: "Residents harvest in a random order.",
  collection: "The government takes nothing from the field.",
  tax: "Private stores are not taxed.",
  holding: "No limit on private stores.",
  distribution: "The treasury hands nothing out automatically.",
  inheritance: "A dead resident's carrots are lost.",
  entry: "Anyone may move in.",
  exit: "Anyone may leave.",
  threshold: "Motions pass with more than half of all influence.",
  proposers: "Any resident may table a motion.",
  influenceBasis: "Influence is voted resident by resident.",
  sanctions: "No sanctions are permitted.",
  records: "Nothing is recorded.",
  recordAccess: "Any resident may pay to read the records.",
  membershipMandate: "Residents vote on federation membership.",
  charterMandate: "Charter changes need the residents' approval.",
  donations: "Donations are disabled.",
  gifts: "Cross-plot gifts are disabled.",
  data: "Stocks are private to each plot.",
  sharedRecords: "Records stay local.",
  immigration: "Each plot's own entry rules apply.",
  disputes: "Disputes are disabled.",
  delegation: "Every donation needs a ballot.",
};

export function lawName(key) {
  const [base] = String(key).split(":");
  return LAW_META[base]?.[1] || humanise(base);
}
export function lawGroup(key) {
  return LAW_META[String(key).split(":")[0]]?.[0] || "power";
}

/** One sentence describing what a rule does, in the residents' terms. */
export function lawSentence(ix, key, rule = {}, settings = ix?.s?.settings || {}) {
  const [base, target] = String(key).split(":");
  const who = target !== undefined ? agentName(ix, target) : null;
  const n = fmt(rule.amount || 0);
  const pct = String(rule.mode || "")
    .toLowerCase()
    .includes("percent");
  const on = rule.enabled || rule.mode === "on";
  switch (base) {
    case "quota":
      if (rule.mode === "unlimited")
        return who ? `${who} has no personal limit.` : "No harvest limit.";
      return who
        ? `${who} may harvest at most ${plural(rule.amount || 0, "carrot")} a day.`
        : `Each resident may harvest at most ${plural(rule.amount || 0, "carrot")} a day.`;
    case "enforcement":
      return rule.mode === "hard"
        ? `Quotas are blocked at the field while residents fund it (${fmt(settings.enforcementCost, 2)} mind each a day).`
        : "Quotas are advisory; breaches can be punished later with evidence.";
    case "harvestOrder":
      return (
        {
          random: "Harvest turns are drawn at random each day.",
          rotating: "Harvest turns rotate so everyone gets an early turn.",
          lowestBody: "The hungriest residents harvest first.",
          highestInfluence: "The most influential residents harvest first.",
        }[rule.mode] || "Residents harvest in a set order."
      );
    case "collection": {
      const when = String(rule.mode).includes("Before") ? "before" : "after";
      return pct
        ? `The government takes ${n}% of the field into the treasury ${when} residents harvest.`
        : `The government takes ${plural(rule.amount || 0, "carrot")} from the field ${when} residents harvest.`;
    }
    case "tax":
      return pct
        ? `Residents pay ${n}% of stored carrots above ${fmt(rule.exempt || 0)} into the treasury daily.`
        : `Residents pay ${plural(rule.amount || 0, "carrot")} a day from stores above ${fmt(rule.exempt || 0)}.`;
    case "holding":
      return rule.mode === "collect"
        ? `Carrots above ${n} per resident are collected into the treasury.`
        : `Residents are asked to hold no more than ${n} carrots.`;
    case "distribution":
      if (!rule.enabled && rule.mode !== "perMember" && !rule.amount)
        return "Officers may hand out reserves within their limits.";
      return (
        {
          equal: `The treasury shares ${plural(rule.amount || 0, "carrot")} equally each morning.`,
          perMember: `The treasury gives each resident ${plural(rule.amount || 0, "carrot")} each morning.`,
          named: `The treasury gives ${agentName(ix, rule.target)} ${plural(rule.amount || 0, "carrot")} each morning.`,
        }[rule.mode] || "Reserves are handed out under this rule."
      );
    case "inheritance":
      return (
        {
          delete: "A dead resident's carrots are lost.",
          equal: "A dead resident's carrots are shared among neighbours.",
          named: `A dead resident's carrots go to ${agentName(ix, rule.target)}.`,
          government: "A dead resident's carrots go to the treasury.",
        }[rule.mode] || "Estates follow this rule."
      );
    case "entry": {
      const cap = rule.limit ? ` Population capped at ${fmt(rule.limit)}.` : "";
      return (
        ({
          open: "Anyone may move in.",
          closed: "No newcomers are admitted.",
          vote: "Newcomers need an approving vote.",
          officer: "An officer must approve each newcomer.",
        }[rule.mode] || "Entry follows this rule.") + cap
      );
    }
    case "exit":
      return (
        {
          free: "Anyone may leave.",
          notice: "Leaving requires a day's notice.",
          vote: "Leaving needs an approving vote.",
          officer: "An officer must approve each departure.",
        }[rule.mode] || "Exit follows this rule."
      );
    case "threshold":
      return rule.mode === "twoThirds"
        ? "Motions need two thirds of all influence."
        : "Motions pass with more than half of all influence.";
    case "proposers":
      return (
        {
          all: "Any resident may table a motion.",
          positive: "Only residents with influence may table motions.",
          officers: "Only officers may table motions.",
        }[rule.mode] || "Proposal rights follow this rule."
      );
    case "influence":
      return `${who || "This resident"} votes with influence ${fmt(rule.amount || 0)}.`;
    case "influenceBasis": {
      if (!String(rule.mode).startsWith("contribution"))
        return "Influence is voted resident by resident.";
      const earned = `1 per ${plural(rule.amount || 1, "point")} given in the last ${plural(rule.limit || 1, "day")}, up to ${fmt(settings.maxInfluence ?? 5)}`;
      return rule.mode === "contributionOnly"
        ? `Influence each morning: ${earned}. Residents who gave nothing have none.`
        : `Influence each morning: ${fmt(settings.startingInfluence ?? 1)} plus ${earned}.`;
    }
    case "office": {
      const powers = (rule.powers || [])
        .filter((p) => !p.startsWith("federation"))
        .map(powerName);
      const limit = rule.limit ? `, up to ${plural(rule.limit, "carrot")} a day` : "";
      if (rule.mode === "remove")
        return `${who || "This officer"} is removed from office.`;
      return `${who || "An officer"} may ${powers.length ? listText(powers) : "act"}${limit}${rule.enabled ? ", including for themself" : ""}.`;
    }
    case "representative": {
      const powers = rule.powers || [];
      const can = [
        powers.includes("federationPropose") && "propose",
        powers.includes("federationVote") && "vote",
      ].filter(Boolean);
      return `${who || "A representative"} speaks for the plot in the federation${can.length ? ` and may ${listText(can)}` : ""}.`;
    }
    case "records":
      return rule.mode === "on"
        ? `Harvests, transfers and decisions are recorded (${fmt(settings.recordsCost, 2)} mind per resident a day).`
        : "Nothing is recorded.";
    case "recordAccess":
      return (
        {
          all: "Any resident may pay to read the records.",
          officers: "Only officers may read the records.",
          named: `Only ${listText((rule.members || []).map((m) => agentName(ix, m)))} may read the records.`,
        }[rule.mode] || "Record access follows this rule."
      );
    case "sanctions": {
      const powers = (rule.powers || []).map(powerName);
      return `${powers.length ? `Permitted: ${listText(powers)}.` : "Sanctions enabled."} Fines go to the ${rule.mode === "reserve" ? "treasury" : "field"}.`;
    }
    case "membershipMandate":
      return rule.mode === "officers"
        ? `${listText((rule.members || []).map((m) => agentName(ix, m))) || "Named officers"} decide federation membership.`
        : "Residents vote on federation membership.";
    case "charterMandate":
      return rule.mode === "officers"
        ? `${listText((rule.members || []).map((m) => agentName(ix, m))) || "Named officers"} may approve charter changes.`
        : "Charter changes need the residents' approval.";
    case "donations":
      return on
        ? `Members may send carrots between fields and treasuries${rule.limit ? `, up to ${fmt(rule.limit)} a day` : ""}.`
        : "Donations are disabled.";
    case "gifts":
      return on
        ? "Residents may gift food across member plots."
        : "Cross-plot gifts are disabled.";
    case "data":
      return on
        ? "Members can see each other's field and treasury stocks."
        : "Stocks are private to each plot.";
    case "sharedRecords":
      return on ? "Recorded histories are shared across members." : "Records stay local.";
    case "immigration":
      return (
        {
          restricted: "Each plot's own entry rules apply.",
          open: "Members may move freely between plots, up to capacity.",
          checked: "Newcomers are checked against recent sanctions.",
        }[rule.mode] || "Immigration follows this rule."
      );
    case "disputes":
      return on
        ? "Plots may bring bounded disputes to the council."
        : "Disputes are disabled.";
    case "delegation":
      return on
        ? "Authorised donor officers may send donations without a ballot."
        : "Every donation needs a ballot.";
    default:
      return humanise(base);
  }
}

/** Short value for compact displays, e.g. "2 / day", "25% above 4". */
export function lawValue(ix, key, rule = {}) {
  const [base, target] = String(key).split(":");
  const pct = String(rule.mode || "")
    .toLowerCase()
    .includes("percent");
  switch (base) {
    case "quota":
      return rule.mode === "unlimited" ? "No limit" : `${fmt(rule.amount)} a day`;
    case "enforcement":
      return rule.mode === "hard" ? "Hard" : "Advisory";
    case "tax":
      return pct
        ? `${fmt(rule.amount)}% above ${fmt(rule.exempt)}`
        : `${fmt(rule.amount)} above ${fmt(rule.exempt)}`;
    case "collection":
      return pct ? `${fmt(rule.amount)}% of field` : `${fmt(rule.amount)} a day`;
    case "office":
    case "representative":
    case "influence":
      return agentName(ix, target);
    case "influenceBasis":
      return rule.mode === "contribution"
        ? `Earned, 1 per ${fmt(rule.amount)}`
        : rule.mode === "contributionOnly"
          ? `Earned only, 1 per ${fmt(rule.amount)}`
          : "Voted";
    case "inheritance":
      return (
        { delete: "Lost", equal: "Shared", named: "Named heir", government: "Treasury" }[
          rule.mode
        ] || humanise(rule.mode)
      );
    default: {
      const v =
        rule.mode === "on"
          ? "On"
          : rule.mode === "off"
            ? "Off"
            : humanise(rule.mode) || "On";
      return v.replace(/^./, (c) => c.toUpperCase());
    }
  }
}

/**
 * Laws in force for a plot, grouped, with today's operating state. Federation
 * charter rules are included when the plot belongs to a federation.
 */
export function plotLaws(ix, plot) {
  const out = [];
  for (const [key, rule] of Object.entries(plot.rules || {})) {
    const base = key.split(":")[0];
    let state = null;
    if (base === "enforcement" && rule.mode === "hard")
      state = plot.hardFunded
        ? { tone: "ok", text: "Funded today" }
        : { tone: "warn", text: "Unfunded: soft today" };
    if (base === "records" && rule.mode === "on")
      state = plot.recordsFunded
        ? { tone: "ok", text: "Funded today" }
        : { tone: "warn", text: "Unfunded today" };
    out.push({
      key,
      base,
      rule,
      scope: "local",
      group: lawGroup(key),
      name: lawName(key),
      sentence: lawSentence(ix, key, rule),
      value: lawValue(ix, key, rule),
      state,
    });
  }
  const fed = plot.federation >= 0 ? ix.federations.get(plot.federation) : null;
  if (fed)
    for (const [key, rule] of Object.entries(fed.rules || {}))
      out.push({
        key: `fed:${key}`,
        base: key,
        rule,
        scope: "federation",
        group: "federation",
        name: lawName(key),
        sentence: lawSentence(ix, key, rule),
        value: lawValue(ix, key, rule),
        state: fed.funded ? null : { tone: "warn", text: "Federation unfunded" },
      });
  const order = LAW_GROUPS.map((g) => g.id);
  out.sort(
    (a, b) =>
      order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name),
  );
  return out;
}

// ---------------------------------------------------------------------------
// Motions

export const STATUS = {
  open: { label: "On the floor", tone: "open" },
  passed: { label: "Passed", tone: "yes" },
  approved: { label: "Approved locally", tone: "yes" },
  scheduled: { label: "Passed, starts tomorrow", tone: "yes" },
  activated: { label: "In force", tone: "yes" },
  failed: { label: "Rejected", tone: "no" },
  tied: { label: "Tied with a rival", tone: "neutral" },
  superseded: { label: "Beaten by a rival", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  invalid: { label: "Invalid", tone: "neutral" },
  lapsed: { label: "Lapsed", tone: "neutral" },
};
export const statusOf = (p) =>
  STATUS[p.status] || { label: humanise(p.status), tone: "neutral" };
export const passedStatus = (p) =>
  ["passed", "approved", "scheduled", "activated"].includes(p.status);

/** A short, specific title for a motion. */
export function motionTitle(ix, p) {
  const i = p.input || {};
  const who = agentName(ix, i.target);
  switch (i.kind) {
    case "found":
      return "Found a government";
    case "dissolve":
      return "Dissolve the government";
    case "office":
      return `Appoint ${who} as officer`;
    case "removeOffice":
      return `Remove ${who} from office`;
    case "sanction":
      return `${humanise(i.sanction || "sanction").replace(/^./, (c) => c.toUpperCase())} for ${who}`;
    case "distribution":
      return `Hand out ${plural(i.amount || 0, "carrot")}`;
    case "donation":
      return `Donate ${plural(i.amount || 0, "carrot")} to ${plotName(ix, i.target)}`;
    case "federationFound":
      return `Form a federation with ${listText((i.members || []).filter((m) => m !== p.plot).map((m) => plotLetter(ix.plots.get(m) || { id: m })))}`;
    case "federationJoin":
      return "Join the federation";
    case "federationLeave":
      return "Leave the federation";
    case "federationAdmit":
      return `Admit ${plotName(ix, i.target)}`;
    case "federationDissolve":
      return "Dissolve the federation";
    case "permitEntry":
      return `Let ${who} move in`;
    case "permitExit":
      return `Let ${who} leave`;
    case "ratify":
      return "Ratify a charter change";
    case "repeal":
    case "federationRepeal":
      return `Repeal ${lawName(i.key).toLowerCase()}`;
    case "policy":
    case "federationPolicy": {
      const [base] = String(i.key).split(":");
      const r = i.rule || {};
      if (base === "quota")
        return r.mode === "unlimited"
          ? "Lift the harvest quota"
          : `Set a harvest quota of ${fmt(r.amount)}`;
      if (base === "tax")
        return `Tax stores ${String(r.mode).includes("percent") ? `${fmt(r.amount)}%` : fmt(r.amount)} above ${fmt(r.exempt || 0)}`;
      if (base === "enforcement")
        return r.mode === "hard" ? "Enforce quotas at the field" : "Make quotas advisory";
      if (base === "records")
        return r.mode === "on" ? "Keep public records" : "Stop keeping records";
      if (base === "collection")
        return `Collect ${String(r.mode).includes("percent") ? `${fmt(r.amount)}%` : fmt(r.amount)} from the field`;
      if (base === "inheritance")
        return `Estates: ${lawValue(ix, i.key, r).toLowerCase()}`;
      if (base === "representative")
        return r.mode === "remove"
          ? `Remove ${agentName(ix, i.key.split(":")[1])} as representative`
          : `Make ${agentName(ix, i.key.split(":")[1])} representative`;
      if (base === "recordAccess")
        return (
          {
            all: "Open the records to everyone",
            officers: "Restrict records to officers",
            named: "Restrict records to named readers",
          }[r.mode] || "Change record access"
        );
      if (base === "harvestOrder")
        return (
          {
            random: "Harvest in random order",
            rotating: "Rotate the harvest order",
            lowestBody: "Let the hungriest harvest first",
            highestInfluence: "Let the influential harvest first",
          }[r.mode] || "Change the harvest order"
        );
      if (base === "entry")
        return (
          {
            open: "Open the borders",
            closed: "Close the borders",
            vote: "Vote on newcomers",
            officer: "Let an officer admit newcomers",
          }[r.mode] || "Change entry rules"
        );
      if (base === "exit")
        return (
          {
            free: "Let residents leave freely",
            notice: "Require notice to leave",
            vote: "Vote on departures",
            officer: "Let an officer approve departures",
          }[r.mode] || "Change exit rules"
        );
      if (base === "threshold")
        return r.mode === "twoThirds"
          ? "Require two-thirds majorities"
          : "Pass motions by simple majority";
      if (base === "proposers")
        return (
          {
            all: "Let anyone table motions",
            positive: "Only the influential may table motions",
            officers: "Only officers may table motions",
          }[r.mode] || "Change proposal rights"
        );
      if (base === "influence")
        return `Give ${agentName(ix, i.key.split(":")[1])} influence ${fmt(r.amount)}`;
      if (base === "influenceBasis")
        return String(r.mode).startsWith("contribution")
          ? `Earn influence by contribution${r.mode === "contributionOnly" ? " only" : ""}: 1 per ${fmt(r.amount)} points over ${plural(r.limit || 1, "day")}`
          : "Vote influence resident by resident";
      if (base === "holding")
        return r.mode === "collect"
          ? `Collect stores above ${fmt(r.amount)}`
          : `Advise holding at most ${fmt(r.amount)}`;
      if (base === "distribution")
        return r.mode === "perMember"
          ? `Give everyone ${fmt(r.amount)} a day from the treasury`
          : r.mode === "named"
            ? `Give ${agentName(ix, r.target)} ${fmt(r.amount)} a day`
            : `Share ${fmt(r.amount)} from the treasury daily`;
      if (base === "sanctions") return "Permit sanctions";
      if (base === "charterMandate")
        return r.mode === "officers"
          ? "Delegate charter decisions"
          : "Keep charter decisions with residents";
      if (base === "membershipMandate")
        return r.mode === "officers"
          ? "Delegate federation membership"
          : "Keep membership with residents";
      if (base === "immigration")
        return (
          {
            open: "Open passage between members",
            restricted: "Keep local entry rules",
            checked: "Check newcomers' records",
          }[r.mode] || "Change immigration"
        );
      if (base === "office")
        return `Appoint ${agentName(ix, i.key.split(":")[1])} as officer`;
      if (
        [
          "donations",
          "gifts",
          "data",
          "sharedRecords",
          "disputes",
          "delegation",
        ].includes(base)
      )
        return `${r.mode === "off" ? "Disable" : "Enable"} ${lawName(base).toLowerCase()}`;
      return `${lawName(i.key)}: ${lawValue(ix, i.key, r).toLowerCase()}`;
    }
    default:
      return p.title || humanise(i.kind);
  }
}

/** Before and after sentences for a motion; before is null when nothing changes. */
export function motionChange(ix, p) {
  const i = p.input || {};
  const plot = ix.plots.get(p.plot);
  if (["policy", "federationPolicy", "repeal", "federationRepeal"].includes(i.kind)) {
    const fed = p.federation >= 0 ? ix.federations.get(p.federation) : null;
    const rules = (fed ? fed.rules : plot?.rules) || {};
    const current = rules[i.key];
    const base = String(i.key).split(":")[0];
    const target = String(i.key).split(":")[1];
    const nobody = {
      office: `${agentName(ix, target)} holds no office.`,
      representative: `${agentName(ix, target)} does not represent the plot.`,
      influence: `${agentName(ix, target)} votes with the starting influence.`,
      quota:
        target !== undefined
          ? `${agentName(ix, target)} follows the general quota.`
          : undefined,
    }[base];
    const before = current
      ? lawSentence(ix, i.key, current)
      : nobody || DEFAULT_LAW[base] || "No rule in force.";
    const after = i.kind.includes("epeal")
      ? DEFAULT_LAW[base] || "The rule is removed."
      : lawSentence(ix, i.key, i.rule || {});
    return { before, after };
  }
  const who = agentName(ix, i.target);
  const map = {
    found: [
      `${plotName(ix, p.plot)} has no government.`,
      "A government forms with no laws. Every rule needs its own vote.",
    ],
    dissolve: [
      "The government governs the plot.",
      "The government is dissolved and its treasury returns to the field.",
    ],
    office: [null, lawSentence(ix, `office:${i.target ?? 0}`, i.rule || {})],
    removeOffice: [`${who} holds office.`, `${who} loses every delegated power.`],
    sanction: [
      null,
      `${humanise(i.sanction)} for ${who}${i.amount ? ` of ${plural(i.amount, "carrot")}` : ""}, backed by recorded evidence.`,
    ],
    distribution: [
      null,
      `Up to ${plural(i.amount || 0, "carrot")} leave the treasury for ${i.target >= 0 && i.target !== undefined ? who : "residents"}.`,
    ],
    donation: [
      null,
      `Up to ${plural(i.amount || 0, "carrot")} go to ${plotName(ix, i.target)} from the ${i.source === "field" ? "field" : "treasury"}.`,
    ],
    federationFound: [
      null,
      `${listText((i.members || []).map((m) => plotName(ix, m)))} form a federation, once each plot agrees and 50 mind is pledged.`,
    ],
    federationJoin: [null, "The plot joins the federation."],
    federationLeave: [null, "The plot leaves the federation after a day's notice."],
    federationAdmit: [null, `${plotName(ix, i.target)} becomes a member.`],
    federationDissolve: [null, "The federation dissolves; plots keep their governments."],
    permitEntry: [null, `${who} may move in at the next migration.`],
    permitExit: [null, `${who} may leave at the next migration.`],
    ratify: [null, "This plot approves the federation charter change."],
  };
  const [before, after] = map[i.kind] || [null, p.title || humanise(i.kind)];
  return { before, after };
}

/** Units and the integer needed to pass. */
export function motionThreshold(p) {
  const fed = p.federation >= 0 && p.input?.kind !== "found";
  const plotVotes = Object.keys(p.plotVotes || {}).length;
  if (fed && plotVotes) {
    const total = plotVotes;
    const need = p.threshold === "unanimous" ? total : Math.floor(total / 2) + 1;
    return {
      unit: "plots",
      total,
      need,
      rule: p.threshold === "unanimous" ? "Every member plot" : "Most member plots",
    };
  }
  const total = p.total || 0;
  const need =
    p.threshold === "twoThirds"
      ? Math.ceil((total * 2) / 3)
      : p.threshold === "unanimous"
        ? total
        : Math.floor(total / 2) + 1;
  const unit = p.input?.kind === "found" ? "residents" : "influence";
  return {
    unit,
    total,
    need,
    rule:
      p.threshold === "twoThirds"
        ? "Two thirds"
        : p.threshold === "unanimous"
          ? "Everyone"
          : "More than half",
  };
}

/** Tallies for a motion, by plot for federation ballots. */
export function motionTally(p) {
  const t = motionThreshold(p);
  if (t.unit === "plots") {
    const v = Object.values(p.plotVotes || {});
    return {
      ...t,
      yes: v.filter((x) => x === "yes").length,
      no: v.filter((x) => x === "no").length,
      abstain: v.filter((x) => x !== "yes" && x !== "no").length,
    };
  }
  return {
    ...t,
    yes: p.yes || 0,
    no: p.no || 0,
    abstain: Math.max(0, t.total - (p.yes || 0) - (p.no || 0)),
  };
}

/** Motions relevant to a plot on a given absolute day (tabled or decided). */
export function motionsFor(s, plotId, absoluteDay = s.absoluteDay) {
  return (s.proposals || []).filter(
    (p) =>
      (plotId === undefined || p.plot === plotId) &&
      (p.created === absoluteDay || p.closes === absoluteDay),
  );
}

// ---------------------------------------------------------------------------
// Plot and population summaries

export function plotSummary(ix, plot) {
  const residents = ix.residents.get(plot.id) || [];
  const n = residents.length;
  const sum = (f) => residents.reduce((t, a) => t + f(a), 0);
  const teams = new Map();
  for (const a of residents) teams.set(a.team, (teams.get(a.team) || 0) + 1);
  const laws = Object.keys(plot.rules || {}).length;
  const open = (ix.s.proposals || []).filter(
    (p) => p.plot === plot.id && p.status === "open",
  ).length;
  const today = motionsFor(ix.s, plot.id).length;
  return {
    population: n,
    teams: [...teams.entries()].sort((a, b) => b[1] - a[1]),
    satisfaction: n ? sum((a) => a.score) / n : 0,
    body: n ? sum((a) => a.body) / n : 0,
    mind: n ? sum((a) => a.mind) / n : 0,
    influence: n ? sum((a) => a.influence) / n : 0,
    food: sum((a) => a.food),
    hungry: residents.filter((a) => a.body < (ix.s.settings.bodyCapacity || 2)).length,
    fieldShare: plot.capacity ? plot.stock / plot.capacity : 0,
    reserveShare: plot.reserveCapacity ? plot.reserve / plot.reserveCapacity : 0,
    laws,
    open,
    today,
    officers: Object.keys(plot.officers || {}).length,
  };
}

export function worldSummary(ix) {
  const s = ix.s;
  const alive = s.agents.filter((a) => a.alive);
  return {
    alive: alive.length,
    population: s.agents.length,
    field: s.plots.reduce((t, p) => t + p.stock, 0),
    capacity: s.plots.reduce((t, p) => t + p.capacity, 0),
    treasury: s.plots.reduce((t, p) => t + p.reserve, 0),
    held: alive.reduce((t, a) => t + a.food, 0),
    satisfaction: alive.length
      ? alive.reduce((t, a) => t + a.score, 0) / alive.length
      : 0,
    governments: s.plots.filter((p) => p.government).length,
    federations: ix.federations.size,
    outside: (ix.residents.get(-1) || []).length,
    awaiting: s.agents.filter((a) => !a.alive).length,
  };
}

// ---------------------------------------------------------------------------
// What happened in a phase

function sumBy(events, kind, field = "amount") {
  let t = 0;
  for (const e of events) if (e.kind === kind) t += Number(e[field] || 0);
  return t;
}
function countBy(events, kind) {
  let t = 0;
  for (const e of events) if (e.kind === kind) t++;
  return t;
}

/**
 * Headline and figures for the phase a snapshot has just completed. `prev` is
 * the frame before it, when available, so migration can be described.
 */
export function phaseStory(ix, prev) {
  const s = ix.s;
  const ev = s.events || [];
  const figures = [];
  let headline = "";
  const weatherLine = () => {
    const by = [[], [], []];
    for (const p of s.plots) by[p.weather].push(plotLetter(p));
    return by
      .map((letters, w) =>
        letters.length
          ? `${["sun", "cloud", "dark skies"][w]} over ${listText(letters)}`
          : null,
      )
      .filter(Boolean)
      .join(", ");
  };
  switch (s.phase) {
    case "ready":
      headline = `${fmt(s.agents.length)} Amoeboids wait in the wilds. Press play to begin day 1.`;
      break;
    case "environment": {
      const grown = sumBy(ev, "growth");
      const back = countBy(ev, "respawn");
      const activated = countBy(ev, "activated");
      headline =
        s.day === 1 && s.month >= 1
          ? `Month ${s.month} dawns. Everyone starts in the wilds with ${fmt(s.settings.startingMind)} mind and no food.`
          : `Dawn: ${weatherLine()}. ${grown ? `${fmt(grown)} carrots grew.` : "Nothing grew."}`;
      if (grown)
        figures.push({
          icon: "sprout",
          value: `+${fmt(grown)}`,
          label: "grown",
          tone: "carrot",
        });
      if (activated)
        figures.push({
          icon: "scroll",
          value: fmt(activated),
          label: activated === 1 ? "decision takes effect" : "decisions take effect",
          tone: "yes",
        });
      if (back)
        figures.push({
          icon: "spark",
          value: fmt(back),
          label: "returned to life",
          tone: "mind",
        });
      const dist = sumBy(ev, "distribution");
      if (dist)
        figures.push({
          icon: "granary",
          value: fmt(dist),
          label: "handed out",
          tone: "carrot",
        });
      break;
    }
    case "movement": {
      const moves = ev.filter((e) => e.kind === "move");
      const into = new Map();
      for (const a of s.agents) {
        const before = prev?.agents?.get(a.id);
        if (a.alive && before && before.plot !== a.plot && a.plot >= 0)
          into.set(a.plot, (into.get(a.plot) || 0) + 1);
      }
      const top = [...into.entries()].sort((a, b) => b[1] - a[1])[0];
      headline = moves.length
        ? `${plural(moves.length, "Amoeboid")} moved${top ? `, most of them to ${plotName(ix, top[0])} (+${top[1]})` : ""}.`
        : "Everyone stayed where they were.";
      if (moves.length)
        figures.push({
          icon: "path",
          value: fmt(moves.length),
          label: "moved",
          tone: "mind",
        });
      const dis = countBy(ev, "dissolution");
      if (dis)
        figures.push({
          icon: "hall",
          value: fmt(dis),
          label: "governments dissolved",
          tone: "no",
        });
      break;
    }
    case "harvest": {
      const got = sumBy(ev, "harvest");
      const who = countBy(ev, "harvest");
      const breaches = countBy(ev, "ration_breach");
      const collected = sumBy(ev, "collection");
      headline = got
        ? `${plural(who, "resident")} harvested ${plural(got, "carrot")}${breaches ? `; ${plural(breaches, "breach", "breaches")} of soft quotas` : ""}.`
        : "No carrots were harvested.";
      if (got)
        figures.push({
          icon: "carrot",
          value: fmt(got),
          label: "harvested",
          tone: "carrot",
        });
      if (collected)
        figures.push({
          icon: "granary",
          value: fmt(collected),
          label: "to treasuries",
          tone: "carrot",
        });
      if (breaches)
        figures.push({
          icon: "alert",
          value: fmt(breaches),
          label: "quota breaches",
          tone: "no",
        });
      break;
    }
    case "proposals": {
      const tabled = (s.proposals || []).filter((p) => p.created === s.absoluteDay);
      const rejected = countBy(ev, "proposal_rejected");
      const titles = [...new Set(tabled.map((p) => motionTitle(ix, p)))];
      headline = tabled.length
        ? `${plural(tabled.length, "motion")} tabled: ${titles.slice(0, 2).map(lcFirst).join("; ")}${titles.length > 2 ? ` and ${titles.length - 2} more` : ""}.`
        : "No motions were tabled today.";
      if (tabled.length)
        figures.push({
          icon: "scroll",
          value: fmt(tabled.length),
          label: "tabled",
          tone: "influence",
        });
      if (rejected)
        figures.push({
          icon: "alert",
          value: fmt(rejected),
          label: "refused as invalid",
          tone: "no",
        });
      const pledged = sumBy(ev, "pledge");
      if (pledged)
        figures.push({
          icon: "mind",
          value: fmt(pledged, 1),
          label: "mind pledged",
          tone: "mind",
        });
      break;
    }
    case "voting": {
      const decided = (s.proposals || []).filter(
        (p) => p.closes === s.absoluteDay && p.status !== "open",
      );
      const passed = decided.filter(passedStatus);
      headline = decided.length
        ? `${plural(decided.length, "motion")} decided: ${fmt(passed.length)} passed${passed[0] ? `, including ${lcFirst(motionTitle(ix, passed[0]))} in ${plotName(ix, passed[0].plot)}` : ""}.`
        : "No motions came to a vote.";
      if (decided.length)
        figures.push({
          icon: "ballot",
          value: `${fmt(passed.length)} / ${fmt(decided.length)}`,
          label: "passed",
          tone: "yes",
        });
      break;
    }
    case "transfers": {
      const orders = countBy(ev, "officer_order");
      const offers = countBy(ev, "offer");
      const deposits = sumBy(ev, "deposit");
      headline =
        orders || offers || deposits
          ? `${orders ? `${plural(orders, "officer order")} issued` : "No officer orders"}${offers ? `, ${plural(offers, "gift")} offered` : ""}${deposits ? `, ${fmt(deposits)} carrots deposited` : ""}.`
          : "No officers acted and no food changed hands.";
      if (orders)
        figures.push({
          icon: "seal",
          value: fmt(orders),
          label: "officer orders",
          tone: "influence",
        });
      if (offers)
        figures.push({
          icon: "gift",
          value: fmt(offers),
          label: "gifts",
          tone: "carrot",
        });
      break;
    }
    case "eating": {
      const eaten = sumBy(ev, "eat");
      const thought = sumBy(ev, "think");
      const deaths = ev.filter((e) => e.kind === "death");
      const where = new Map();
      for (const d of deaths) {
        const plot = prev?.agents?.get(d.actor)?.plot ?? d.plot;
        where.set(plot, (where.get(plot) || 0) + 1);
      }
      const worst = [...where.entries()].sort((a, b) => b[1] - a[1])[0];
      headline = `${plural(eaten, "carrot")} eaten and ${fmt(thought, 0)} mind spent thinking.${deaths.length ? ` ${plural(deaths.length, "Amoeboid")} starved${worst && worst[0] >= 0 ? `, ${worst[1]} in ${plotName(ix, worst[0])}` : ""}.` : ""}`;
      figures.push({ icon: "bowl", value: fmt(eaten), label: "eaten", tone: "carrot" });
      if (thought)
        figures.push({
          icon: "mind",
          value: fmt(thought),
          label: "thought",
          tone: "joy",
        });
      if (deaths.length)
        figures.push({
          icon: "skull",
          value: fmt(deaths.length),
          label: "starved",
          tone: "no",
        });
      break;
    }
    case "close": {
      const w = worldSummary(ix);
      headline = s.meteor
        ? s.done
          ? "The final meteor falls. The year is over."
          : `A meteor ends month ${s.month}. Only memories survive.`
        : `Night falls on day ${s.day}. ${fmt(w.alive)} alive, average satisfaction ${fmt(w.satisfaction, 1)} this month.`;
      figures.push({ icon: "people", value: fmt(w.alive), label: "alive", tone: "mind" });
      figures.push({
        icon: "joy",
        value: fmt(w.satisfaction, 1),
        label: "avg satisfaction",
        tone: "joy",
      });
      break;
    }
  }
  return { headline, figures };
}

/** Events worth surfacing as a toast and in the chronicle. */
export function notableEvents(ix, prev) {
  const s = ix.s;
  const out = [];
  const ev = s.events || [];
  if (s.phase === "environment") {
    for (const e of ev) {
      if (e.kind !== "activated") continue;
      if (/^Found a government/.test(e.message))
        out.push({
          tone: "yes",
          icon: "hall",
          plot: e.plot,
          text: `${plotName(ix, e.plot)} founded a government`,
        });
    }
    const feds = new Set();
    for (const f of s.federations || [])
      if (f.founded === s.absoluteDay && !f.dissolved && !feds.has(f.id)) {
        feds.add(f.id);
        out.push({
          tone: "influence",
          icon: "federation",
          plot: f.plots[0],
          text: `${f.name} formed by ${listText(f.plots.map((p) => plotLetter(ix.plots.get(p) || { id: p })))}`,
        });
      }
  }
  if (s.phase === "movement" || s.phase === "environment")
    for (const e of ev)
      if (e.kind === "dissolution")
        out.push({
          tone: "no",
          icon: "hall",
          plot: e.plot,
          text: `${plotName(ix, e.plot)}'s government dissolved`,
        });
  if (s.phase === "voting") {
    // The same decision taken in several plots is announced once.
    const decided = (s.proposals || []).filter(
      (p) => p.closes === s.absoluteDay && passedStatus(p) && p.input?.kind !== "found",
    );
    const groups = new Map();
    for (const p of decided) {
      const i = p.input || {};
      const key = JSON.stringify([i.kind, i.key, i.rule, [...(i.members || [])].sort()]);
      const g = groups.get(key) || { p, plots: [] };
      if (!g.plots.includes(p.plot)) g.plots.push(p.plot);
      groups.set(key, g);
    }
    for (const { p, plots } of groups.values()) {
      const letters = plots
        .sort((a, b) => a - b)
        .map((id) => plotLetter(ix.plots.get(id) || { id }));
      const who =
        letters.length > 1 && letters.length === s.plots.length
          ? "Every plot"
          : listText(letters);
      const members = (p.input?.members || []).map((m) =>
        plotLetter(ix.plots.get(m) || { id: m }),
      );
      const what =
        p.input?.kind === "federationFound"
          ? members.length === s.plots.length
            ? "voted to form one federation"
            : `voted to federate ${listText(members)}`
          : `passed: ${lcFirst(motionTitle(ix, p))}`;
      out.push({
        tone: "yes",
        icon: "ballot",
        plot: p.plot,
        proposal: p.id,
        text: `${who} ${what}`,
      });
    }
  }
  if (s.phase === "eating") {
    const where = new Map();
    for (const e of ev)
      if (e.kind === "death") {
        const plot = prev?.agents?.get(e.actor)?.plot ?? e.plot;
        where.set(plot, (where.get(plot) || 0) + 1);
      }
    for (const [plot, n] of where)
      if (n >= 3)
        out.push({
          tone: "no",
          icon: "skull",
          plot,
          text: `${plural(n, "Amoeboid")} starved in ${plotName(ix, plot)}`,
        });
  }
  return out;
}

/** An engine event in the observer's words. */
export function eventText(e) {
  switch (e.kind) {
    case "pledge":
      return `Pledged ${fmt(e.amount, 2)} mind to ${/federation/i.test(e.message) ? "the federation" : "the plot's shared costs"}`;
    case "eat": {
      const m = /([\d.]+) satisfaction/.exec(e.message || "");
      const sat = m ? Number(m[1]) : 0;
      return `Ate ${plural(e.amount || 0, "carrot")}${sat > 0 ? `, earning ${fmt(sat, 2)} satisfaction` : ""}`;
    }
    case "think":
      return `Thought with ${fmt(e.amount, 2)} mind, earning as much satisfaction`;
    case "move":
      return String(e.message).replace(/outside/g, "the wilds");
    case "respawn":
      return "Returned to the wilds with its memory";
    case "proposal":
      return `Tabled: ${lcFirst(e.message)}`;
    case "death":
      return `Starved, ${lcFirst(String(e.message).replace(/^Died/, "dying"))}`;
    default:
      return e.message;
  }
}

/** What one resident did today, newest last, from frames' events. */
export function agentDay(events, id) {
  const ignored = new Set(["funding"]);
  return events.filter((e) => e.actor === id && !ignored.has(e.kind));
}

export const SCORE_HELP =
  "Satisfaction earned this month: one per mind spent thinking, plus log₂(1 + extra carrots) for each meal above the daily need. The meteor resets it.";

// ---------------------------------------------------------------------------
// Chamber geometry

/**
 * Seat centres for a parliament-style hemicycle. Rows are added until the
 * arcs can hold every voter at an even spacing; seats are then ordered by
 * angle so each side of the vote forms a wedge from left to right.
 */
export function hemicycleSeats(n, width = 600, height = 300) {
  if (!n) return [];
  const outer = Math.min(width / 2, height) - 8;
  const inner = outer * 0.38;
  let rows = 1,
    s,
    radii,
    caps;
  for (;;) {
    s = (outer - inner) / rows;
    radii = Array.from({ length: rows }, (_, i) => inner + s * (i + 0.5));
    caps = radii.map((r) => Math.floor((Math.PI * r) / s) + 1);
    if (caps.reduce((t, c) => t + c, 0) >= n || rows >= 12) break;
    rows++;
  }
  const capacity = caps.reduce((t, c) => t + c, 0);
  const counts = caps.map((c) => Math.floor((c * n) / capacity));
  let left = n - counts.reduce((t, c) => t + c, 0);
  for (let i = rows - 1; left > 0; i = (i - 1 + rows) % rows) {
    if (counts[i] < caps[i]) {
      counts[i]++;
      left--;
    }
  }
  const seats = [];
  radii.forEach((r, i) => {
    const c = counts[i];
    for (let j = 0; j < c; j++) {
      const angle = c === 1 ? Math.PI / 2 : Math.PI - (j / (c - 1)) * Math.PI;
      seats.push({
        x: width / 2 + Math.cos(angle) * r,
        y: height - Math.sin(angle) * r,
        angle,
        row: i,
      });
    }
  });
  seats.sort((a, b) => b.angle - a.angle || a.row - b.row);
  const radius = Math.min(16, s * 0.36);
  return seats.map((p) => ({ ...p, r: radius }));
}

// The presets before November 2026, by behaviour: their nearest current
// preset and their default team name.
const RETIRED = {
  steward: ["warden", "Stewards"],
  thinker: ["sunchaser", "Thinkers"],
  gatherer: ["locust", "Gatherers"],
  diplomat: ["envoy", "Diplomats"],
  wanderer: ["sunchaser", "Wanderers"],
  learner: ["tinkerer", "Learners"],
};

/**
 * Updates a saved team list. The untouched old default line-up becomes the
 * current one; otherwise a retired behaviour maps to its nearest preset and
 * the team keeps its name.
 */
export function migrateTeams(teams, defaults) {
  if (!Array.isArray(teams)) return teams;
  const oldDefaults = Object.entries(RETIRED);
  const untouched =
    teams.length === oldDefaults.length &&
    teams.every(
      (t, i) =>
        !t.builder &&
        !t.strategyId &&
        t.policy === oldDefaults[i][0] &&
        t.name === oldDefaults[i][1][1],
    );
  if (untouched) return structuredClone(defaults);
  return teams.map((t) =>
    RETIRED[t.policy] && !t.builder && !t.strategyId
      ? { ...t, policy: RETIRED[t.policy][0] }
      : t,
  );
}

/**
 * A resident's standing where influence follows contributions: the points
 * behind today's influence, that influence and its share of the plot's votes.
 * Null where the plot's influence is voted.
 */
export function contributionStanding(ix, a) {
  const plot = a && a.alive !== false && a.plot >= 0 ? ix.plots.get(a.plot) : null;
  const rule = plot?.rules?.influenceBasis;
  if (!plot || !String(rule?.mode || "").startsWith("contribution")) return null;
  const row = (plot.contributions || []).find((c) => c.agent === a.id) || {
    agent: a.id,
    points: 0,
  };
  const residents = ix.residents.get(plot.id) || [];
  const total = residents.reduce((t, r) => t + (r.influence || 0), 0);
  return {
    rule,
    row,
    points: row.points || 0,
    influence: a.influence || 0,
    share: total > 0 ? (a.influence || 0) / total : 0,
  };
}
