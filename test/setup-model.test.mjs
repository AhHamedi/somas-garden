import test from "node:test";
import assert from "node:assert/strict";
import { freshState, loadState, newSeat, runInput } from "../public/setup-model.js";

test("new gardens use Amoeboid names without renaming existing seats", () => {
  const state = freshState();
  assert.deepEqual(
    state.roster.map((seat) => seat.name),
    ["Amoeboid 1", "Amoeboid 2", "Amoeboid 3", "Amoeboid 4", "Amoeboid 5", "Amoeboid 6"],
  );
  const seats = [
    { ...state.roster[0], name: "Seedling 1" },
    { ...state.roster[1], name: "Amoeboid 1" },
    { ...state.roster[2], name: "Clover" },
  ];
  assert.equal(newSeat(seats).name, "Amoeboid 2");
  assert.deepEqual(
    seats.map((seat) => seat.name),
    ["Seedling 1", "Amoeboid 1", "Clover"],
  );
});

test("saved setup and run identities retain historical and custom names", (t) => {
  const state = freshState();
  state.roster[0].name = "Seedling 1";
  state.roster[1].name = "Clover";
  delete state.settings.roundLimit;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem(key) {
        assert.equal(key, "somas.garden.setup.v1");
        return JSON.stringify(state);
      },
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  });
  const loaded = loadState();
  assert.equal(loaded.settings.roundLimit, 30);
  assert.deepEqual(loaded.roster, state.roster);
  assert.deepEqual(
    runInput(loaded).roster.map((seat) => seat.name),
    state.roster.map((seat) => seat.name),
  );
});
