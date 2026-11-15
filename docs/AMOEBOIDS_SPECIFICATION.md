# Amoeboids MVP Specification

Approved implementation baseline • 15 November 2026 • Version 1

The user approved this specification and its proposed defaults for implementation on 15 November 2026. The reviewed text below is retained, including its original “Agreed”, “Retained” and “Proposed” labels, to preserve the origin of each decision. “Proposed” now denotes an accepted implementation default, not an outstanding approval request.

## 1 Purpose and decision status

Amoeboids is a programmable society simulation. Six teams each supply an agent behaviour, with 50 independent individuals running each behaviour by default. Individuals choose where to live, how much to harvest and eat, how much mind to spend thinking, and whether to organise. Governments and federations let them introduce institutions whose benefits compete with the mind cost of creating and running them.

The MVP includes the complete institutional system: multiple plots, weather, personal and government stores, migration, government formation, voting, officers, taxation, inheritance, records, enforcement, sanctions, federation formation, donations, information sharing, immigration and disputes. A game comprises repeated months separated by a meteor reset. Only each individual's private memory persists into the next month.

This is a specification for review before implementation. The rules below form a concrete candidate implementation contract. Their decision status is distinguished as follows:

- **Agreed** means explicitly selected in the discussion, including accepted recommendations.
- **Retained** means carried forward from the supplied ruleset where the discussion did not replace it.
- **Proposed** means a numerical default or an operational detail added to make the simulation unambiguous. These are reviewable choices, not additional user decisions already made.

The discussion overrides the PDFs. The corrected decision is that **eating is chosen by agent code**, including survival food. Thinking has no diminishing returns. Neither governments nor federations begin with substantive policies enabled.

### 1.1 Agreed foundation

| Subject               | Agreed behaviour                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Time                  | One cycle is one day, with separate phases and decisions in every relevant phase.                                   |
| Politics              | No numerical cap on proposals or eligible ballots. Mind costs still apply.                                          |
| Conflicting proposals | Of conflicting proposals that pass, greatest supporting influence wins; a tie preserves the existing rule.          |
| Activation            | Approved decisions take effect next cycle.                                                                          |
| Founding              | Formation unlocks powers; it does not enact an initial policy package.                                              |
| Officers              | Votes determine appointments, powers and limits; delegated decisions can replace repeated public votes.             |
| Food                  | Personal and government storage; no spoilage; configurable physical capacities.                                     |
| Consumption           | Agent-chosen eating. Extra food earns logarithmic satisfaction, reset daily; thinking earns linear satisfaction.    |
| Weather               | Shared conditions and regeneration rate per plot, but separate mind reserves per individual.                        |
| Death                 | Stored carrots are deleted unless an enacted inheritance rule directs them elsewhere.                               |
| Population            | Default six behaviours with 50 independent copies each; plot count is configurable.                                 |
| Federations           | Only authorised officers or representatives vote. Representatives produce one vote per plot by internal majority.   |
| Federation membership | Local residents initially authorise forming or joining; they may explicitly delegate membership and charter powers. |
| Meteor                | Complete world reset between months, retaining individual private memory only.                                      |
| Product               | An autonomous sandbox for team-written behaviours, with a polished game-like world and detailed inspection.         |

### 1.2 Principal proposed details to review

The major additions are daily body accounting; taxation of reserved food with explicit offer cancellation; a 12-carrot personal capacity; government capacity of 10 carrots per plot's baseline resident equivalent; six plots by default; three weather states; a complete missed day before respawn; no upkeep for an idle federation; explicit officer orders executed the following morning; atomic single-subject proposals; and deterministic handling of transfers, capacity and incompatible decisions. Sections below specify these rather than leaving implementation to invent behaviour.

## 2 World and configurable defaults

All physical settings and costs are chosen before a run and remain fixed through that run. Government rules can change only the political settings expressly exposed in the policy catalogue. Settings, seed and rules version are saved with results.

| Setting                                   | Draft default                                          | Status                                         |
| ----------------------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Team behaviours                           | 6                                                      | Agreed                                         |
| Copies per behaviour                      | 50                                                     | Agreed                                         |
| Plot count                                | 6, independently configurable                          | Proposed default; configurability agreed       |
| Days per month                            | 30                                                     | Agreed                                         |
| Months per run                            | 12                                                     | Proposed exact default from the requested year |
| Total daily cycles                        | 360                                                    | Derived                                        |
| Plot size weights                         | 0.8, 1.0, 1.2, repeated and normalised                 | Retained                                       |
| Total field capacity                      | 10 carrots per starting individual                     | Retained                                       |
| Starting field stock                      | Floor of 80% of each field capacity                    | Retained                                       |
| Growth coefficient g                      | 4 carrots per productive resident per day              | Retained                                       |
| Capacity per productive resident c        | 10 carrots                                             | Retained                                       |
| Daily food need                           | 2 carrots                                              | Retained                                       |
| Body capacity and starting body           | 2                                                      | Retained                                       |
| Mind capacity / starting mind             | 12 / 6                                                 | Retained                                       |
| Personal storage capacity                 | 12 carrots                                             | Proposed                                       |
| Harvest request limit                     | 4 carrots per individual per day                       | Retained quantity; adapted to daily phases     |
| Government storage capacity               | Floor of field capacity / c, multiplied by 10 carrots  | Proposed                                       |
| Starting personal / government storage    | 0 / 0                                                  | Agreed empty reset; proposed initial stores    |
| Carrot satisfaction                       | log2(1 + daily extra carrots)                          | Agreed                                         |
| Thinking satisfaction                     | 1 per mind spent                                       | Retained and agreed linearity                  |
| Ordinary respawn delay                    | 1 complete missed cycle; configurable, including never | Proposed daily translation                     |
| Initial / maximum influence               | 1 / 5                                                  | Retained                                       |
| Ballot duration                           | Current day's voting phase                             | Proposed daily translation                     |
| Government / federation founding cost     | 10 / 50 mind                                           | Retained                                       |
| Federation joining cost                   | 10 mind                                                | Retained                                       |
| Federation formation approval window      | 5 consecutive cycles, including first approval day     | Retained duration; proposed boundary           |
| Permit lifetime                           | 1 movement phase                                       | Proposed daily translation                     |
| Maximum exit notice / last-place sanction | 1 cycle / 1 harvest phase                              | Proposed translation of 100 ticks              |
| Sanction application window               | Next cycle's officer phase after authorisation         | Proposed daily translation                     |
| Federation exit notice                    | 1 full cycle                                           | Retained duration                              |
| Federation dispute window                 | 5 cycles                                               | Retained                                       |
| Immigration sanction lookback             | 10 cycles                                              | Retained                                       |
| Agent decision budget                     | 100 ms compute per callback; configurable              | Retained target, adapted to phased callbacks   |
| Private memory limit                      | 1 MiB serialised per individual; configurable          | Proposed                                       |

With 300 individuals and six plots, field capacities are 400, 500, 600, 400, 500 and 600. Their initial stocks are 320, 400, 480, 320, 400 and 480. Government capacities are respectively 400, 500, 600, 400, 500 and 600. Capacity is based on the initial setup, not the changing resident count. Population changes never resize a container automatically.

