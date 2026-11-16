# Amoeboids presentation

The observer watches a society organise itself. The interface has one job: make it obvious, at any moment, what the Amoeboids are doing, what rules bind them and what they are deciding, without asking the observer to read an event log.

## Visual direction

The world is a painted isometric island over open water. Glass instrument panels float around it. Light follows the day: dawn is warm, the harvest bright, the assemblies golden, supper dusky and night dark blue with lit windows and campfires. The phase of the day is readable from the island alone.

Colour carries meaning and is reused everywhere: carrot orange for food, periwinkle for mind, gold for satisfaction, coral for body, violet for politics, green and red for yes and no. Team colours are kept for the Amoeboids themselves. Display type is Bricolage Grotesque; interface text is Instrument Sans with tabular figures.

## The island

- Plots are sized by field capacity. Standing carrots show each field's stock and thin out during the harvest.
- A hall and granary rise only when a plot founds a government; the granary fills with the treasury. Ungoverned plots have a campfire. Federation members fly violet flags and are joined by violet ribbons.
- Weather is per plot: sunshine, drifting cloud, or dark cloud and rain.
- Every Amoeboid is drawn in its team colour. Officers wear a crown, representatives carry a violet pennant, and higher influence makes an Amoeboid larger. Hungry Amoeboids look pale.
- Each phase is choreographed from that frame's events: Amoeboids hop between plots in Migration, walk into the field and carry carrots home in Harvest, carry scrolls to the hall in Motions, gather in arcs around the hall and show yes and no bubbles in Vote, eat and think at Supper, and sleep at Night. Deaths fade as a rising wisp. The meteor streaks in and flashes at month end.

Plot plaques on the map show the letter, weather, population, field stock, government, federation and the number of motions before the assembly today. They are buttons.

## Time

Play runs until the observer pauses it; selecting, inspecting and switching views never pause. The engine is stepped a few phases ahead of the screen so phase changes do not wait for the server. Quiet phases pass quickly and votes linger, so time is spent where something happens. Speeds are ½×, 1×, 2×, 4× and 8×.

Every completed phase is a saved frame, so replay and live play are the same mechanism. The day console shows the eight phases with a live progress bar, a one-sentence account of the phase with its key figures, and a month timeline that can be scrubbed. Marks on the timeline show new governments and heavy losses. Replaying says how far behind the latest phase it is and offers a way back.

## Inspection

The plot ledger on the left lists every plot and the wilds. Selecting a plot or an Amoeboid opens the inspector on the right. Labels name things; nothing visible is explained in prose.

The inspector shows only what the observer asks for. It opens compact; the widen button, a double-click on its edge or a drag to any width gives it more room, and the choice is remembered. Its layout follows its own width rather than the window's: wider, the vitals sit in one row, the overview splits into columns and the residents table gains harvest, eaten, thought, politics and death columns. Overview sections fold away and stay folded.

- **Overview:** one line on what is happening now; field, treasury, residents with team composition and average satisfaction; average mind, body and influence; the laws in force as compact rows; leadership; today's motions.
- **Residents:** team filter and a sortable table with role badges.
- **Assembly:** a strip with who proposes, the passing line and the cost of proposing and voting; then the statute book and the motions.
  - **Laws** shows every law the plot could have as a card, grouped by subject. Enacted laws are bright with their value and start day; laws never enacted are faded with the default; laws that need a government or a federation are locked. Badges mark motions today, laws starting tomorrow and unfunded services. The federation charter and the one-off decisions follow.
  - Selecting a card unfolds it in place: every option the engine accepts, with the one in force or the default marked (including "None" when the default is no law), parameter ranges, each officer, representative, grant or quota holder, running cost and funding, and this month's motions about it. Escape or the card's header folds it again. The council chamber opens the same card for the law a motion concerns.
  - **Motions** lists today's motions and earlier decisions with tallies against the passing line.
- **Today:** the plot's day, phase by phase.

The Amoeboid card shows body, mind with pledged mind hatched, carrots, influence and satisfaction, its powers, today's votes and actions, and its month totals.

## New world

The setup dialog has six sections: world, teams, food, mind and weather, politics and agents. Every value is a slider with a number box. Charts redraw as values change: plot capacities as the engine will assign them; one meal's satisfaction and body loss for each number of carrots; the average field's daily regrowth by stock against what its residents eat, marking the starting stock; mind a day by weather against mind capacity. Death defaults to returning at the meteor; "Back after days" sets the number of missed days. Teams can be added, removed, renamed and given a behaviour. The footer keeps the population, plots and days in view.

## Council

The council screen is modelled on a parliament chamber. A motion queue on the left groups motions on the floor, decided today and earlier this month. The selected motion is seated as a hemicycle: one seat per voter, filled by their choice and ringed in their team's colour. During a live vote the seats fill in step with the map. Below are the yes and no totals against the passing line in the correct unit (residents, influence or member plots), then the law before and after, support by team, plot votes for federation ballots, and when the decision takes effect.

## Rulebook

The rulebook lists everything the Amoeboids can vote on: the voting procedure, the 20 local laws by subject, the 8 federation charter rules and the 16 one-off decisions. A search field filters by name, description or option. The index shows how many plots have each law in force now.

- **How votes work:** when a motion is tabled, decided and in force, drawn on the day's phases; the majority and two-thirds lines; founding, influence, rival options, costs, federation council votes and the meteor, with this world's numbers.
- **A law:** what it governs in one line, every option on the ballot with the default marked (including "no law" where that is the default) and the parameters each takes, parameter ranges, how it is tabled and passed, running costs, its value in every plot or federation now, motions about it in this run by option, and related laws. A plot links to that law in the plot's assembly.
- **A decision:** who may table it, what it needs, how it is voted, its cost and its effect.

## Chronicle and results

The chronicle tells the month one day at a time, merging identical decisions taken by several plots into one line, and lets the observer replay any day.

Results are a study of the run up to the phase on screen. The engine summarises every nightfall (team and plot figures), every vote straight after it is counted (with votes by team) and each month's totals per Amoeboid; the page reads these through `GET /api/society/runs/:id/study?frame=n`. One row of filters scopes everything: all months or one month, and which teams are shown. Whole-run distributions use completed months only.

- **Outcomes:** satisfaction, inequality (Gini), deaths, governed share of plot-days and the share of motions passed; every Amoeboid-month's satisfaction by team as dots with quartiles, median and mean; satisfaction from food against thought; month-by-month or day-by-day team means; Gini over time and the Lorenz curve.
- **Behaviour:** a sortable table of what an average member of each team did per month (food, politics, office, movement, death); a daily measure chosen from harvest, meals, carrots held, mind, influence, political spending and time in the wilds; where each team lived.
- **Commons:** each field's stock with governed periods shaded; carrots harvested, eaten and needed each day; residents of each plot by day.
- **Institutions:** each plot's government and federation membership by day with the days motions passed; laws by share of governed plot-days in force, motions and passes, and residents' satisfaction in governed plot-months with and without the law; yes share by team and subject; motions by subject and by day; who tables motions.

Every chart has a hover read-out and a table view of the same numbers. Team days, plot days, motions with votes by team, and Amoeboid months export as CSV; the full replay exports as JSON.

## Accessibility

Plots, tabs, controls and the timeline are keyboard reachable: Space plays and pauses, arrows step through phases, Shift and the right arrow skip to nightfall, digits select plots and brackets change speed. Status is never conveyed by colour alone. Reduced motion removes wandering, particles and lighting transitions but keeps the pace of play. The layout adapts to phone widths with the inspector as a bottom sheet.
