package society

import (
	"fmt"
	"math"
	"sort"
)

// Placement is requested once per month, after the meteor has cleared residency.
func (w *World) place(decisions map[int]Decision) {
	if w.Day != 1 {
		return
	}
	for _, a := range w.Agents {
		if !a.Alive || a.Plot >= 0 {
			continue
		}
		choice := decisions[a.ID].PlotChoice
		if choice != nil && *choice >= 0 && *choice < len(w.Plots) {
			a.Plot = *choice
		} else {
			if choice != nil {
				w.reject(a, "Unknown plot choice, using the default placement")
			}
			// Distribute abstaining agents over the available fields.
			a.Plot = a.ID % len(w.Plots)
		}
		w.event("placement", a.ID, a.Plot, fmt.Sprintf("Settled on %s for the month", w.Plots[a.Plot].Name), 0)
	}
	w.updateResidents()
}

func (w *World) rankHarvest(decisions map[int]Decision) {
	for _, p := range w.Plots {
		rs := w.residents(p.ID)
		order := make([]int, len(rs))
		for i, resident := range rs {
			order[i] = resident.ID
		}
		// Shuffle before sorting so tied totals, including universal abstention,
		// have a seeded tie-break independent of agent ID.
		w.rng.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })
		if len(order) == 0 {
			p.HarvestOrder = order
			continue
		}
		if p.Rules["harvestOrder"].Mode != "random" {
			points := make(map[int]int, len(rs))
			for _, voter := range rs {
				rank := decisions[voter.ID].HarvestRanking
				if len(rank) == 0 {
					continue
				}
				if !w.validHarvestRanking(rank, p.ID, len(rs)) {
					w.reject(voter, "A harvest ranking must list every active resident of this plot exactly once")
					continue
				}
				for pos, id := range rank {
					points[id] += len(rank) - pos - 1
				}
				w.event("harvest_ranking", voter.ID, p.ID, "Submitted a harvest ranking", 0, rank...)
			}
			sort.SliceStable(order, func(i, j int) bool { return points[order[i]] > points[order[j]] })
		}
		sort.SliceStable(order, func(i, j int) bool {
			return w.Agents[order[i]].LastPlaceUntil < w.AbsoluteDay && w.Agents[order[j]].LastPlaceUntil >= w.AbsoluteDay
		})
		p.HarvestOrder = order
		w.event("harvest_order", -1, p.ID, "Published today's harvest order", 0, order...)
	}
}

func (w *World) validHarvestRanking(rank []int, plot, population int) bool {
	if len(rank) != population {
		return false
	}
	seen := make(map[int]bool, population)
	for _, id := range rank {
		if id < 0 || id >= len(w.Agents) || seen[id] || !w.Agents[id].Alive || w.Agents[id].Plot != plot {
			return false
		}
		seen[id] = true
	}
	return true
}

func (w *World) storageCapacity(a *Agent) int {
	if w.holdsRole(a.ID, "trade") {
		return w.Settings.RepresentativeCapacity
	}
	return w.Settings.PersonalCapacity
}

func (w *World) harvest(decisions map[int]Decision) {
	for _, p := range w.Plots {
		for _, id := range p.HarvestOrder {
			a := w.Agents[id]
			if !a.Alive || a.Plot != p.ID {
				continue
			}
			request := decisions[id].Harvest
			if request < 0 {
				w.reject(a, "Harvest cannot be negative")
				continue
			}
			if request == 0 {
				continue
			}
			n := min(request, p.Stock, max(0, w.storageCapacity(a)-a.Food))
			p.Stock -= n
			a.Food += n
			a.Harvested += n
			a.TotalHarvested += n
			w.event("harvest", id, p.ID, fmt.Sprintf("Harvested %d of %d requested carrots", n, request), float64(n))
			if quota := w.HarvestQuota(a); n > 0 && quota >= 0 && a.Harvested > quota {
				excess := a.Harvested - quota
				w.event("ration_breach", id, p.ID, fmt.Sprintf("Harvest exceeded the agreed quota by %d", excess), float64(excess))
			}
		}
		if p.Stock == 0 {
			p.GrowthRemainder = 0
		}
	}
}

// Draw once per occupied plot after ordinary growth. The opening three days
// let residents found their government and seat a Trade representative.
func (w *World) cropEvent(p *Plot) {
	if p.CropEvent == "failed" {
		return
	}
	p.CropEvent = ""
	p.AidNeeded = 0
	rs := w.residents(p.ID)
	if w.Day < 4 || len(rs) == 0 {
		return
	}
	roll := w.weather[p.ID].Float64()
	meal := len(rs) * w.Settings.DailyFood
	switch {
	case roll < w.Settings.BlightChance:
		damage := min(meal, p.Stock)
		p.Stock -= damage
		if p.Stock == 0 {
			p.GrowthRemainder = 0
		}
		p.CropEvent = "blight"
		p.AidNeeded = len(rs)
		w.event("blight", -1, p.ID, fmt.Sprintf("Blight destroyed %d carrots. Trade needs %d carrots from other plots today", damage, p.AidNeeded), float64(damage))
	case roll < w.Settings.BlightChance+w.Settings.BumperChance:
		gain := min(meal, p.Capacity-p.Stock)
		p.Stock += gain
		if p.Stock == p.Capacity {
			p.GrowthRemainder = 0
		}
		p.CropEvent = "bumper"
		w.event("bumper", -1, p.ID, fmt.Sprintf("A bumper crop added %d carrots", gain), float64(gain))
	}
}