For other counts, assign integer field capacities by largest remainder after proportional division, breaking equal remainders by plot ID. Reject setups producing a zero-capacity plot. Team identity confers no ownership, automatic alliance, privileges or communication channel. Everyone begins outside all plots.

Carrots are whole units. Body and mind may be fractional. Use fixed precision for mind charges and proportional pledges so rounding never creates energy. Satisfaction may be stored at higher precision and rounded only for display. Proposed precision is one millionth of a mind unit; charge rounding uses largest remainders with stable IDs.

## 3 Daily cycle and activation

**Agreed:** every living individual can decide in every relevant phase. There is no single action token for the whole day. **Proposed:** all individuals choose from the same permitted snapshot for a given decision substep. Contested actions then resolve in a reproducible order. An agent does not secretly receive another agent's later result before making its own decision.

| Phase                                  | Decisions and resolution                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Environment                          | Apply yesterday's institutional decisions; expire permissions; respawn eligible individuals; generate weather; add mind; fund services; execute queued orders and transfers; grow fields.                           |
| 2 Movement                             | Individuals request one destination or remain. Apply permits and current entry/exit rules. Release pledges and offices when membership ends.                                                                        |
| 3 Harvest                              | Resolve each individual's harvest request, active government field collection, and active storage taxes in the defined order, using today's funded service status.                                                  |
| 4 Governance preparation and proposals | Individuals reserve or release mind pledges; request and pay for permitted records; receive those records; submit proposals. Officers with an explicit federation proposal mandate can propose at federation level. |
| 5 Voting                               | Freeze electorates and influence; collect all eligible yes/no/abstain choices; resolve ballots and conflicts; schedule winning decisions for the next cycle.                                                        |
| 6 Officers and transfers               | Authorised officers submit orders for next cycle. Individuals offer and accept food, voluntarily deposit in government stores, or cancel offers.                                                                    |
| 7 Eating and thinking                  | Each individual chooses its meal and thinking amount. Resolve eating and survival first, then thinking for survivors. Apply death and inheritance.                                                                  |
| 8 Close                                | Save results, send private end-of-day observations, and advance the clock. At month end, perform the reset procedure instead of an ordinary next day.                                                               |

### 3.1 No retroactive decisions

An action on day D uses the rules active on day D. A rule voted through on D becomes active at the start of D+1. A government founded on D cannot accept policy proposals until D+1. An officer appointed on D cannot issue an officer order until D+1; that order executes at the start of D+2. This explicit extra day for newly appointed officers is a proposed consequence of next-cycle activation, not an instant grant of authority during the ballot that creates it.

An approved one-off distribution, fine, expulsion, donation or permit also activates next cycle. Voluntary personal gifts and personal deposits are ordinary actions rather than approved institutional decisions and can complete in the current transfer phase.

### 3.2 Deterministic boundary rules

Proposed order at the start of a normal day: expire old offices and authorisations; apply dissolutions and exits whose notices have completed; establish approved institutions and joins; apply rule changes, influence and appointments; respawn eligible individuals; generate weather and credit mind; fund services; execute previously authorised one-off actions and officer orders; grow fields. Service charges use the living resident count at the funding step, before queued expulsions and voluntary movement. Paid coverage lasts through that day, including arrivals; departures receive no refund. Removal of a government cancels its other pending changes. Leaving a federation cancels actions that require that membership. A person leaving or dying loses powers attached to the old membership.

Every queued operation is checked again against current membership, authority, evidence, funded service status where required, and available resources. It may become invalid. Rejection returns an explicit reason; it does not invent replacement policies. A simultaneous rule change cannot make yesterday's lawful harvest a breach.

A valid institutional authorisation schedules an action; it does not reserve all future food. Competing transfers can therefore be short of carrots at execution. Within each boundary category use a seeded random ordering, recorded in the replay, with plot ordering policies applying where specified. There is no hidden advantage from team number or proposal arrival time.

### 3.3 Invalid decisions and timing

Invalid or unaffordable actions have no effect and no mind charge. Valid submissions that later lose a vote or fail because circumstances change do not refund proposal or voting costs. Harvesting, eating and explicitly bounded food transfers may partially succeed; other actions are atomic.

An agent supplies an ordered list of proposals and votes. Each valid item is charged in that order until available unpledged mind is insufficient. No numerical proposal limit or single-ballot queue is imposed. A callback that exceeds its compute budget becomes a no-op for that callback and reports a timeout; it is never replaced by an undisclosed fallback strategy. Protective transport limits must fail clearly, not silently truncate legitimate proposal lists. The no-cap rule does not imply infinite execution time.

## 4 Body mind food and satisfaction

### 4.1 Eating and survival

Eating is explicitly chosen. The agent submits a nonnegative integer meal amount, and eats up to that amount from its unreserved personal carrots. Government reserves and field stock are not eaten directly. The engine never adds an automatic survival meal.

**Proposed daily body accounting:**

`body at close = min(body capacity, body at start of eating + carrots eaten - daily food need)`

If the result is zero or negative, the individual dies and body becomes zero. This accounts for food use throughout a day without a hidden tick clock. It avoids incorrectly discarding a survival meal at the body cap before applying the day's food need. Body does not drain between phases. A body of 2 with a two-carrot meal remains 2; a body of 2 with one carrot ends at 1; a body of 2 with no food dies.

### 4.2 Satisfaction

Let `e` be the carrots actually eaten that day and `d` the daily food need. Extra carrots are `x = max(0, e - d)`. Food satisfaction is `log2(1 + x)`. The first d carrots give no food satisfaction even when the individual's body was already high. There is one daily meal in this draft; splitting internal requests cannot reset the daily extra-carrot counter.

Thinking converts a chosen amount of unpledged mind into satisfaction at one for one. It has no diminishing returns. Proposed resolution caps a requested thinking amount at available unpledged mind. An individual that dies in the eating step does not think afterwards. Stored carrots, remaining mind and government reserves do not score.

Satisfaction accumulates within the month, survives ordinary deaths, and is reset by the meteor. Monthly history is retained for observation; it is not spendable, transferable or automatically supplied to agents after a reset.

### 4.3 Individual stores and transfers

Personal stores travel with their owner. No carrot spoils. A physical capacity prevents additional receipts once full; a political holding limit can be lower but never higher than that capacity. Reserved food in a live offer occupies capacity and cannot be eaten or fined until the offer is accepted, cancelled or expires. Proposed taxation rule: it remains part of the sender's taxable ownership; if a tax must take reserved carrots, cancel the offer first and report that cancellation to both parties. Reserving an offer does not shelter wealth from a tax.

Retain one open personal food offer at a time. Same-plot gifts are available without a government. Cross-plot gifts require an active funded federation gift policy and membership in that federation. An offer costs mind; acceptance is free. Proposed transfer substeps are offers/cancellations, then recipient decisions against the visible offers. Acceptance succeeds atomically only if the recipient can hold the whole offer. An unaccepted offer expires at the next day's transfer-phase opening. Ownership, plots and permissions are rechecked when accepting.

