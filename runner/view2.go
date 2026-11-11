//go:build agent

package main

type View struct {
	Round, PatchFood, Energy, AgentCount, LastFood, LastEnergy                  int
	Seed                                                                        int64
	Pantry, DailyFood, Price, LockedPrice, Pending, LastEaten                   int
	TotalFood, TotalEnergy, TotalEaten, FieldCapacity, EnergyCapacity, Sunlight int
}
