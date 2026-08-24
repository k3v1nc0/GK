export const QUEST_SCHEMA_VERSION = "gk-quest-v1";

export const QUEST_STATUS = Object.freeze({
  AVAILABLE: "available",
  ACTIVE: "active",
  READY_TO_TURN_IN: "ready_to_turn_in",
  COMPLETED: "completed",
  ABANDONED: "abandoned",
  FAILED: "failed"
});

export const OBJECTIVE_STATUS = Object.freeze({
  ACTIVE: "active",
  COMPLETED: "completed",
  FAILED: "failed"
});

export const OBJECTIVE_TYPES = Object.freeze({
  TALK: "talk",
  COLLECT: "collect",
  DELIVER: "deliver",
  REACH: "reach"
});

export function questStatusIsTerminal(status) {
  return status === QUEST_STATUS.COMPLETED
    || status === QUEST_STATUS.ABANDONED
    || status === QUEST_STATUS.FAILED;
}