There are no prices, enforceable private debts or binding future promises. Mind cannot be transferred. Voluntary deposits to government storage are allowed once that store exists; excess carrots remain with the donor. Donations create no ownership claim or guaranteed withdrawal right.

## 5 Plots growth weather and movement

### 5.1 Field growth

Retain automatic growth with no farming action. At the environment phase, use that plot's opening living population n, field stock F and capacity K:

`daily growth = g × min(n, K / c) × F / K`

Accumulate fractional growth between days, add whole carrots and cap stock at K. Proposed detail: discard growth overflow at capacity; an empty field also clears any fractional growth remainder. An empty field or unoccupied field produces no growth. Residents arriving during movement contribute to the following day's growth.

A government store is harvested inventory, separate from the field. It neither grows carrots nor contributes to F. Moving carrots out of the field can weaken future growth. Retain the rule that an exhausted field can be revived by an authorised donation from a fellow federation plot. Government reserves may supply such a donation under an enacted federation policy. Returning a valid fine to the field can also restock it. This is a proposed resolution of the source's overlapping statements that only federation donations revive empty fields, yet fines return carrots to field stock. There is no free personal sowing action.

### 5.2 Weather

Agreed: every resident of a plot shares its weather-dependent regeneration rate; each has its own mind balance and cap. Weather does not change carrot growth in this draft.

| Proposed state | Mind per resident per day |
| -------------- | ------------------------- |
| Sunny          | 12                        |
| Cloudy         | 8                         |
| Dark           | 4                         |

Proposed weather process: each plot starts with an equal-probability state; each following day it retains that state with probability 0.6, or changes to either other state with probability 0.2 each. Plots have independent streams and identical baseline climates. State rates and transition probabilities are configurable. Outsiders receive 4 mind per day, also configurable.

Current weather for every plot is public; future states and internal random seeds are not agent-visible. Regeneration is credited before movement, using the individual's opening location. Moving toward sunny weather benefits future mornings, not the morning already credited. All mind gains stop at the individual's capacity, including pledged mind in that capacity. Respawning agents receive starting mind but no additional sunlight on that same morning. Monthly resets restore starting mind and draw the new month's first weather normally. Proposed first-day convention: all initial individuals, like respawns, receive no sunlight credit on month day 1; they start the first movement phase with exactly 6 mind. Normal daily credits begin on day 2.

### 5.3 Movement and action order

An individual belongs to one plot or none. Ungoverned plots have open entry and free exit. Movement costs no mind. Governed entry may be open, closed, decided by vote, or approved by an officer, with an optional membership cap. Exit may be free, require notice, a vote or an officer permit. Death always ends membership.

A requested direct move needs valid exit and entry together; otherwise the individual remains where it was. Requests needing approval appear as potential proposal subjects and officer cases. A vote or officer approval grants a permit for the next eligible movement phase. An exit-notice request filed on day D completes at movement on D+1 for a one-cycle notice, provided the individual remains a member; it must still request the destination then. The individual must request the move again; an approval is not a forced move. Entry-cap races are resolved in seeded random order. Proposed capacity accounting allows only vacancies already available at the time each move resolves; simultaneous full-plot swaps are not guaranteed.

Leaving removes local influence and offices, releases local pledges, and cancels unapplied sanctions. Rejoining restores starting influence and does not reset daily harvest counts. Free exit carries personal carrots away; there is no exit levy in this draft. Lowering a population cap does not expel existing residents.

Plot harvest order can be random, rotating, lowest-body-first or highest-influence-first. Apply the chosen order only to that plot's residents within their positions in the global seeded order. Ties are seeded random. Last-place sanctions override the plot's normal priority; multiple sanctioned residents retain their relative normal order after all other residents. Rotating order maintains a resident queue; new residents append, departures are removed, and the first position rotates once daily.

## 6 Government formation and voting

### 6.1 Zero-rule formation

Any resident may propose forming a government. Government founding uses one person one vote and requires yes from more than half the frozen resident electorate, plus 10 pledged mind by ballot close. The cost is charged only on success. A successful founding activates next morning and creates an empty government store.

No founding proposal may bundle a ration, tax, officer appointment, storage policy or service. The new government initially preserves open entry, free exit, random harvest order and unrestricted harvesting within physical limits. Records and enforcement services are off; there are no officers, permitted sanctions or automatic distributions. No operating fee is due merely for existing.

The minimal decision procedure is part of the simulator: residents can propose, begin with influence 1, and decide policies by majority. This procedure enables rule creation without pretending that a zero-rule institution can bootstrap voting from no procedure at all.

### 6.2 Proposals and ballots

A proposal identifies its institution, author, exact policy key, requested value or bounded action, and relevant target/evidence. It is validated against the current day's powers. Proposed design: one independently enactable subject per proposal, with its required parameters together. For example, an officer appointment includes identity, powers, limits and expiry as one coherent appointment. Arbitrary bundles of unrelated policies are disallowed.

Every valid proposal opens for the current voting phase, except a federation dispute, whose explicit five-cycle procedure is defined in section 10.3. Electorates, influence, representative roles and thresholds are frozen at voting-phase opening, after movement. Later changes cannot alter that ballot. A member with influence zero may abstain but has zero voting weight. Initial proposal rights include all members, including those with zero influence.

Ordinary local proposals pass with yes influence strictly greater than half of all eligible influence. A government may change this to at least two thirds. Abstention and nonparticipation do not reduce the denominator. Founding remains one person one vote. Changing the decision procedure uses the old procedure.

Each agent can vote on every ballot for which it is eligible, paying for each yes or no vote. An explicit abstention costs zero. Proposed simplification: one final choice per callback and ballot; duplicate choices in a returned list are invalid for that ballot. Ballots close at the end of the phase, not early when a threshold is reached.

Exact duplicate proposals remain separate ballots and are charged separately; their support is never added together. If the same policy value wins on multiple ballots, apply that value once. This prevents duplicate submission from multiplying support or repeating the same one-off transfer. Proposed identity rule: the engine derives a canonical action identity from operation type, source, recipients, amount, execution day and any evidence event; author names and arbitrary submitted IDs cannot make identical actions distinct. To request two identical transfers for the same day, propose their combined amount as one action. Transfers with materially different parameters remain separately voted actions.

### 6.3 Conflicts

Different values for the same policy key conflict. Among passing candidates, greatest yes influence wins. Equal support for different values leaves the active value unchanged. Failed proposals never defeat a passing proposal. Compatible changes apply together.

Proposed extension for interactions: an officer's appointment/replacement/removal shares that person's office key; expulsion supersedes that person's new appointment; dissolution supersedes changes to the dissolved institution. Changes that are structurally impossible together are rejected as a conflicting set with a visible reason, rather than resolved by arrival order. Independent spending approvals can coexist but remain subject to execution-time balances.

Only one government can exist per plot. Identical successful founding proposals establish one government and charge its founding cost once. No proposal author gains an office merely by founding it.

### 6.4 Continuity and reform

