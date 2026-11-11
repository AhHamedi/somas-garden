//go:build agent

package main

type View struct {
	Round, PatchFood, Energy, AgentCount, LastFood, LastEnergy int
	Seed                                                       int64
}
