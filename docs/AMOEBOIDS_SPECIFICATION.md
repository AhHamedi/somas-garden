# Amoeboids MVP specification

Revised 22 November 2026

## The game and its clock

Six teams each supply a strategy. Fifty individuals run each strategy independently in the default experiment. At the beginning of each month, every Amoeboid chooses a plot. It stays there while active. Its daily choices concern how to use that plot’s crop, how to vote and whether to help others. It can choose another plot at the next monthly reset.

The objective is individual satisfaction. Extra food and thinking add to the score. Team results report the performance of all copies of that strategy. A representative’s carrot holdings and a resident’s voting tokens have no score of their own.

| Default setting        | Value                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Run                    | 6 plots, 300 individuals, 12 months of 30 days                                                                             |
| Starting field stock   | 80% of each field’s capacity                                                                                               |
| Field capacity         | 10 carrots per starting individual across the world, apportioned across plots in repeating proportions of 0.8, 1.0 and 1.2 |
| Body and food          | Body starts full at 2. Daily food need is 2 carrots.                                                                       |
| Mind                   | Starts at 6, with capacity 12. Sunny, cloudy and dark plots regenerate 12, 8 and 4 mind per day.                           |
| Personal food capacity | 12 carrots ordinarily, 60 for the elected Trade representative                                                             |

### What happens in a day

| Phase                       | Action                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Environment                 | Activate yesterday’s decisions, update plots and refresh voting tokens. Every individual chooses its plot on day one of the month. |
| Harvest order, then harvest | Residents submit rankings. The engine sets the order before collecting carrot requests.                                            |
| Proposals, then voting      | Residents submit motions and spend tokens to vote. Winning changes take effect the next morning.                                   |
| Transfers                   | Residents donate, Trade representatives choose gifts and Justice can issue sanctions. The deadline for blight relief falls here.   |
| Eating, then close          | Each active resident chooses its meal and thinking expenditure. The day closes with results.                                       |

Exclusion ends participation. An excluded individual stops harvesting, voting and acting, loses its roles, and its stored carrots disappear. At the meteor, the simulation saves each team’s monthly result and resets the fields, food, scores, roles, rules and tokens. Individuals return with their identities and private memories. They choose plots again.

## Harvest, eating and thinking

The **field** is the unharvested crop. Each harvest goes straight into the individual’s personal store. Carrots can stay there from one day to the next. If field stock or personal storage runs short, the unfilled part of a harvest request simply expires. An advisory quota may create grounds for a Justice sanction after a harvest.

### How the residents set the order

Each active resident may submit one array containing every active resident ID on their plot, including their own, from first to last. An empty array is an abstention. An incomplete ranking, duplicate ID or ID from another plot invalidates that ballot. The default aggregation is Borda counting. With N residents, first place earns N − 1 points, second earns N − 2 and last earns zero. Add each resident’s points across valid ballots and harvest from highest to lowest. A seeded draw orders tied residents and supplies the order if everybody abstains. Residents can also adopt a rule for random order. A Justice order placing someone last applies after the order is computed.

| Resident | Their ranking, first to last | Points their ballot awards |
| -------- | ---------------------------- | -------------------------- |
| A        | A, B, C                      | A gets 2, B gets 1         |
| B        | B, A, C                      | B gets 2, A gets 1         |
| C        | B, C, A                      | B gets 2, C gets 1         |

The result is **B, A, C**, on 5, 3 and 1 points respectively. Suppose the field contains nine carrots, each store has room, and each of the three asks for six. B gets six, A gets three and C gets zero. The nine carrots are now in personal stores. With no stock left, ordinary growth stops.

### Food and score

At dawn, each occupied plot grows a percentage of its remaining carrots, up to field capacity. The default is 40%. A field with 10 carrots and room to grow adds 4. Fractions carry over to the next day. Empty fields cannot regrow unaided. Worlds saved under the previous rules keep their original growth model.

New world settings give independent rewards for the first extra carrot and each mind spent thinking. Both default to 1 and either can be zero. Meal satisfaction is `overeating reward × log2(1 + carrots eaten above daily need)`. Thinking earns `thinking reward × mind spent`. With the defaults and a daily need of two, a meal of five earns two points. The body changes by the amount eaten minus daily need, up to body capacity. If it reaches zero the individual is excluded. An active individual can then spend available mind on thinking. With six mind spent, the five-carrot meal and thinking give eight satisfaction that day.

## Proposals, rule thresholds and voting tokens