Governments can amend or repeal any permitted local rule, appoint or remove officers, or dissolve. If every resident has zero influence, or nobody living is allowed to propose, restore proposal access to all residents and reset everyone to starting influence. These retained safeguards prevent irreversible political deadlock and do not select substantive policies.

A plot with no living residents loses its government. Proposed dissolution handling: return government reserves to field stock up to field capacity, delete overflow, cancel offices and pending decisions, release mind pledges, and end federation membership. The field remains. This is a disclosed default distinct from inheritance of a dead person's private store.

## 7 Policy catalogue and delegated powers

The interface exposes valid proposal types and mind costs, not a purchasable list of automatic outcomes. Spending proposal mind buys deliberation; a successful vote is still required. A proposal can be refused by the electorate. There is no separate unlock currency or permanent upgrade tree.

| Local policy family         | Available choices and parameters                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Harvest order               | Random, rotating, lowest body, highest influence.                                                                       |
| Entry                       | Open, closed, vote, officer approval; optional population cap.                                                          |
| Exit                        | Free, notice, vote, officer approval.                                                                                   |
| Harvest ration              | Unlimited, common daily quota, or per-member quota.                                                                     |
| Ration enforcement          | Soft, or paid hard enforcement.                                                                                         |
| Influence                   | Integer 0–5 per member; majority or two-thirds passing threshold.                                                       |
| Proposal eligibility        | All members, members with positive influence, or named officers.                                                        |
| Offices                     | Named members, explicit capabilities, target scope, quantity limits and expiry.                                         |
| Records                     | On/off; member, officer or named-person access.                                                                         |
| Sanctions                   | Enable warning, food fine, last-place penalty and/or expulsion; select field or government reserve as fine destination. |
| Government field collection | Fixed carrots per day or percentage of opening harvest-phase field stock; execution before or after personal harvests.  |
| Personal storage tax        | Fixed carrots or a percentage above an exempt balance; recipient is government storage.                                 |
| Personal holding limit      | A maximum at or below physical capacity; advisory or automatically collect excess into the government store.            |
| Reserve distribution        | Named or equal distributions, entitlement amounts, or delegated allocation under limits.                                |
| Inheritance                 | Delete, share equally among eligible surviving plot residents, a named beneficiary, or government storage.              |
| Treasury authority          | Who may order withdrawals, collection, transfers and distributions, within explicit bounds.                             |
| Federation representation   | Appoint/remove representatives; grant federation proposal or voting powers.                                             |
| Federation mandates         | Retain local membership/charter votes or delegate specified decisions to named officers.                                |
| Reform                      | Repeal policies, revoke delegations or dissolve.                                                                        |

**Proposed numeric policy domain:** percentages are 0–100, fixed amounts are nonnegative whole carrots, limits cannot exceed physical capacities, and officer terms are whole cycles or until revoked. For an inheritance beneficiary, the government's vote names the person; individual wills are not included in this draft.

Officers are individual agents acting through their own code. Appointment confers only the capabilities named in the approved office. An appointment may permit self-directed food distributions, prohibit them, or limit recipients to a named group. The simulator enforces that scope. Wide discretion can be granted by vote; officials may then use it selfishly within their authority. There is no hidden moral constraint requiring benevolence.

Officer orders cost the acting officer mind and need no additional ballot when within delegation. They schedule for next morning and are revalidated then. Expired or revoked authority cannot execute an outstanding order. Distinct mandates have cumulative per-officer daily quantity limits so splitting one instruction into many does not bypass a limit. Appointment does not automatically grant federation representation, records access or unrestricted treasury use.

## 8 Government reserves taxation and inheritance

### 8.1 Carrot collection and distribution

Government reserves are plot-owned harvested food. Officers access them only through authorised operations. Residents cannot simply withdraw. Governments can obtain food through voluntary deposits, enacted field collection, enacted taxes, authorised fines or inheritance. None occurs by default.

**Proposed daily collection order:** optional pre-harvest field collection; personal harvests; optional post-harvest field collection; personal storage taxes; compulsory excess-holding collection. A collection policy selects only one of pre/post harvesting. Tax applies once per resident per day, after harvesting, to owned stored carrots including those reserved in an offer. Round fractional percentage charges down. Apply a percentage above exemption E to `max(0, owned storage - E)`. A fixed levy is also bounded by the available amount above E. No tax debt is created.

All collections are limited by source stock and destination capacity. Anything that cannot fit stays with its source. When a collection target exceeds available storage, the actual receipt is smaller and the receipt explains why. Advisory holding limits do not confiscate; compulsory limits collect only the excess that fits. A full treasury can therefore leave holdings above the policy limit. This is reported as unenforced excess, not destroyed food or a fabricated offence.

Proposed enforcement distinction: enacted taxes and collection rules execute mechanically, like entry controls; paid hard enforcement applies specifically to harvest quotas. An institution cannot secretly tax a private balance outside its current legal power. Tax execution reveals the amount collected to the government; it does not grant general visibility into private stores. This creates a real distinction between authority to collect and authority to inspect.

An enabled distribution policy is either a standing daily instruction or a scope for officer orders; its proposal says which. Compulsory excess-holding collection also counts reserved carrots as owned and cancels an offer if necessary to collect them. Standing instructions execute at the morning boundary from existing reserves. Missing food causes partial delivery with no debt. A newly approved entitlement cannot feed someone on the vote day. Carrots received next morning can be eaten that evening.

### 8.2 Equal allocations and capacity

Proposed equal-sharing algorithm: divide available carrots as evenly as possible among living eligible recipients with free capacity. Repeatedly redistribute shares that cannot fit. Assign indivisible remainder carrots by a seeded random recipient order and record it. If no eligible capacity remains, the unallocated carrots stay in the source treasury. This rule conserves food and makes rounding visible.

### 8.3 Death and inheritance

Ordinary death removes food, mind, pledges, plot membership, influence and offices. It cancels offers and unapplied sanctions; reserved offer food is released into the deceased's estate before inheritance. Personal memory and monthly satisfaction remain. A respawn starts outside all plots with full body, starting mind, no food and no office.

Default inheritance deletes all stored carrots. An enacted rule can direct them to the government reserve, a named living beneficiary, or equal shares among surviving residents of the deceased's plot. Proposed beneficiary scope: the named person must still be a living resident of that plot at allocation; inheritance does not silently create an unrestricted cross-plot gift channel. Proposed boundary: resolve all deaths for the day together, then allocate estates to the remaining living recipients. Another person dying in the same phase cannot receive an estate. Ineligible recipients, missing government storage and any capacity overflow result in deletion; there is no debt or later claim. The rule active on the day of death applies. Resolve estates before dissolving any government left with no living residents; food inherited into that government store then follows the dissolution rule. Personal and government dissolution deletion are logged separately.

A death on day D with a one-cycle respawn delay skips all of D+1 and returns at the environment phase of D+2. This missed-cycle definition makes death impose an actual day without earnings.

## 9 Mind costs pledges records and sanctions

### 9.1 Costs

