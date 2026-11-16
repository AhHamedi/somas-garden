package society

// Office is a voted delegation. An empty power list grants no authority.
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
	Kind          string `json:"kind"`
	Key           string `json:"key,omitempty"`
	Rule          Rule   `json:"rule,omitempty"`
	Target        int    `json:"target,omitempty"`
	Plot          int    `json:"plot,omitempty"`
	Federation    int    `json:"federation,omitempty"`
	Members       []int  `json:"members,omitempty"`
	Evidence      int    `json:"evidence,omitempty"`
	Amount        int    `json:"amount,omitempty"`
	Source        string `json:"source,omitempty"`
	Destination   string `json:"destination,omitempty"`
	Sanction      string `json:"sanction,omitempty"`
	Authorization string `json:"authorization,omitempty"`
}

type Proposal struct {
	EvidenceReceipt     *Event         `json:"evidenceReceipt,omitempty"`
	ID                  string         `json:"id"`
	Author              int            `json:"author"`
	Plot                int            `json:"plot"`
	Federation          int            `json:"federation"`
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
	Threshold           string         `json:"threshold"`
	Electorate          map[int]int    `json:"electorate,omitempty"`
	Votes               map[int]string `json:"votes,omitempty"`
	PlotVotes           map[int]string `json:"plotVotes,omitempty"`
	RepresentativePlots map[int]int    `json:"representativePlots,omitempty"`
}

type Order struct {
	Kind          string `json:"kind"`
	Target        int    `json:"target,omitempty"`
	Plot          int    `json:"plot,omitempty"`
	Amount        int    `json:"amount,omitempty"`
	Members       []int  `json:"members,omitempty"`
	Evidence      int    `json:"evidence,omitempty"`
	Source        string `json:"source,omitempty"`
	Destination   string `json:"destination,omitempty"`
	Sanction      string `json:"sanction,omitempty"`
	Authorization string `json:"authorization,omitempty"`
	Federation    int    `json:"federation,omitempty"`
	Key           string `json:"key,omitempty"`
	Rule          Rule   `json:"rule,omitempty"`
}

type VoteChoice struct {
	Proposal string `json:"proposal"`
	Choice   string `json:"choice"`
}

type SanctionCase struct {
	ID       string `json:"id"`
	Target   int    `json:"target"`
	Sanction string `json:"sanction"`
	Amount   int    `json:"amount"`
	Evidence int    `json:"evidence"`
	Until    int    `json:"until"`
}

