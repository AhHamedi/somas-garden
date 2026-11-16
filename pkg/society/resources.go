package society

import (
	"fmt"
	"math"
	"sort"
)

func (w *World) movement(ds map[int]Decision) {
	for _, id := range w.rng.Perm(len(w.Agents)) {
		a := w.Agents[id]
		d := ds[id]
		if !a.Alive || d.Move == nil {
			continue
		}
		dest := *d.Move
		if dest == a.Plot {
			continue
		}
		if dest < -1 || dest >= len(w.Plots) {
			w.reject(a, "Unknown destination")
			continue
		}
		eventsBefore := len(w.Events)
		if !w.permitMove(a, dest) {
			if len(w.Events) == eventsBefore {
				w.reject(a, "Movement blocked by the active entry, exit or membership-cap rule")
			}
			continue
		}
		old := a.Plot
		w.leaving(a, old)
		a.Plot = dest
		a.NoticeAt = 0
		a.Influence = 0
		if dest >= 0 {
			// Newcomers start at the floor where influence follows
			// contributions, since they have given nothing here yet.
			a.Influence = w.Settings.StartingInfluence
			if _, floor, ok := w.contributionBasis(w.Plots[dest]); ok {
				a.Influence = floor
			}
		}
		w.event("move", id, dest, fmt.Sprintf("Moved from %s to %s", plotName(old), plotName(dest)), 0)
	}
	w.dissolveEmpty()
	// A plot can lose its last positive vote after the morning calculation.
	// Restore its voice before proposals, without recalculating anybody's points.
	for _, p := range w.Plots {
		if _, floor, contributed := w.contributionBasis(p); !contributed || floor != 0 {
			continue
		}
		hasInfluence := false
		for _, a := range w.residents(p.ID) {
			if a.Influence > 0 {
				hasInfluence = true
				break
			}
		}
		if !hasInfluence {
			w.restorePoliticalContinuity(p)
		}
	}
}
func plotName(id int) string {
	if id < 0 {
		return "outside"
	}
	return fmt.Sprintf("Plot %c", 'A'+id)
}
func (w *World) harvest(ds map[int]Decision) {
	w.collectGovernment("before")
	order := w.rng.Perm(len(w.Agents))
	for _, p := range w.Plots {
		positions := []int{}
		local := []int{}
		for i, id := range order {
			if w.Agents[id].Alive && w.Agents[id].Plot == p.ID {
				positions = append(positions, i)
				local = append(local, id)
			}
		}
		mode := p.Rules["harvestOrder"].Mode
		if mode == "rotating" {
			current := map[int]bool{}
			for _, id := range local {
				current[id] = true
			}
			q := []int{}
			for _, id := range p.Rotation {
				if current[id] {
					q = append(q, id)
					delete(current, id)
				}
			}
			for _, a := range w.residents(p.ID) {
				if current[a.ID] {
					q = append(q, a.ID)
				}
			}
			p.Rotation = q
			rank := map[int]int{}
			for i, id := range q {
				rank[id] = i
			}
			sort.SliceStable(local, func(i, j int) bool { return rank[local[i]] < rank[local[j]] })
			if len(q) > 0 {
				p.Rotation = append(append([]int{}, q[1:]...), q[0])
			}
		} else if mode == "lowestBody" || mode == "lowest-body" {
			sort.SliceStable(local, func(i, j int) bool { return w.Agents[local[i]].Body < w.Agents[local[j]].Body })
		} else if mode == "highestInfluence" || mode == "highest-influence" {
			sort.SliceStable(local, func(i, j int) bool { return w.Agents[local[i]].Influence > w.Agents[local[j]].Influence })
		}
		sort.SliceStable(local, func(i, j int) bool {
			return (w.Agents[local[i]].LastPlaceUntil >= w.AbsoluteDay) != (w.Agents[local[j]].LastPlaceUntil >= w.AbsoluteDay) && w.Agents[local[i]].LastPlaceUntil < w.AbsoluteDay
		})
		for i, pos := range positions {
			order[pos] = local[i]
		}
	}
	for _, id := range order {
		a := w.Agents[id]
		if !a.Alive || a.Plot < 0 {
			continue
		}
		p := w.Plots[a.Plot]
		request := ds[id].Harvest
		if request < 0 {
			w.reject(a, "Harvest cannot be negative")
			continue
		}
		n := min(request, w.Settings.HarvestLimit, p.Stock, w.Settings.PersonalCapacity-a.Food)
		quota, has := p.Rules["quota"]
		if q, ok := p.Rules[fmt.Sprintf("quota:%d", id)]; ok {
			quota, has = q, true
		}
		limited := has && quota.Mode != "unlimited"
		if p.HardFunded && limited {
			n = min(n, max(0, int(quota.Amount)-a.Harvested))
		}
		if n < 0 {
			n = 0
		}
		p.Stock -= n
		a.Food += n
		a.Harvested += n
		a.TotalHarvested += n
		if request > 0 {
			w.event("harvest", id, a.Plot, fmt.Sprintf("Harvested %d of %d requested carrots", n, request), float64(n))
		}
		if limited && !p.HardFunded && a.Harvested > int(quota.Amount) && n > 0 {
			e := w.event("ration_breach", id, a.Plot, fmt.Sprintf("Harvest exceeded the soft ration by %d", a.Harvested-int(quota.Amount)), float64(a.Harvested-int(quota.Amount)))
			e.Breach = true
			e.Rule = quota
			w.Events[len(w.Events)-1] = e
			w.receipts[id][len(w.receipts[id])-1] = e
			if e.Recorded {
				p.Records[len(p.Records)-1] = e
			}
		}
		if p.Stock == 0 {
			p.GrowthRemainder = 0
		}
	}
	w.collectGovernment("after")
	w.collectGovernment("tax")
}
func (w *World) reserved(id int) int {
	n := 0
	for _, o := range w.Offers {
		if o.From == id {
			n += o.Amount
		}
	}
	return n
}
func (w *World) cancelOffer(id int) {
	out := w.Offers[:0]
	for _, o := range w.Offers {
		if o.From != id {
			out = append(out, o)
		}
	}
	w.Offers = out
}
func (w *World) canGift(from, to *Agent) bool {
	if !from.Alive || !to.Alive || from.Plot < 0 || to.Plot < 0 {
		return false
	}
	if from.Plot == to.Plot {
		return true
	}
	fp, tp := w.Plots[from.Plot], w.Plots[to.Plot]
	if fp.Federation < 0 || fp.Federation != tp.Federation {
		return false
	}
	for _, f := range w.Federations {
		if f.ID == fp.Federation && f.Funded {
			return f.Rules["gifts"].Enabled || f.Rules["gifts"].Mode == "on"
		}
	}
	return false
}
func (w *World) transfers() {
	offers := w.Offers[:0]
	for _, o := range w.Offers {
		if o.Expires > w.AbsoluteDay {
			offers = append(offers, o)
		}
	}
	w.Offers = offers
	ds := w.decisions("transfers")
	w.officerPhase(ds)
	for _, it := range rangeOrdered(ds) {
		a := w.Agents[it.id]
		d := it.d
		if d.CancelOffer {
			w.cancelOffer(a.ID)
		}
		if d.Deposit > 0 && a.Plot >= 0 {
			p := w.Plots[a.Plot]
			if p.Government {
				n := min(d.Deposit, a.Food-w.reserved(a.ID), p.ReserveCapacity-p.Reserve)
				a.Food -= n
				p.Reserve += n
				if n > 0 {
					w.event("deposit", a.ID, a.Plot, fmt.Sprintf("Deposited %d carrots into public storage", n), float64(n))
					w.contribute(a.Plot, a.ID, func(c *ContributionDay) { c.Deposits += n })
				}
			}
		}
		if d.Offer != nil {
			q := d.Offer
			if q.To < 0 || q.To >= len(w.Agents) || q.To == a.ID || q.Amount <= 0 || q.Amount > a.Food || w.reserved(a.ID) > 0 || !w.canGift(a, w.Agents[q.To]) {
				w.reject(a, "Food offer is invalid")
				continue
			}
			if !spend(a, w.Settings.OfferCost) {
				w.reject(a, "Not enough unpledged mind to offer food")
				continue
			}
			w.nextOffer++
			w.Offers = append(w.Offers, Offer{ID: w.nextOffer, From: a.ID, To: q.To, Amount: q.Amount, Expires: w.AbsoluteDay + 1})
			w.event("offer", a.ID, a.Plot, fmt.Sprintf("Offered %d carrots to %s", q.Amount, w.Agents[q.To].Name), float64(q.Amount))
		}
	}
	accepts := w.decisions("accept")
	for _, it := range rangeOrdered(accepts) {
		a := w.Agents[it.id]
		for _, id := range it.d.Accept {
			for i, o := range w.Offers {
				if o.ID != id {
					continue
				}
				if o.To != a.ID || !w.canGift(w.Agents[o.From], a) || a.Food+o.Amount > w.Settings.PersonalCapacity {
					w.reject(a, "Offer cannot be accepted")
					break
				}
				sender := w.Agents[o.From]
				sender.Food -= o.Amount
				a.Food += o.Amount
				w.Offers = append(w.Offers[:i], w.Offers[i+1:]...)
				w.event("gift", sender.ID, sender.Plot, fmt.Sprintf("Gave %d carrots to %s", o.Amount, a.Name), float64(o.Amount))
				w.event("received", a.ID, a.Plot, fmt.Sprintf("Received %d carrots from %s", o.Amount, sender.Name), float64(o.Amount))
				break
			}
		}
	}
}
func (w *World) eating(ds map[int]Decision) {
	dead := []*Agent{}
	for _, a := range w.Agents {
		if !a.Alive {
			continue
		}
		d := ds[a.ID]
		n := min(max(0, d.Eat), a.Food-w.reserved(a.ID))
		a.Food -= n
		a.Eaten = n
		a.TotalEaten += n
		a.Body = math.Min(w.Settings.BodyCapacity, a.Body+float64(n-w.Settings.DailyFood))
		extra := max(0, n-w.Settings.DailyFood)
		score := math.Log2(1 + float64(extra))
		a.Score += score
		w.event("eat", a.ID, a.Plot, fmt.Sprintf("Ate %d carrots; %.2f satisfaction", n, score), float64(n))
		if a.Body <= 0 {
			a.Body = 0
			a.Alive = false
			dead = append(dead, a)
			continue
		}
		thought := math.Min(available(a), math.Max(0, d.Think))
		if !math.IsNaN(thought) && !math.IsInf(thought, 0) {
			a.Mind = roundMind(a.Mind - thought)
			a.Thought += thought
			a.Score += thought
			if thought > 0 {
				w.event("think", a.ID, a.Plot, fmt.Sprintf("Thought with %.2f mind", thought), thought)
			}
		}
	}
	for _, a := range dead {
		w.death(a)
	}
	w.dissolveEmpty()
}
func (w *World) death(a *Agent) {
	plot := a.Plot
	food := a.Food
	w.cancelOffer(a.ID)
	a.Deaths++
	a.RespawnAt = 0
	if w.Settings.RespawnDelay >= 0 {
		a.RespawnAt = w.AbsoluteDay + w.Settings.RespawnDelay + 1
	}
	w.leaving(a, plot)
	a.Mind = 0
	a.Food = 0
	a.Influence = 0
	a.Pledges = map[string]float64{}
	a.Plot = -1
	a.Permits = map[string]int{}
	w.event("death", a.ID, plot, fmt.Sprintf("Died with %d stored carrots", food), float64(food))
	if plot < 0 || food == 0 {
		return
	}
	p := w.Plots[plot]
	r := p.Rules["inheritance"]
	received := 0
	switch r.Mode {
	case "government", "reserve":
		if p.Government {
			received = min(food, p.ReserveCapacity-p.Reserve)
			p.Reserve += received
		}
	case "beneficiary", "named":
		if r.Target >= 0 && r.Target < len(w.Agents) {
			b := w.Agents[r.Target]
			if b.Alive && b.Plot == plot {
				received = min(food, w.Settings.PersonalCapacity-b.Food)
				b.Food += received
			}
		}
	case "equal":
		rs := w.residents(plot)
		ids := w.rng.Perm(len(rs))
		left := food
		for left > 0 {
			changed := false
			for _, i := range ids {
				b := rs[i]
				if b.Food < w.Settings.PersonalCapacity {
					b.Food++
					left--
					changed = true
					if left == 0 {
						break
					}
				}
			}
			if !changed {
				break
			}
		}
		received = food - left
	}
	if received > 0 {
		w.event("inheritance", a.ID, plot, fmt.Sprintf("%d carrots passed under the inheritance rule", received), float64(received))
	}
	if food-received > 0 {
		w.event("deleted", a.ID, plot, fmt.Sprintf("%d estate carrots deleted", food-received), float64(food-received))
	}
}