| Operation                                              | Mind cost                        | Payer                             |
| ------------------------------------------------------ | -------------------------------- | --------------------------------- |
| Move, harvest, eat, wait                               | 0                                | Individual                        |
| Think                                                  | Chosen amount                    | Individual                        |
| Propose                                                | 1 per accepted proposal          | Author                            |
| Vote yes or no                                         | 0.1 per ballot                   | Voter                             |
| Explicit abstention                                    | 0                                | None                              |
| Reserve/release a pledge                               | 0                                | Individual                        |
| Officer order                                          | 0.2 per accepted order           | Officer                           |
| Read records                                           | 0.2 per defined query            | Reader                            |
| Offer personal food                                    | 0.1                              | Sender                            |
| Accept/cancel food offer, voluntary government deposit | 0                                | None                              |
| Found government                                       | 10                               | Local mind pledges                |
| Hard harvest enforcement                               | 0.04 per living resident per day | Local mind pledges                |
| Records service                                        | 0.04 per living resident per day | Local mind pledges                |
| Found federation                                       | 50                               | Founding member pledges           |
| Join federation                                        | 10                               | Joining plot's federation pledges |
| Enabled federation operations                          | 0.5 per member plot per day      | Federation pledges                |
| Automated immigration check                            | 0.2 per applicant                | Receiving plot's pledges          |

Most costs are retained from the PDF. Free abstention and daily phases replace tick behaviour. Free voluntary government deposits and federation service activation charging are proposed additions. All costs are configurable before a run.

### 9.2 Pledges and service funding

A pledge reserves the owner's mind; it does not transfer it into a public mind account. Pledged mind counts toward capacity but cannot be spent thinking, proposing or voting. Each reserve has one destination: the local government/founding attempt, or one federation/founding attempt. The same mind cannot fund two destinations.

A charge draws proportionally from eligible reserves, with deterministic rounding. If the full cost is unavailable, charge nothing and do not perform that operation. Governance preparation allows new pledges and withdrawals before that day's founding ballots close. Leaving, death, dissolution or a failed founding attempt releases its unused reserved mind. A successful founding does not silently enlarge anyone's pledge.

Daily services are paid in the environment phase after mind regeneration and before queued transfers or movement, using the living resident count at that funding step. Priority is local hard enforcement, local records, then federation operations. The resulting status applies until the day closes. Immigration checks happen during movement using that day's funded status and remaining receiving-plot pledges; their extra query charges come after the recurring service charges. Newly made pledges after harvesting can fund founding that day and services on later days, not retrospectively record an earlier harvest.

If hard enforcement is not fully funded, the ration is soft for that day. If records are not funded, no new political records are written, but older stored records remain. Members can see the current service status.

**Proposed zero-rule federation handling:** founding has its one-off cost, but an idle federation has no daily upkeep. Enacting at least one operational federation service creates the 0.5-per-member daily cost. When this cost cannot be paid, operational cross-plot gifts, donations, data and records sharing are paused and immigration is Restricted. Its existence, representatives and ability to propose/vote remain, so it can recover or dissolve. Configured services remain enacted, with a visible unfunded state.

### 9.3 Records and visibility

Agents always see their own body, mind, food, satisfaction, memory, location, private receipts, and relevant pending actions. They see public map capacities and weather. Residents see local field stock, membership, enacted policies, open ballots, office scopes, and funded services. Proposed addition: local government stock and authorised government operations are public to its residents; private stores remain hidden.

Outsiders cannot see another plot's current field or treasury stock unless a funded federation data policy grants it. Other agents' mind, personal food and detailed histories require funded records and appropriate read access. Records contain facts actually recorded, not an omniscient current balance. A read costs mind and returns records as of the query. Proposed query scope is one subject or one plot and a requested day range; queries are paginated without extra charges for retrieving the same query's remaining pages.

Funded records log harvests, pledges, food transfers, collections, distributions and enforcement events while active. Proposed event schema includes actor, day, phase, relevant rule version, quantities and the affected actor's food/mind balances at that recorded event. Access can therefore reveal those historical balances, but cannot fabricate a current balance after unrecorded eating, thinking or movement. Local logs remain at the plot through ordinary government dissolution and can become accessible under a later government's record-access policy; ungoverned plots offer no paid record-reading service. Meteors erase the logs. Private action receipts remain available to the actor regardless of the records service. Proposed evidence submission permits an actor to attach a signed receipt to a proposal; doing so deliberately discloses that receipt to the electorate. Agents cannot manufacture authentic receipts.

The observer replay may contain full simulation state for inspection. Agent code never receives that observer view, other agents' memory or hidden random streams. A visible interface switch distinguishes observer information from what a selected agent was allowed to know.

### 9.4 Sanctions

Retain the evidence-based sanction process. A ration breach can occur under a soft ration, or a hard ration whose enforcement was unfunded. The engine checks the cited event against the rule and funded status at that event. It rejects an invalid accusation without a proposal charge. Storage taxes and other mechanically enforced controls do not create discretionary offences in this draft; advisory storage excess is information, not a new sanctionable offence.

Only sanctions explicitly enabled by vote may be used: warning, carrot fine, last place for a bounded harvest phase, and expulsion. A fine takes up to the available unreserved carrots, with no debt. Default destination remains the field; a voted policy can direct fines into government storage. Destination capacity limits collection, leaving anything that cannot fit with the target.

A valid sanction is approved by local vote, or ordered by an officer with delegated adjudication authority. A voted sanction becomes executable next cycle; its sanctions officer, or the original proposer if there is no officer, must submit its application order during that cycle's officer phase. It executes the following morning. Failure to submit within that cycle lapses the authorisation. A delegated officer can decide and submit the application as one officer order, for execution next morning. This preserves the distinction between authorisation and application without immediate same-day punishment.

Leaving or dying before execution cancels the sanction. A last-place penalty applies to the next eligible harvest after execution. Proposed evidence rule: each offending action can support at most one completed sanction; competing sanction choices for the same event conflict. Repeat accusations cannot extract repeated fines for one event.

## 10 Federations

### 10.1 Formation joining and representation

Two or more governed plots can form a federation. Their initial local authorisations name the same proposed membership and contain no substantive federation policies. Each local approval is taken under that plot's ordinary voting procedure unless an explicit membership mandate has delegated it. All necessary approvals and 50 pledged mind must be available within the five-cycle formation window. Charge once on completion and create the federation next cycle. If the window expires, release the attempt's pledges. A plot can belong to at most one federation.

Proposed concurrent-formation resolution: local authorisations for different federation memberships conflict as a single membership key. If cross-plot timing still leaves competing eligible formations sharing a plot, resolve by a recorded seeded order and reject the now-incompatible attempt without charging its founding cost.

The new federation has no enabled operational policies and no automatic movement privileges. Member plots continue their own entry/exit rules. Local Governance gains the ability to appoint federation representatives. A plot may grant these powers to an existing officer or appoint a dedicated representative. An unrelated officer has no federation vote merely by holding an office.

Representatives can propose if their mandate includes federation proposal rights. Only representatives with explicit voting power cast internal representative ballots. Within a plot they have equal weight, regardless of local political influence. **Proposed exact majority rule:** more than half of all eligible representatives must support Yes to produce a Yes plot vote; more than half must support No to produce No. Otherwise the plot abstains. Zero representatives means abstention, not an automatic resident vote.