type Pending struct {
	ID         string        `json:"id"`
	At         int           `json:"at"`
	Actor      int           `json:"actor"`
	Plot       int           `json:"plot"`
	Federation int           `json:"federation"`
	Input      ProposalInput `json:"input"`
	Officer    bool          `json:"officer,omitempty"`
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
		{"harvestOrder", "Harvest order", "Choose the order in which residents harvest.", "local", []string{"random", "rotating", "lowestBody", "highestInfluence"}, nil, 1},
		{"entry", "Entry", "Open, close or approve entry; optionally cap membership.", "local", []string{"open", "closed", "vote", "officer"}, []string{"limit"}, 1},
		{"exit", "Exit", "Free exit, a one-day notice, a ballot or an officer permit.", "local", []string{"free", "notice", "vote", "officer"}, []string{"amount"}, 1},
		{"quota", "Harvest quota", "Unlimited or a daily quota; quota:<agent> sets an individual allowance.", "local", []string{"unlimited", "limited"}, []string{"amount", "target"}, 1},
		{"enforcement", "Enforcement", "Paid hard limits block excess harvest; unfunded limits become soft.", "local", []string{"soft", "hard"}, nil, 1},
		{"influence", "Political influence", "Set one resident's voting influence between zero and the configured maximum.", "local", nil, []string{"target", "amount"}, 1},
		{"influenceBasis", "Influence basis", "Keep influence voted member by member, or recalculate it each morning from recent net contributions.", "local", []string{"voted", "contribution", "contributionOnly"}, []string{"amount", "limit"}, 1},
		{"threshold", "Passing threshold", "Choose a strict majority or at least two thirds of all influence.", "local", []string{"majority", "twoThirds"}, nil, 1},
		{"proposers", "Proposal rights", "Choose who may submit local proposals.", "local", []string{"all", "positive", "officers"}, []string{"members"}, 1},
		{"office", "Officer appointment", "Delegate explicit powers, recipient scope, quantity limits and expiry.", "local", []string{"appoint", "remove"}, []string{"target", "powers", "members", "limit", "expires", "enabled"}, 1},
		{"records", "Records", "Pay to record resource and institutional actions.", "local", []string{"on", "off"}, nil, 1},
		{"recordAccess", "Record access", "Choose who may pay to read recorded history.", "local", []string{"all", "officers", "named"}, []string{"members"}, 1},
		{"sanctions", "Sanctions", "Enable evidence-backed sanctions and choose where fines go.", "local", []string{"field", "reserve"}, []string{"powers"}, 1},
		{"collection", "Field collection", "Collect a fixed amount or percentage before or after personal harvests.", "local", []string{"fixedBefore", "fixedAfter", "percentBefore", "percentAfter"}, []string{"amount"}, 1},
		{"tax", "Storage tax", "Collect a fixed amount or percentage above an exempt balance.", "local", []string{"fixed", "percent"}, []string{"amount", "exempt"}, 1},
		{"holding", "Holding limit", "Publish an advisory limit or collect excess into the treasury.", "local", []string{"advisory", "collect"}, []string{"amount"}, 1},
		{"distribution", "Reserve distribution", "Enable a standing named or equal food distribution.", "local", []string{"equal", "named", "perMember"}, []string{"amount", "target", "members", "enabled"}, 1},
		{"inheritance", "Inheritance", "Delete estates or direct them to survivors, a beneficiary or government storage.", "local", []string{"delete", "equal", "named", "government"}, []string{"target"}, 1},
		{"representative", "Federation representative", "Grant explicit federation proposal and voting powers.", "local", []string{"appoint", "remove"}, []string{"target", "powers", "expires"}, 1},
		{"membershipMandate", "Federation membership mandate", "Keep membership decisions with residents or delegate them.", "local", []string{"residents", "officers"}, []string{"members"}, 1},
		{"charterMandate", "Federation charter mandate", "Require local ratification or let named representatives decide.", "local", []string{"residents", "officers"}, []string{"members"}, 1},
		{"donations", "Donations", "Permit authorised transfers between member fields and reserves.", "federation", []string{"on", "off"}, []string{"limit"}, 1},
		{"gifts", "Cross-plot gifts", "Permit voluntary food offers between member plots.", "federation", []string{"on", "off"}, nil, 1},
		{"data", "Resource data", "Share current member field and treasury stocks.", "federation", []string{"on", "off"}, nil, 1},
		{"sharedRecords", "Shared records", "Share recorded histories across member plots.", "federation", []string{"on", "off"}, nil, 1},
		{"recordAccess", "Shared record access", "Choose who can read shared records.", "federation", []string{"all", "officers", "named"}, []string{"members"}, 1},
		{"immigration", "Immigration", "Choose local entry rules, open passage or funded sanction checks.", "federation", []string{"restricted", "open", "checked"}, nil, 1},
		{"disputes", "Disputes", "Enable bounded remedies decided one plot one vote over five days.", "federation", []string{"on", "off"}, []string{"powers", "limit"}, 1},
		{"delegation", "Donation delegation", "Permit authorised donor officers to make transfers without another ballot.", "federation", []string{"on", "off"}, nil, 1},
	}
}

type politicalState struct {
	FieldOpening   map[int]int
	NextProposal   int
	NextFederation int
	Permits        map[string]int
	Notices        map[int]int
	LastPlace      map[int]int
	OrdersUsed     map[string]int
	DonationsUsed  map[int]int
	Sanctioned     map[int]bool
	Authorizations map[string]*sanctionAuthorization
	Formations     map[string]*formationAttempt
	Joins          map[string]bool
	Ratifications  map[string]bool
	ExitFederation map[int]int
	Evidence       map[int]evidenceRecord
	SharedEvidence map[int]bool
	Records        map[int][]Record
	// Ledger holds each plot's contribution entries for recent days.
	Ledger map[int][]ContributionDay
}

type Record struct {
	ID      int     `json:"id"`
	Day     int     `json:"day"`
	Month   int     `json:"month"`
	Phase   string  `json:"phase"`
	Kind    string  `json:"kind"`
	Agent   int     `json:"agent"`
	Plot    int     `json:"plot"`
	Amount  float64 `json:"amount"`
	Food    int     `json:"food"`
	Mind    float64 `json:"mind"`
	Message string  `json:"message"`
}

type evidenceRecord struct {
	Actor, Plot, Day, Amount, Quota int
	Recorded                        bool
	AllowedSanctions                []string
}
type sanctionAuthorization struct {
	ID                         string
	Input                      ProposalInput
	Plot, Author, Start, Until int
	Applied                    bool
}
type formationAttempt struct {
	Members   []int
	Approvals map[int]bool
	First     int
	Scheduled bool
}