func (w *World) transfers() {
	ds := w.decisions("transfers")
	w.justicePhase(ds)
	ordered := rangeOrdered(ds)
	// All local donations arrive before representatives dispatch their gifts.
	for _, item := range ordered {
		if item.d.Donate == 0 {
			continue
		}
		a := w.Agents[item.id]
		rep := w.roleHolder(a.Plot, "trade")
		if item.d.Donate < 0 || rep == nil || a.ID == rep.ID {
			w.reject(a, "A donation needs a positive amount and a different local Trade representative")
			continue
		}
		w.transferFood(a, rep, item.d.Donate, "donation")
	}
	// Dispatch is limited to food held after local donations. Incoming gifts
	// cannot be forwarded the same day as a side effect of agent ID ordering.
	budgets := make(map[int]int)
	for _, item := range ordered {
		if item.d.Gift != nil {
			budgets[item.id] = w.Agents[item.id].Food
		}
	}
	for _, item := range ordered {
		gift := item.d.Gift
		if gift == nil {
			continue
		}
		a := w.Agents[item.id]
		if !w.holdsRole(a.ID, "trade") || gift.Amount <= 0 || gift.To < 0 || gift.To >= len(w.Agents) || gift.To == a.ID {
			w.reject(a, "Only Trade can send a positive gift to another active resident")
			continue
		}
		to := w.Agents[gift.To]
		if !to.Alive || to.Plot < 0 || (to.Plot != a.Plot && !w.holdsRole(to.ID, "trade")) {
			w.reject(a, "An interplot gift must go to the recipient plot's Trade representative")
			continue
		}
		w.transferFood(a, to, min(gift.Amount, budgets[a.ID]), "gift")
	}
	w.resolveBlights()
}

func (w *World) transferFood(from, to *Agent, requested int, kind string) {
	p := w.Plots[to.Plot]
	availableFood := min(requested, from.Food)
	aid := 0
	if from.Plot != to.Plot && p.CropEvent == "blight" {
		// The representative plants relief on receipt. A full personal store
		// cannot block rescue, even on a plot with many more residents than slots.
		aid = min(availableFood, p.AidNeeded)
	}
	carried := min(availableFood-aid, max(0, w.storageCapacity(to)-to.Food))
	n := aid + carried
	if n == 0 {
		w.reject(from, "No carrots could be transferred within the sender's balance and recipient's capacity")
		return
	}
	from.Food -= n
	to.Food += carried
	w.event(kind, from.ID, from.Plot, fmt.Sprintf("Gave %d carrots to %s on %s", n, to.Name, w.Plots[to.Plot].Name), float64(n), to.ID)
	w.event("received", to.ID, to.Plot, fmt.Sprintf("Received %d carrots from %s on %s", n, from.Name, w.Plots[from.Plot].Name), float64(n), from.ID)
	if aid > 0 {
		planted := min(aid, p.Capacity-p.Stock)
		p.Stock += planted
		p.AidNeeded -= aid
		if p.Stock == p.Capacity {
			p.GrowthRemainder = 0
		}
		if planted > 0 {
			w.event("relief_planted", to.ID, p.ID, fmt.Sprintf("Trade planted %d relief carrots in the field", planted), float64(planted))
		}
		if used := aid - planted; used > 0 {
			w.event("relief_used", to.ID, p.ID, fmt.Sprintf("Trade used %d relief carrots to treat the full field", used), float64(used))
		}
	}
}

func (w *World) resolveBlights() {
	for _, p := range w.Plots {
		if p.CropEvent != "blight" {
			continue
		}
		if p.AidNeeded == 0 {
			p.CropEvent = "rescued"
			w.event("blight_rescued", -1, p.ID, "Donations from other plots met the relief requirement", 0)
			continue
		}
		lost := p.Stock
		p.CropEvent = "failed"
		p.Stock = 0
		p.GrowthRemainder = 0
		w.event("plot_failed", -1, p.ID, fmt.Sprintf("Relief fell short by %d carrots. The plot lost its remaining %d field carrots", p.AidNeeded, lost), float64(lost))
		for _, a := range w.residents(p.ID) {
			w.exclude(a, "The plot failed after blight")
		}
	}
	w.dissolveEmpty()
}

func (w *World) eating(ds map[int]Decision) {
	for _, a := range w.Agents {
		if !a.Alive {
			continue
		}
		d := ds[a.ID]
		n := min(max(0, d.Eat), a.Food)
		a.Food -= n
		a.Eaten = n
		a.TotalEaten += n
		a.Body = math.Min(w.Settings.BodyCapacity, a.Body+float64(n-w.Settings.DailyFood))
		extra := max(0, n-w.Settings.DailyFood)
		score := math.Log2(1 + float64(extra))
		a.Score += score
		w.event("eat", a.ID, a.Plot, fmt.Sprintf("Ate %d carrots for %.2f satisfaction", n, score), float64(n))
		if a.Body <= 0 {
			w.exclude(a, "Body reserve reached zero")
			continue
		}
		thought := math.Min(available(a), math.Max(0, d.Think))
		if !math.IsNaN(thought) && !math.IsInf(thought, 0) && thought > 0 {
			a.Mind = roundMind(a.Mind - thought)
			a.Thought += thought
			a.Score += thought
			w.event("think", a.ID, a.Plot, fmt.Sprintf("Thought with %.2f mind", thought), thought)
		}
	}
	w.dissolveEmpty()
}

func (w *World) exclude(a *Agent, reason string) {
	if !a.Alive {
		return
	}
	plot, food := a.Plot, a.Food
	w.leaving(a, plot)
	a.Alive = false
	a.Body, a.Mind, a.Food = 0, 0, 0
	a.Plot = -1
	a.Exclusions++
	w.event("excluded", a.ID, plot, reason+". Excluded until the monthly reset", 0)
	if food > 0 {
		w.event("deleted", a.ID, plot, fmt.Sprintf("Exclusion removed %d carried carrots", food), float64(food))
	}
}