Each member plot contributes exactly one plot vote. Adding representatives never increases its federation weight. Representative lists and plot membership are frozen when the ballot opens. Representatives pay their own proposal and voting costs. Residents can revoke or amend representation through local votes; those changes apply next cycle.

### 10.2 Federation decisions

Retain unanimity for the federation constitution: enabling, changing or removing a federation-wide policy, adding a member, or changing the charter requires Yes from every member plot. Proposed ordinary execution rule: one-off actions already permitted by the charter pass with Yes from more than half of member plots, except disputes as separately described below. Conflicting passing federation proposals compare supporting plot votes; tied different values preserve the status quo.

A joining plot separately authorises joining through its residents or expressly delegated officer. Existing member plots decide through their representatives. Joining requires the 10-mind joining charge and activates next cycle. Local charter-approval mandates can require resident ratification before representatives submit Yes, or delegate that discretion; the initial default requires resident authorisation for constitutional changes. That local authorisation can be obtained by vote on day D and used by representatives from D+1, so ratification cannot be bypassed by a same-day federation ballot.

A plot may decide to leave through a local vote or authorised membership officer. The decision activates next cycle and starts a full one-cycle exit notice. Membership ends the following morning. With fewer than two member plots, the federation dissolves and its pledges release. Local governments and their physical stores remain.

### 10.3 Federation policy catalogue

| Power            | Choices and limits                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Donations        | Permit transfers from a member field or authorised government reserve to another member field or reserve; vote or delegated local donor officer; optional daily limit. |
| Cross-plot gifts | Enable voluntary personal gifts between member plots.                                                                                                                  |
| Resource data    | Share member field and government reserve stocks.                                                                                                                      |
| Shared records   | Make funded recorded histories available across member plots, including earlier history retained locally.                                                              |
| Record access    | All member residents, specified officer roles, or named authorised officers.                                                                                           |
| Immigration      | Open passage up to capacity; Restricted local entry rules; or automated sanction checks.                                                                               |
| Disputes         | Specify permitted subjects and available remedies, with one plot one vote.                                                                                             |
| Delegation       | Define which donor or representative powers may execute an already-enabled operation without another federation ballot.                                                |
| Reform           | Change/remove charter powers, approve new members and dissolve.                                                                                                        |

A donation needs authority over the sending resources as well as federation permission. An enabled federation cannot unilaterally seize a member treasury. The donor plot votes or uses an authorised local officer, schedules the transfer and obeys its daily limit. One-off federation votes cannot bypass that donor authorisation.

Proposed daily transfer model: execute the scheduled donation atomically next morning; send only what fits, leave the rest at source. A donation into a depleted field seeds later growth. Cross-plot movements still need a valid origin exit even when federation immigration grants entry.

Automated checks deny entry when accessible funded records show an applied sanction within the preceding ten cycles. Each check requires funded shared records and the receiving plot's 0.2-mind query charge. Otherwise entry falls back to the receiving plot's Restricted rule. No funds or records means no automated inference of innocence or guilt. Open-passage capacity limits are never bypassed.

Disputes use a five-cycle window. Proposed implementation: open the case on its first valid proposal day and hold one final representative ballot on the fifth day, with case evidence readable meanwhile. Each plot's representatives produce one vote. More than half of all member plots must approve a remedy. Permitted remedies are declared in the charter and confined to previously delegated public powers, such as a warning or a bounded authorised public-resource transfer. No remedy confiscates private food or overrides physical rules. An unenforceable remedy is rejected explicitly.

## 11 Agent programming and memory

Teams supply strategies, as in the existing MVP. Each of the 50 copies has separate private state, decisions, random choices and experience. Shared source code is not shared runtime memory. Team code may implement adaptation in its private memory; the environment does not claim that memory retention alone produces learning.

The new agent contract is phase-aware. It provides observations and decisions for movement, harvest, pledges, record queries, proposals, voting, officer instructions, offers/acceptance, eating and thinking. Lists of proposals and votes must be supported. Personal phase receipts explain requested amount, actual outcome, mind charge and rejection reason. An explicit no-op is always legal.

Proposed memory contract: a serialisable private state object per individual, persisted after callbacks, with a configurable limit, initially 1 MiB per individual, disclosed to team authors. End-of-day and end-of-month observation callbacks may update this memory without taking world actions or earning satisfaction. The month-end callback arrives before reset and includes only that agent's permitted terminal observations. This lets it remember its score and outcomes without granting hidden information from the observer dashboard. A timeout preserves the last successfully committed memory.

Reject a memory update that exceeds the configured size with a clear error and retain the last committed value; do not silently truncate it. Only the same individual's private memory survives a meteor. Source code and run settings remain configuration; all in-game balances, influence, offices, relationships, pending messages/offers, records, counters and world history are reset. Agents can deliberately store their own observations in memory. They cannot query previous-month replay data, another copy's state, or an external shared team store.

Proposed initial scope retains both uploaded Go behaviours and a visual builder. The builder must produce the same legal phased actions as code, including policy proposals and ballots, and expose its limitations clearly. Examples include resource conservation, hoarding, political participation and delegation; none guarantees that an institution forms. There is no general private messaging service in this draft; coordination occurs through visible proposals, votes, offers and permitted records.

## 12 Monthly meteor and evaluation

Default run length is twelve 30-day months. There are eleven between-month resets within the measured year. The final month ends with the same terminal reporting and reset visual, without silently simulating a thirteenth month. This defines the requested yearly structure without an extra unscored learning period.

At month end: finish the day's normal eating/death/thinking; issue each individual's terminal observation; freeze the month's results; cancel all pending actions; reset world state; then start the next month with retained private memory. Decisions approved on day 30 are logged as passed but never activated if they target the erased world. The UI must show that consequence before replay reaches the boundary.

Every month starts with all individuals alive outside plots, full body, starting mind, no food, zero satisfaction, empty government stores, initial field stocks, no governments, no federations and no political records. Meteor removal does not trigger inheritance: all stores are erased together. An ordinary death shortly before reset does not postpone that individual's new-month return.

The run seed creates independent named streams for weather, action order and other lotteries, with a distinct month index. Resetting does not repeat exactly the same random weather sequence. Identical configuration, code, seeds and deterministic memory updates must reproduce the same outcomes. Agents receive private random facilities without access to the world's future weather stream.

Report individual monthly satisfaction; team mean and total monthly satisfaction; deaths and active/survived days; carrots harvested/eaten/stored; mind spent thinking, governing and funding services; and plot population, stocks, institutional rules and funding through time. Retain the twelve monthly scores separately. Proposed year comparison is mean monthly team satisfaction across the same population and seed set, with the month-by-month curve visible; it is an observer statistic, not carried in-game satisfaction.

Learning claims require evaluation. Compare adaptive code with the same code whose memory is reset each month, across multiple seeds, before attributing improvement to memory. Programmed institutions or a rising score in one weather sequence alone do not establish learned cooperation.