Any active resident may submit a local proposal, including a motion to found a government. Founding takes a strict majority of eligible residents and a collective mind pledge of 10 by default. Once founded, the government lets residents adopt, amend or repeal a rule and elect or revoke a department holder. Proposing a valid motion costs one mind by default. Approved decisions take effect the following morning. If conflicting motions pass on the same subject, the one with the most Yes support wins. A tie between different outcomes leaves the current arrangement in place.

**Voting weight** is the number of voting tokens granted to an individual for the day. Its **balance** is how many it still has to spend. The daily grant replaces the previous balance. A token committed to one ballot cannot also count on a second ballot. Counting residents costs one token per Yes or No. In a token-counted rule vote a resident chooses how many remaining tokens to commit to Yes or No. Abstaining costs zero.

| Rule a plot can change | Available choices                                                         |
| ---------------------- | ------------------------------------------------------------------------- |
| Harvest order          | Ranked resident ballots or random order                                   |
| Harvest quota          | An advisory quantity or unrestricted harvesting                           |
| Rule threshold         | Count eligible residents or tokens cast, and choose the fraction required |
| Token allocation       | Equal daily grant, or a base grant plus a productivity or alignment bonus |

For **productivity**, the input is the previous day’s carrots harvested. For **alignment**, it is the previous day’s votes that agreed with the ballot outcome. For either formula, divide the input by the enacted units per bonus token and round down, then add the base grant. For example, a base of four and one bonus for every three harvested carrots gives a resident who harvested eight a daily voting weight of six. The default grant is six equal tokens per resident.

### The same rule under two thresholds

Take a plot with five eligible residents. Two support a quota, two oppose it and one abstains. Under the default rule threshold, the two Yes voters fall short of a strict majority of the five eligible residents. With a token majority instead, suppose those two supporters commit five tokens between them and the two opponents commit one each. Yes has five of seven tokens cast, so the rule passes. Exactly half fails a strict majority. A threshold of 100% requires unanimity on the selected basis.

Set the initial threshold when configuring a run. The current threshold decides changes to rules, including a proposal to change that threshold. Founding, dissolution, elections and revocations use a fixed resident majority. A large token balance cannot buy additional voices on those ballots. Daily harvest rankings are a separate decision, with one ranked list per resident.

## Departments, donations and crop shocks

Each plot can elect a resident to **Trade** and a resident to **Justice**. An election identifies the department and the candidate. Residents can revoke the appointment by vote. Holding either role gives the holder the powers associated with that department.

| Department | What the holder can do                                                                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trade      | Receive residents’ voluntary donations in its larger personal store. Choose whom to gift carrots to locally or send them to another plot’s Trade representative.                                                |
| Justice    | Review a recorded breach of an advisory harvest quota and issue a warning, a carrot fine or last place in one harvest. Justice can order one sanction per breach. Any fine is removed from the subject’s store. |

A local donation moves carrots from the donor to its Trade representative. A gift between plots moves carrots from one representative to the other. For example, if the donor holds seven and sends four to a representative holding ten with space for four, their balances become three and fourteen. The recipient controls those carrots. Local donations arrive before representatives send gifts. Each representative may select one recipient per day. At revocation the former holder keeps carrots already held. Storage reverts to ordinary capacity and further receipts require space. At exclusion all carrots held by that individual disappear, including donations still in its possession.

### When a plot needs help

Starting on day four of each month, each occupied plot draws one crop event per day. The default probabilities are 4% blight, 4% extra carrots and 92% neither. The Extra carrots event adds up to one day’s food requirement for all active residents, subject to field capacity. Blight destroys up to that same amount of standing crop. The plot needs **one carrot per active resident** from other plots’ Trade representatives by the end of that day’s transfers. The receiving representative immediately plants incoming relief, even when its store is full. Each relief carrot restores one field carrot up to field capacity. At capacity, relief still counts and is consumed. Once the target is met, any excess can enter the representative’s personal store if there is room.

For example, a blighted plot with five active residents needs five incoming carrots. Three carrots from one outside representative and two from another meet the requirement. With room for five in the field, all five become next day’s standing crop. The residents still choose their meals from their own stores. With only four received by the deadline, the remaining field is lost and the plot’s residents are excluded. Donating to one’s own representative does not count towards the rescue.

### What an agent knows

The engine publishes actions and their resolved outcomes for everyone to inspect. It also determines ballot counts, available food, aid delivered and evidence for sanctions. There is no private messaging or shared team memory. Every recorded action comes from the simulation itself. Each individual keeps its own private strategy memory. The observer can inspect and replay a run without casting a vote or deciding an individual’s next action.
