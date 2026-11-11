import { test } from "node:test";
import assert from "node:assert/strict";
import { dayStageFor } from "../public/day-stage.js";

test("the displayed day follows replay steps, including the closing meal", () => {
  const stage = (phase, kind, version = 3) =>
    dayStageFor({ phase, motion: { kind } }, version);
  assert.deepEqual(
    [
      stage("ready", "ready"),
      stage("start", "shuffle"),
      stage("start", "sun_charge"),
      stage("harvest", "pick"),
      stage("contribute", "farming_shuffle"),
      stage("contribute", "convert"),
      stage("grow", "grow"),
      stage("grow", "supper"),
      stage("death", "death"),
      stage("start", "shuffle"),
    ],
    [
      "ready",
      "dawn",
      "dawn",
      "morning",
      "afternoon",
      "afternoon",
      "afternoon",
      "evening",
      "evening",
      "dawn",
    ],
  );
  assert.equal(stage("grow", "grow", 2), "evening");
  assert.equal(dayStageFor({ phase: "grow" }, undefined), "evening");
});