## 13 Interface and visual experience

The product should feel like a considered simulation game, with information available at the point it explains an event. Use restrained animation, clear typography and stable visual identity for teams, individuals and plots. The scientific purpose remains legible without presenting the user with implementation terminology.

| View               | Required experience                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| World              | All plots with weather, population, field stock, government reserve, institutional status and visible migration routes. Distinguish field and treasury visually.    |
| Plot               | Click through to residents, government status, active rules, open proposals, vote results, officers, funding and the local timeline.                                |
| Individual         | Body, mind, reserved mind, carrots, satisfaction, current behaviour, recent choices and their outcomes. Distinguish observer access from agent-visible information. |
| Governance         | Available proposal categories with eligibility and mind costs; active proposals show exact before/after rule, electorate, threshold and activation day.             |
| Federation Council | Members and representatives, each plot's aggregated vote, charter powers, operational funding, donations, records and disputes.                                     |
| Replay             | Play/pause, phase step, day step, speed control and timeline seek; filters for a plot, individual, policy or event.                                                 |
| Month boundary     | Clearly announced meteor, final monthly results, visible reset, then the next month's population returning with memory retained.                                    |
| Results            | Monthly trajectories, team comparisons, individual inspection and policy/resource timelines.                                                                        |
| Setup              | Tune plots, population, month length, capacities, weather, costs and seed; load six behaviours and explain the resulting run size.                                  |

The map should communicate 300 agents through clustering and counts, with selectable individuals inside a plot. Avoid requiring 300 overlapping portraits to understand the world. Government and federation indicators appear only when institutions exist. Disabled powers explain the missing authority; empty institutions explicitly show that no rules have been enacted.

Proposal states must distinguish submitted, invalid, open, passed, failed, tied, superseded by a conflicting winner, scheduled, activated, lapsed and cancelled by reset. Resource transfers show where carrots came from and went, including deletion or capacity-limited amounts. Unfunded hard enforcement must visibly read as a soft ration for that day.

The observer may inspect but does not vote for autonomous agents or override the outcome during a scored run. Scenario presets and test controls belong in clearly separate setup/debug modes. Sound, motion and colour are optional aids: support muted playback, reduced motion, keyboard navigation, text alternatives and colour-independent status cues. Browser animation speed never changes simulation results.

## 14 Worked examples

All amounts below use the draft defaults unless explicitly stated. These examples are acceptance scenarios for the specification, not claims about observed agent behaviour.

### 14.1 A day with chosen eating and thinking

At the start of day 4, A has body 2, mind 2 and 5 carrots. Its plot is Cloudy, so mind rises by 8 to 10. Its government permits this harvest and A takes 4, leaving personal storage at 9. It spends 1 mind on a proposal and 0.1 on one Yes vote, leaving 8.9 unpledged mind.

A chooses to eat 5 and think with 6. Storage becomes 4. Body closes at `min(2, 2 + 5 - 2) = 2`. Three extra carrots give `log2(4) = 2` satisfaction. Thinking adds 6. It earns 8 satisfaction and ends with mind 2.9. It could instead retain more food, spend more mind politically or think more. Those are its decisions.

On the next day, its extra-food counter starts at zero. Eating three carrots would yield one extra carrot and 1 food satisfaction, irrespective of yesterday's meal.

### 14.2 Founding does not create rules

Twenty residents occupy an ungoverned plot. Two valid founding proposals are raised. On one ballot 12 residents vote Yes, five No and three abstain, so it passes because 12 is greater than 10. Eligible founding pledges total 10. The institution is charged 10 once, even if the second identical founding ballot also passes.

The government appears next morning with an empty reserve. Harvest remains unrestricted within physical limits; movement stays open; nobody has an office. Residents can now propose a tax, ration, officer or record service. They must vote those policies through separately. The founders receive no special powers.

### 14.3 Conflicting rations and a tie

A government's frozen electorate has total influence 20 and a majority threshold, so a proposal needs more than 10 Yes influence. A quota of 3 receives 13 Yes; a quota of 5 receives 15 Yes. Both pass, but quota 5 wins the conflict and activates tomorrow. An independent records proposal can also pass and activate.

If the two quotas each received 15 Yes, neither would replace the existing quota. If two proposals both requested quota 5, their support would not be summed; the same resulting rule would activate once. Votes and valid proposal costs remain spent regardless of the conflict outcome.

### 14.4 Proposing and voting compete with thinking

B begins the proposal phase with 5 unpledged mind. It submits four valid proposals, costing 4. It then votes Yes or No on six ballots, costing 0.6, and abstains on all others for free. It has 0.4 left to think with. There is no fixed proposal-count ceiling; with more mind it could submit more. Its current limit follows from available mind.

An officer with a previously granted distribution mandate can instead issue an eligible distribution order for 0.2 mind without making the population vote again. This saves deliberation costs but gives that officer real discretion.

### 14.5 Taxes and limited officer discretion

A plot has an active 25% storage tax above an exemption of 4 carrots. After harvest, C has 12 unreserved carrots. Its charge is `floor((12 - 4) × 0.25) = 2`. C retains 10 and government storage gains 2. A resident with 4 pays zero. A full government store collects zero and reports the capacity limit.

The government previously appointed O with power to distribute at most 6 carrots per day to residents, excluding O itself. On day 8, O orders 4 carrots for D and 2 for E, paying 0.4 mind for the two orders. These execute on day 9 if O still holds authority and resources permit. An extra order for 1 would exceed O's daily authorisation; an order paying O is outside scope. Both are rejected.

Residents could vote to permit self-payments or widen the limit, but those changes take effect on a later day. The simulator does not silently broaden the delegation.

### 14.6 A soft breach and a funded hard limit

A plot has 50 residents and quota 2. Hard enforcement costs `50 × 0.04 = 2` mind for the day. Pledges total only 1.5, so none is charged for enforcement and the ration is soft. F harvests 4, breaching the quota by 2. The records service also costs 2 and cannot run on that 1.5-mind pool. There is therefore no funded record of the breach; F can nevertheless disclose its own authentic receipt, which supplies the evidence in this example.

A valid proposal on day 6 seeks an enabled fine of 3 and passes. On day 7 its authorised applier submits the application order. On day 8 the fine executes if F still belongs to the plot. F has 2 unreserved carrots and the destination has room, so the fine takes 2 with no debt. If F has left, the order is cancelled.

If enforcement had been fully funded on day 6, F's harvest request of 4 would instead have received at most 2. That would create no ration breach to sanction.

### 14.7 Inheritance with limited room

G dies with 9 carrots. Without an inheritance policy all 9 are deleted. Under an equal-sharing policy, three surviving residents have free capacities 1, 4 and 10. Start with 3 each; the first can accept only 1. Redistribute the remaining 2 to the other recipients, producing allocations 1, 4 and 4. No carrots are created or lost in this case.

If a named-beneficiary rule instead directs all 9 to H, and H has room for only 5, H receives 5 and 4 are deleted. If H dies in the same eating phase, H is ineligible and all 9 are deleted. G's ordinary respawn does not recover the estate.

