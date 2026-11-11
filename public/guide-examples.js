export const guideExamples = [
  {
    id: "simple",
    label: "Simple",
    description: "Request 2 carrots and offer 4 energy each day.",
    code: `package main

// SOMAS supplies View and Action.
func Decide(v View) Action {
    return Action{Food: 2, Energy: 4}
}
`,
  },
  {
    id: "adaptive",
    label: "Adaptive",
    description:
      "Request 1 carrot when stock falls below 2 per agent; offer all available energy.",
    code: `package main

func Decide(v View) Action {
    food := 2
    if v.PatchFood < v.AgentCount*2 {
        food = 1
    }
    return Action{Food: food, Energy: v.Energy}
}
`,
  },
  {
    id: "memory",
    label: "With memory",
    description: "Offer more energy after collecting 10 carrots in previous days.",
    code: `package main

var collected int

func Decide(v View) Action {
    collected += v.LastFood
    energy := 4
    if collected >= 10 {
        energy = 6
    }
    return Action{Food: 2, Energy: energy}
}
`,
  },
];
