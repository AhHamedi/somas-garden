package society

// Office and Federation retain the shape of archived observer frames.
type Office struct {
	Agent   int      `json:"agent"`
	Powers  []string `json:"powers"`
	Members []int    `json:"members,omitempty"`
	Limit   int      `json:"limit"`
	Expires int      `json:"expires,omitempty"`
	Self    bool     `json:"self"`
}

type Federation struct {
	ID        int             `json:"id"`
	Name      string          `json:"name"`
	Plots     []int           `json:"plots"`
	Rules     map[string]Rule `json:"rules"`
	Funded    bool            `json:"funded"`
	Founded   int             `json:"founded"`
	Dissolved bool            `json:"dissolved,omitempty"`
}

// ProposalInput is a single independently enactable subject. The engine assigns
// ballot and action identities; submitted IDs cannot multiply the same action.
type ProposalInput struct {
	Kind     string `json:"kind"`
	Key      string `json:"key,omitempty"`
	Rule     Rule   `json:"rule,omitempty"`
	Target   int    `json:"target"`
	Plot     int    `json:"plot,omitempty"`
	Evidence int    `json:"evidence,omitempty"`
	Amount   int    `json:"amount,omitempty"`
	Sanction string `json:"sanction,omitempty"`
}

type Proposal struct {
	EvidenceReceipt     *Event         `json:"evidenceReceipt,omitempty"`
	ID                  string         `json:"id"`
	Sponsors            []int          `json:"sponsors,omitempty"`
	Author              int            `json:"author"`
	Plot                int            `json:"plot"`
	Federation          int            `json:"federation,omitempty"`
	Input               ProposalInput  `json:"input"`
	Title               string         `json:"title"`
	Status              string         `json:"status"`
	Reason              string         `json:"reason,omitempty"`
	Created             int            `json:"created"`
	Closes              int            `json:"closes"`
	Activate            int            `json:"activate,omitempty"`
	Yes                 int            `json:"yes"`
	No                  int            `json:"no"`
	Abstain             int            `json:"abstain"`
	Total               int            `json:"total"`
	TallyBasis          string         `json:"tallyBasis"`
	Fraction            float64        `json:"fraction"`
	TokenSpends         map[int]int    `json:"tokenSpends,omitempty"`
	Threshold           string         `json:"threshold"`
	Electorate          map[int]int    `json:"electorate,omitempty"`
	Votes               map[int]string `json:"votes,omitempty"`
	PlotVotes           map[int]string `json:"plotVotes,omitempty"`
	RepresentativePlots map[int]int    `json:"representativePlots,omitempty"`
}

// Order is a Justice decision tied to a public quota-breach receipt.
type Order struct {
	Kind     string `json:"kind"`
	Plot     int    `json:"plot,omitempty"`
	Target   int    `json:"target"`
	Evidence int    `json:"evidence"`
	Sanction string `json:"sanction"`
	Amount   int    `json:"amount,omitempty"`
}

type VoteChoice struct {
	Proposal string `json:"proposal"`
	Choice   string `json:"choice"`
	Tokens   int    `json:"tokens,omitempty"`
}

type SanctionCase struct {
	Target   int `json:"target"`
	Amount   int `json:"amount"`
	Evidence int `json:"evidence"`
}

type Pending struct {
	ID    string        `json:"id"`
	At    int           `json:"at"`
	Actor int           `json:"actor"`
	Plot  int           `json:"plot"`
	Input ProposalInput `json:"input"`
}

type PolicyDefinition struct {
	Key         string   `json:"key"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Scope       string   `json:"scope"`
	Modes       []string `json:"modes,omitempty"`
	Parameters  []string `json:"parameters,omitempty"`
	Cost        float64  `json:"cost"`
}

// Catalogue is the same legal menu consumed by the interface and agent guide.
func Catalogue() []PolicyDefinition {
	return []PolicyDefinition{
		{"harvestOrder", "Harvest order", "Use residents’ complete rankings or a seeded shuffle to set the harvest queue.", "local", []string{"ranked", "random"}, nil, 1},
		{"quota", "Advisory harvest quota", "Publish a daily allowance. Taking more creates a public breach for Justice to review.", "local", []string{"limited", "unlimited"}, []string{"amount"}, 1},
		{"threshold", "Rule voting threshold", "Set the share of tokens cast that must support a rule change.", "local", []string{"tokens"}, []string{"amount"}, 1},
		{"tokenAllocation", "Voting token allocation", "Choose a daily base grant and optionally reward harvesting fewer carrots or casting Yes or No ballots yesterday.", "local", []string{"equal", "restraint", "participation"}, []string{"amount", "limit"}, 1},
	}
}

type politicalState struct {
	NextProposal int
	Evidence     map[int]evidenceRecord
	Sanctioned   map[int]bool
	VoteCredits  map[int]int `json:"Aligned"` // v2 checkpoints stored votes matching the outcome here.
}

type evidenceRecord struct {
	Actor, Plot, Amount int
}