### 14.8 Representatives produce one plot vote

A federation contains plots A, B and C. A has three representatives: two vote Yes and one abstains, producing A's Yes. B has two: one Yes and one No, producing abstention. C has one who votes Yes. The result is two Yes plot votes out of three, regardless of A having more representatives.

That passes an ordinary majority decision already within the charter, but does not pass a charter change, which requires all three plots. If B's two representatives both vote Yes on the charter change and each plot has its required local authorisation, it can pass. The new policy activates next cycle.

### 14.9 Weather migration and resource recovery

I begins in a Dark plot with mind 2, receiving 4 and reaching 6. It sees another plot is Sunny and moves there under open entry. It receives no second sunlight credit that day. If its new plot is Sunny again tomorrow, its mind can replenish by up to 12, capped by capacity.

Separately, a member plot has field stock zero and cannot grow. A funded federation donation policy and donor authority allow 40 carrots from another plot. The approved transfer executes next morning. If the receiving field then has capacity 500 and 50 opening residents, its growth that morning is `4 × 50 × 40 / 500 = 16`, leaving 56 before harvesting. This is possible because boundary transfers precede growth.

### 14.10 A meteor resets institutions and scores

At the end of month 1 day 30, J has monthly satisfaction 120, personal food 8 and a treasury office. Its private terminal observation lets its code save a memory such as its own prior score, experienced shortage count and a strategy parameter. A tax passed that day is still scheduled, not active.

The meteor removes all individuals and stores together, clears governments, federations, records, offices, satisfaction, pending taxes and ordinary respawn timers, and restores the initial fields. Inheritance does not run. Month 2 begins with J alive outside, body 2, mind 6, food 0, satisfaction 0 and its retained private memory. Its agent may adapt using that memory. The observer can still inspect month 1's score of 120, but month 2 does not start with that score or that office.

## 15 Engineering requirements and verification

The deliverable is a reproducible, documented GitHub base for teams to extend. Retain the existing Go simulation foundation unless inspection during implementation demonstrates a concrete reason to change it. Separate world mechanics, policy validation, agent observations and replay rendering so neither the visual builder nor the interface becomes an alternative source of game rules.

Version the new settings, agent contract and replay format. Existing two-number harvest/contribution behaviours cannot accurately represent this system; label them as legacy rather than silently translating them into political agents. Preserve existing saved artifacts without overwriting them. A legacy replay may stay readable through its old viewer, while new runs use the new engine. Hosted execution of uploaded code remains isolated per individual; a local run must also avoid cross-copy mutable state.

Store daily and event changes with enough information to reconstruct inspected moments without copying all 300 full individuals after every minor event. Long runs must support progress and cancellation. The final implementation must demonstrate a complete 300-individual, 360-cycle run and report actual time, storage and playback behaviour; this specification does not claim a benchmark already achieved.

Acceptance checks include:

1. All ten worked examples produce the specified accounting and timing.
2. A zero-rule government and federation change no movement, harvesting or distribution policy by mere formation.
3. Every hidden agent field stays inaccessible through observations, builder previews and record endpoints.
4. Arbitrarily many valid proposals within resources can be processed without a hidden ballot queue or silent truncation.
5. Electorate snapshots, strict majority/two-thirds boundaries, conflicting values and duplicate proposals behave deterministically.
6. Revocation, death, departure, dissolution and meteor reset invalidate the correct pending powers and operations.
7. No transfer, partial fill, tax, inheritance allocation, pledge draw or rounding step creates carrots or mind. Deletion and growth are separately logged.
8. A whole day without eating can kill an agent; sufficient deliberate eating preserves its body; no automatic meal occurs.
9. Food satisfaction resets daily, thinking remains linear, and monthly satisfaction resets at the meteor.
10. Only private memory crosses a month boundary; monthly history remains observer-only unless the agent itself stored allowed observations.
11. Services have correct funded/unfunded behaviour, including fallback immigration and soft quotas.
12. All policy families are available to code and represented clearly in the interface; unauthorised controls explain their restriction.
13. Identical seeds/settings/strategies reproduce runs; rendering speed and replay seeking cannot alter outcomes.
14. The full-year setup runs end to end with replay, inspection, monthly results, reduced motion and keyboard navigation checked.
15. A clean repository checkout can install, run example strategies, execute checks and reproduce a documented example without relying on the author's machine.

## 16 Coverage of the supplied ruleset

| Original section            | Treatment in this specification                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Setup                     | Retained configurable world/physical settings; expanded to 300 agents, variable plots and twelve months.                                                                               |
| 2 Time and turns            | Replaced ticks and one-action limits with daily phases and explicit next-cycle activation.                                                                                             |
| 3 Amoeboids                 | Retained body/mind separation, chosen eating/thinking and ordinary death; removed spoilage; changed food satisfaction and inheritance.                                                 |
| 4 Plots                     | Retained endogenous growth, movement restrictions and exhaustion; added weather and separate government stores.                                                                        |
| 5 Actions                   | Adapted actions to phase callbacks and added treasury/representation operations.                                                                                                       |
| 6 Visibility                | Retained private state and paid records; added public weather and observer/agent distinction.                                                                                          |
| 7 Governments               | Replaced default charter with zero-rule founding and removed the proposal cap/queue; retained pledges, voting and continuity.                                                          |
| 8 Government powers         | Retained every original family; added taxation, storage, inheritance and explicit federation mandates.                                                                                 |
| 9 Enforcement and sanctions | Retained funded hard rations, evidence and application; translated deadlines into cycles.                                                                                              |
| 10 Federations              | Retained formation, joining, donations, gifts, data, records, immigration and disputes; replaced resident federation decisions with authorised representatives and zero-rule founding. |
| 11 Fixed rules              | Retained physical laws and memory privacy; replaced tick limits and the blanket ban on private-food collection with explicitly voted tax/inheritance powers.                           |
| 12 Scoring                  | Retained satisfaction and separate diagnostic outcomes; added daily logarithmic food returns and monthly reset/history.                                                                |

Governments and federations still cannot create carrots or mind, change weather physics or growth equations, alter the clock, exceed physical capacity, access private memory, retroactively rewrite a ballot or offence, or carry institutional power through a meteor. They can exercise only the catalogue's explicit powers, subject to enacted permissions.

## 17 Review focus and source basis

The experience and core mechanics are agreed. The proposed operational details most likely to affect strategy are taxes including reserved food, the opening-population service charge before movement, the extra day needed for newly appointed officers to act, strict majority of all representatives rather than votes cast, local ratification of federation constitutional changes, collection before/after harvest, free mechanical taxation versus paid harvest enforcement, the full missed respawn day, the late-month expiry of pending decisions, and the selected storage/weather defaults. These should be checked against the intended game before implementation starts.

Source basis: the supplied **Amoeboids Ruleset.pdf** (14 pages, sections 1–12), the supplied **Amoeboids.pdf** playthrough (18 slides), and the design decisions in this conversation through 15 November 2026. The playthrough is illustrative; it does not script what autonomous agents must do. This draft supersedes the PDFs only where its agreed changes or explicitly proposed replacements say so.
