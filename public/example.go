//go:build agent

package main

// SOMAS supplies View and Action.
func Decide(v View) Action {
    return Action{Food: 2, Energy: 4}
}
