// Package society implements the phased Amoeboids world. Observer snapshots and
// private agent observations are deliberately separate contracts.
package society

import (
	"encoding/json"
	"math/rand"
)

type Settings struct {
	Plots                 int       `json:"plots"`
	Copies                int       `json:"copies"`
	Days                  int       `json:"days"`
	Months                int       `json:"months"`
	CapacityPerAgent      int       `json:"capacityPerAgent"`
	StartingStock         float64   `json:"startingStock"`
	Growth                float64   `json:"growth"`
	ProductiveCapacity    float64   `json:"productiveCapacity"`
	DailyFood             int       `json:"dailyFood"`
	BodyCapacity          float64   `json:"bodyCapacity"`
	MindCapacity          float64   `json:"mindCapacity"`
	StartingMind          float64   `json:"startingMind"`
	PersonalCapacity      int       `json:"personalCapacity"`
	HarvestLimit          int       `json:"harvestLimit"`
	ReservePerResident    int       `json:"reservePerResident"`
	WeatherRates          []float64 `json:"weatherRates"`
	WeatherPersistence    float64   `json:"weatherPersistence"`
	OutsideMind           float64   `json:"outsideMind"`
	RespawnDelay          int       `json:"respawnDelay"`
	StartingInfluence     int       `json:"startingInfluence"`
	MaxInfluence          int       `json:"maxInfluence"`
	ProposalCost          float64   `json:"proposalCost"`
	VoteCost              float64   `json:"voteCost"`
	OfficerCost           float64   `json:"officerCost"`
	ReadCost              float64   `json:"readCost"`
	OfferCost             float64   `json:"offerCost"`
	GovernmentCost        float64   `json:"governmentCost"`
	FederationCost        float64   `json:"federationCost"`
	JoiningCost           float64   `json:"joiningCost"`
	EnforcementCost       float64   `json:"enforcementCost"`
	RecordsCost           float64   `json:"recordsCost"`
	FederationRunningCost float64   `json:"federationRunningCost"`
	FoundingWindow        int       `json:"foundingWindow"`
	DisputeWindow         int       `json:"disputeWindow"`
	ImmigrationLookback   int       `json:"immigrationLookback"`
	DecisionMS            int       `json:"decisionMs"`
	MemoryBytes           int       `json:"memoryBytes"`
}
type Rule struct {
	Mode        string   `json:"mode,omitempty"`
	Amount      float64  `json:"amount,omitempty"`
	Exempt      int      `json:"exempt,omitempty"`
	Target      int      `json:"target,omitempty"`
	Members     []int    `json:"members,omitempty"`
	Powers      []string `json:"powers,omitempty"`
	Limit       int      `json:"limit,omitempty"`
	Expires     int      `json:"expires,omitempty"`
	Enabled     bool     `json:"enabled,omitempty"`
	Source      string   `json:"source,omitempty"`
	Destination string   `json:"destination,omitempty"`
	Evidence    int      `json:"evidence,omitempty"`
}
type Team struct {
	StrategyID string   `json:"strategyId,omitempty"`
	Name       string   `json:"name"`
	Policy     string   `json:"policy"`
	Color      string   `json:"color,omitempty"`
	Builder    *Builder `json:"builder,omitempty"`
	Endpoint   string   `json:"endpoint,omitempty"`
	Token      string   `json:"-"`
}
type BehaviorRule struct {
	Phase  string   `json:"phase"`
	Field  string   `json:"field"`
	Op     string   `json:"op"`
	Value  float64  `json:"value"`
	Action Decision `json:"action"`
}
type Builder struct {
	Rules      []BehaviorRule  `json:"rules,omitempty"`
	Fallback   string          `json:"fallback,omitempty"`
	Harvest    int             `json:"harvest"`
	Eat        int             `json:"eat"`
	Think      float64         `json:"think"`
	KeepMind   float64         `json:"keepMind"`
	Pledge     float64         `json:"pledge"`
	Government bool            `json:"government"`
	Vote       string          `json:"vote"`
	Migrate    bool            `json:"migrate"`
	Proposals  []ProposalInput `json:"proposals,omitempty"`
}
type Agent struct {
	ID             int                `json:"id"`
	Team           int                `json:"team"`
	Name           string             `json:"name"`
	Plot           int                `json:"plot"`
	Alive          bool               `json:"alive"`
	Body           float64            `json:"body"`
	Mind           float64            `json:"mind"`
	Food           int                `json:"food"`
	Score          float64            `json:"score"`
	Influence      int                `json:"influence"`
	Harvested      int                `json:"harvested"`
	Eaten          int                `json:"eaten"`
	Deaths         int                `json:"deaths"`
	ActiveDays     int                `json:"activeDays"`
	TotalEaten     int                `json:"totalEaten"`
	TotalHarvested int                `json:"totalHarvested"`
	PoliticalMind  float64            `json:"politicalMind"`
	Thought        float64            `json:"thought"`
	RespawnAt      int                `json:"respawnAt"`
	LastPlaceUntil int                `json:"lastPlaceUntil"`
	NoticeAt       int                `json:"noticeAt"`
	Pledges        map[string]float64 `json:"pledges"`
	Memory         json.RawMessage    `json:"-"`
	LastResult     string             `json:"lastResult"`
	Error          string             `json:"error,omitempty"`
	Permits        map[string]int     `json:"-"`
}
type Plot struct {
	ID              int             `json:"id"`
	Name            string          `json:"name"`
	Capacity        int             `json:"capacity"`
	Stock           int             `json:"stock"`
	Reserve         int             `json:"reserve"`
	ReserveCapacity int             `json:"reserveCapacity"`
	Weather         int             `json:"weather"`
	Regeneration    float64         `json:"regeneration"`
	Government      bool            `json:"government"`
	Rules           map[string]Rule `json:"rules"`
	Officers        map[int]Office  `json:"officers"`
	Federation      int             `json:"federation"`
	HardFunded      bool            `json:"hardFunded"`
	RecordsFunded   bool            `json:"recordsFunded"`
	Residents       []int           `json:"residents"`
	GrowthRemainder float64         `json:"-"`
	Rotation        []int           `json:"-"`
	Records         []Event         `json:"-"`
}
type Event struct {
	ID          int     `json:"id"`
	Month       int     `json:"month"`
	Day         int     `json:"day"`
	AbsoluteDay int     `json:"absoluteDay"`
	Phase       string  `json:"phase"`
	Kind        string  `json:"kind"`
	Actor       int     `json:"actor"`
	Plot        int     `json:"plot"`
	Target      int     `json:"target,omitempty"`
	Message     string  `json:"message"`
	Amount      float64 `json:"amount,omitempty"`
	Food        int     `json:"food,omitempty"`
	Mind        float64 `json:"mind,omitempty"`
	Recorded    bool    `json:"recorded,omitempty"`
	Breach      bool    `json:"breach,omitempty"`
	Rule        Rule    `json:"rule,omitempty"`
}
type Offer struct {
	ID      int `json:"id"`
	From    int `json:"from"`
	To      int `json:"to"`
	Amount  int `json:"amount"`
	Expires int `json:"expires"`
}
type Decision struct {
	OrderedVotes []VoteChoice       `json:"orderedVotes,omitempty"`
	Error        string             `json:"error,omitempty"`
	Move         *int               `json:"move,omitempty"`
	Harvest      int                `json:"harvest,omitempty"`
	Eat          int                `json:"eat,omitempty"`
	Think        float64            `json:"think,omitempty"`
	Pledge       map[string]float64 `json:"pledge,omitempty"`
	Proposals    []ProposalInput    `json:"proposals,omitempty"`
	Votes        map[string]string  `json:"votes,omitempty"`
	Orders       []Order            `json:"orders,omitempty"`
	Read         []RecordQuery      `json:"read,omitempty"`
	Offer        *Offer             `json:"offer,omitempty"`
	Accept       []int              `json:"accept,omitempty"`
	CancelOffer  bool               `json:"cancelOffer,omitempty"`
	Deposit      int                `json:"deposit,omitempty"`
	Memory       json.RawMessage    `json:"memory,omitempty"`
}
type RecordQuery struct {
	Cursor   string `json:"cursor,omitempty"`
	PageSize int    `json:"pageSize,omitempty"`
	Plot     int    `json:"plot"`
	Subject  *int   `json:"subject,omitempty"`
	From     int    `json:"from"`
	To       int    `json:"to"`
}
type RecordPage struct {
	Cursor     string  `json:"cursor"`
	NextCursor string  `json:"nextCursor,omitempty"`
	Rows       []Event `json:"rows"`
	Total      int     `json:"total"`
	Offset     int     `json:"offset"`
	PageSize   int     `json:"pageSize"`
	Error      string  `json:"error,omitempty"`
}
type Observation struct {
	RecordPages   []RecordPage    `json:"recordPages,omitempty"`
	Pending       []Pending       `json:"pending"`
	RandomSeed    int64           `json:"randomSeed"`
	SanctionCases []SanctionCase  `json:"sanctionCases,omitempty"`
	Month         int             `json:"month"`
	Day           int             `json:"day"`
	AbsoluteDay   int             `json:"absoluteDay"`
	Phase         string          `json:"phase"`
	Self          Agent           `json:"self"`
	Memory        json.RawMessage `json:"memory"`
	Settings      Settings        `json:"settings"`
	Plots         []PlotView      `json:"plots"`
	Federations   []*Federation   `json:"federations,omitempty"`
	Proposals     []*Proposal     `json:"proposals"`
	Offers        []Offer         `json:"offers"`
	Records       []Event         `json:"records,omitempty"`
	Receipts      []Event         `json:"receipts,omitempty"`
}
type PlotView struct {
	ID            int             `json:"id"`
	Name          string          `json:"name"`
	Capacity      int             `json:"capacity"`
	Weather       int             `json:"weather"`
	Regeneration  float64         `json:"regeneration"`
	Stock         *int            `json:"stock,omitempty"`
	Reserve       *int            `json:"reserve,omitempty"`
	Government    bool            `json:"government"`
	Federation    int             `json:"federation"`
	Residents     []int           `json:"residents,omitempty"`
	Rules         map[string]Rule `json:"rules,omitempty"`
	Officers      map[int]Office  `json:"officers,omitempty"`
	HardFunded    bool            `json:"hardFunded"`
	RecordsFunded bool            `json:"recordsFunded"`
}
type MonthlyResult struct {
	Month  int          `json:"month"`
	Teams  []TeamResult `json:"teams"`
	Scores []float64    `json:"scores"`
	Deaths int          `json:"deaths"`
}
type TeamResult struct {
	Team   int     `json:"team"`
	Name   string  `json:"name"`
	Score  float64 `json:"score"`
	Mean   float64 `json:"mean"`
	Deaths int     `json:"deaths"`
}
type Stats struct {
	Alive        int     `json:"alive"`
	Population   int     `json:"population"`
	Food         int     `json:"food"`
	Stored       int     `json:"stored"`
	Satisfaction float64 `json:"satisfaction"`
	Governments  int     `json:"governments"`
	Federations  int     `json:"federations"`
	Deaths       int     `json:"deaths"`
}
type Snapshot struct {
	Pending     []Pending       `json:"pending"`
	Version     int             `json:"version"`
	Seed        int64           `json:"seed"`
	Settings    Settings        `json:"settings"`
	Teams       []Team          `json:"teams"`
	Month       int             `json:"month"`
	Day         int             `json:"day"`
	AbsoluteDay int             `json:"absoluteDay"`
	Phase       string          `json:"phase"`
	Done        bool            `json:"done"`
	Meteor      bool            `json:"meteor"`
	Agents      []*Agent        `json:"agents"`
	Plots       []*Plot         `json:"plots"`
	Federations []*Federation   `json:"federations"`
	Proposals   []*Proposal     `json:"proposals"`
	Events      []Event         `json:"events"`
	Months      []MonthlyResult `json:"months"`
	Stats       Stats           `json:"stats"`
}
type Decider func(Observation) Decision

type World struct {
	recordCursors map[string]*recordCursor
	recordPages   map[int][]RecordPage
	nextQuery     int

	Settings                Settings
	Teams                   []Team
	Seed                    int64
	Agents                  []*Agent
	Plots                   []*Plot
	Federations             []*Federation
	Proposals               []*Proposal
	Pending                 []Pending
	Events                  []Event
	Offers                  []Offer
	Month, Day, AbsoluteDay int
	Phase                   string
	Done, Meteor            bool
	Months                  []MonthlyResult
	political               *politicalState
	Deciders                map[int]Decider
	rng                     *rand.Rand
	weather                 []*rand.Rand
	phaseIndex              int
	advance                 bool
	eventStart              int
	nextEvent               int
	nextOffer               int
	reads                   map[int][]Event
	receipts                map[int][]Event
}
