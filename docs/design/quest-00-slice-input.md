# Quest 00 slice input package

## Status

Geparkeerd door Kevin op 2026-06-14 als toekomstige node/editor-data input.

Dit document is content-input voor latere editor/node-data en publish-contracten. Het is geen runtimecode, geen testfixture en geen fallbackbron. Fase 18 mag concrete waarden uit dit document niet in runtime source, game shell, default state of fallback data opnemen.

Kevin heeft daarna verduidelijkt dat Fase 18 eerst alleen de generieke quest/dialogue/objective/interactable/reward/unlock/checkpoint/asset-role infrastructuur bouwt. Quest 00 zelf komt pas later via node-data/editor-data en publish-flow.

## Gebruik van dit document

Toegestaan:

- gebruiken als toekomstige content/backlog voor editor-node authoring;
- gebruiken als input wanneer Kevin expliciet vraagt om Quest 00 node-data te publiceren;
- gebruiken om later GameBible-, editor- en publish-contracten te toetsen.

Niet toegestaan:

- kopieren naar runtimecode;
- gebruiken als runtime fallback wanneer published data ontbreekt;
- gebruiken als testfixture voor de generieke executor;
- gebruiken om dummy assets, dummy published data of hardcoded asset roles te maken.

## Bronnen

Actuele repo-bronnen die opnieuw moeten worden geraadpleegd voordat Quest 00 als echte node/editor-data wordt uitgewerkt:

- `README/GameBibleNode.json`
- `docs/design/game-bible.md`
- `docs/fases/fase-18-speelbare-quest-en-dialoogslice.md`
- `README/node-system-super-dynamic-contract.md`
- `README/hard-facts-to-node-panels.md`

GameBible-bronnodes die eerder voor dit pakket zijn gebruikt:

- `node-mq00`: Quest 00 hoofdlijn.
- `node-story-act0`: Failure Becomes Input.
- `node-zone-workshop`: Home Base tutorialruimte.
- `node-item-start-staff`: Starting Staff.
- `node-unlock-spark`: Spark.
- `node-unlock-empathy`: Empathy Casting.
- `node-sys-quest-state`: Quest State Machine.
- `node-sys-save`: Save State.

## Quest identity

```json
{
  "questId": "quest-00",
  "questTag": "Quest 00",
  "questTitle": "The Candle That Failed",
  "sourceNodeId": "node-mq00",
  "locationTag": "Home Base",
  "locationName": "Willowmere Workshop",
  "protagonistTag": "Protagonist",
  "protagonistName": "Arlen Tharys",
  "mentorTag": "Mentor",
  "mentorName": "Master Thorne"
}
```

## Confirmed unlock rule

Kevin confirmed this rule on 2026-06-14:

- Grant `Humble Ash Staff` at Quest 00 completion.
- Grant `Spark` at Quest 00 completion.
- Do not fully unlock `Empathy Casting` in Fase 18.
- Set a persistent `empathy_feedback_flag` from Mentor failure-feedback.

Contract interpretation:

- `node-mq00` grants Spark.
- `node-story-act0` introduces failure as readable feedback.
- `node-unlock-empathy` may be referenced by the feedback flag, but the runtime must not treat that as a full Empathy Casting unlock.

## Dialogue package

The dialogue package is minimal and linear. It must be stored as node/editor data and published into the runtime read model before runtime can consume it.

```json
{
  "dialogueId": "q00.dialogue.mentor.failure-feedback",
  "sourceNodeIds": ["node-mq00", "node-story-act0", "node-unlock-spark"],
  "speakerRoles": ["mentor", "system"],
  "startNodeId": "q00.dialogue.mentor.failure-feedback.start",
  "nodes": [
    {
      "id": "q00.dialogue.mentor.failure-feedback.start",
      "speakerRole": "mentor",
      "line": "Failure gives readable feedback.",
      "choices": [{ "id": "q00.choice.continue-to-spark-rule", "label": "Continue", "nextNodeId": "q00.dialogue.mentor.failure-feedback.spark-rule" }]
    },
    {
      "id": "q00.dialogue.mentor.failure-feedback.spark-rule",
      "speakerRole": "mentor",
      "line": "Spark is a basic light poke, intentionally unreliable until empathy systems are learned.",
      "choices": [{ "id": "q00.choice.continue-to-reward", "label": "Continue", "nextNodeId": "q00.dialogue.mentor.failure-feedback.reward" }]
    },
    {
      "id": "q00.dialogue.mentor.failure-feedback.reward",
      "speakerRole": "system",
      "line": "Quest 00 rewards Humble Ash Staff and unlocks Spark.",
      "choices": [{ "id": "q00.choice.complete-dialogue", "label": "Complete", "nextNodeId": "q00.dialogue.mentor.failure-feedback.end" }]
    },
    {
      "id": "q00.dialogue.mentor.failure-feedback.end",
      "speakerRole": "system",
      "line": "Dialogue complete.",
      "choices": []
    }
  ]
}
```

Restrictions:

- No branching lore beyond GameBible facts.
- No voice/audio requirement in Fase 18.
- Runtime uses deterministic dialogue-state steps, not animation timing.

## Objectives

```json
[
  {
    "objectiveId": "q00.objective.fail-light-charm",
    "type": "interaction-event",
    "sourceNodeId": "node-mq00",
    "targetInteractableId": "q00.interactable.light-charm-casting-point",
    "requiredEvent": "light_charm.failed",
    "completionCondition": "failure_feedback_visible",
    "blockedCondition": "light_charm_source_missing"
  },
  {
    "objectiveId": "q00.objective.inspect-ruined-wood",
    "type": "interaction-event",
    "sourceNodeId": "node-mq00",
    "targetInteractableId": "q00.interactable.ruined-wood",
    "requiredEvent": "inspect.completed",
    "completionCondition": "ruined_wood_inspected",
    "blockedCondition": "ruined_wood_interactable_missing"
  },
  {
    "objectiveId": "q00.objective.speak-to-mentor",
    "type": "dialogue-completion",
    "sourceNodeId": "node-mq00",
    "targetDialogueId": "q00.dialogue.mentor.failure-feedback",
    "requiredEvent": "dialogue.completed",
    "completionCondition": "mentor_failure_feedback_completed",
    "blockedCondition": "mentor_dialogue_missing"
  },
  {
    "objectiveId": "q00.objective.apply-reward",
    "type": "reward-application",
    "sourceNodeId": "node-mq00",
    "targetRewardIds": ["q00.reward.humble-ash-staff", "q00.reward.unlock-spark", "q00.flag.empathy-feedback"],
    "requiredEvent": "reward.applied",
    "completionCondition": "quest_rewards_applied",
    "blockedCondition": "reward_contract_missing"
  }
]
```

Restrictions:

- Quest state changes only through objective and quest executors.
- UI clicks may emit input intents, but may not mutate quest state directly.
- Missing interactables, dialogue or rewards must block visibly instead of auto-completing.

## Interactables

```json
[
  {
    "interactableId": "q00.interactable.light-charm-casting-point",
    "role": "spell-attempt-surface",
    "sourceNodeId": "node-mq00",
    "inputEvent": "interact.cast_light_charm",
    "emits": ["light_charm.failed", "failure_feedback_visible"],
    "assetRoleId": "q00.asset-role.failed-spell-bench"
  },
  {
    "interactableId": "q00.interactable.ruined-wood",
    "role": "inspectable-evidence",
    "sourceNodeId": "node-mq00",
    "inputEvent": "interact.inspect",
    "emits": ["inspect.completed", "ruined_wood_inspected"],
    "assetRoleId": "q00.asset-role.ruined-wood"
  },
  {
    "interactableId": "q00.interactable.mentor",
    "role": "dialogue-actor",
    "sourceTag": "Mentor",
    "inputEvent": "interact.talk",
    "emits": ["dialogue.started", "dialogue.completed"],
    "assetRoleId": "q00.asset-role.mentor"
  },
  {
    "interactableId": "q00.interactable.starting-staff-reward",
    "role": "reward-item",
    "sourceNodeId": "node-item-start-staff",
    "inputEvent": "reward.apply",
    "emits": ["reward.applied"],
    "assetRoleId": "q00.asset-role.starting-staff"
  }
]
```

## Rewards, unlocks and flags

```json
[
  {
    "rewardId": "q00.reward.humble-ash-staff",
    "type": "item-grant",
    "sourceNodeId": "node-item-start-staff",
    "itemTag": "Item Starting Staff",
    "itemName": "Humble Ash Staff",
    "grantTiming": "on:quest-completion",
    "persistence": "save-state.inventory.items",
    "quantity": 1
  },
  {
    "rewardId": "q00.reward.unlock-spark",
    "type": "unlock-grant",
    "sourceNodeId": "node-unlock-spark",
    "unlockTag": "Unlock Spark",
    "unlockName": "Spark",
    "grantTiming": "on:quest-completion",
    "persistence": "save-state.unlocks",
    "quantity": 1
  },
  {
    "rewardId": "q00.flag.empathy-feedback",
    "type": "quest-flag",
    "sourceNodeIds": ["node-story-act0", "node-unlock-empathy"],
    "flagName": "empathy_feedback_flag",
    "grantTiming": "after:q00.objective.speak-to-mentor",
    "persistence": "save-state.questFlags",
    "quantity": 1,
    "doesNotGrantUnlock": "Unlock Empathy Cast"
  }
]
```

## Checkpoints

```json
[
  {
    "checkpointId": "q00.checkpoint.start",
    "source": "quest-start",
    "locationTag": "Home Base",
    "restoreRule": "restore quest state before light charm attempt",
    "restores": ["questState", "objectiveState", "dialogueState"]
  },
  {
    "checkpointId": "q00.checkpoint.after-light-charm-failed",
    "source": "objective-complete:q00.objective.fail-light-charm",
    "locationTag": "Home Base",
    "restoreRule": "restore after failure feedback became visible",
    "restores": ["questState", "objectiveState", "interactableState"]
  },
  {
    "checkpointId": "q00.checkpoint.after-ruined-wood-inspected",
    "source": "objective-complete:q00.objective.inspect-ruined-wood",
    "locationTag": "Home Base",
    "restoreRule": "restore before Mentor dialogue",
    "restores": ["questState", "objectiveState", "dialogueState"]
  },
  {
    "checkpointId": "q00.checkpoint.completed",
    "source": "quest-complete",
    "locationTag": "Home Base",
    "restoreRule": "restore completed quest, rewards, unlocks and feedback flags",
    "restores": ["questState", "rewardState", "inventoryState", "unlockState", "questFlags"]
  }
]
```

Checkpoint restrictions:

- No coordinates are defined in this package.
- No camera, lighting, minimap or HUD values are defined here.
- Runtime must block or report missing world placement if a concrete spawnpoint is required later.

## Asset roles

The current repo asset fact remains: four GLB files exist, but none is a definitive runtime role for this slice. UI images and audio are absent.

```json
[
  { "assetRoleId": "q00.asset-role.protagonist", "role": "player-character", "requiredForPlayableSlice": true, "assetReferenceId": null, "status": "unmapped" },
  { "assetRoleId": "q00.asset-role.mentor", "role": "dialogue-actor", "requiredForPlayableSlice": true, "assetReferenceId": null, "status": "unmapped" },
  { "assetRoleId": "q00.asset-role.failed-spell-bench", "role": "spell-attempt-surface", "requiredForPlayableSlice": true, "assetReferenceId": null, "status": "unmapped" },
  { "assetRoleId": "q00.asset-role.ruined-wood", "role": "inspectable-evidence", "requiredForPlayableSlice": true, "assetReferenceId": null, "status": "unmapped" },
  { "assetRoleId": "q00.asset-role.starting-staff", "role": "reward-item", "requiredForPlayableSlice": true, "assetReferenceId": null, "status": "unmapped" },
  { "assetRoleId": "q00.asset-role.home-base-props", "role": "zone-prop-set", "requiredForPlayableSlice": false, "assetReferenceId": null, "status": "unmapped" }
]
```

Asset gate confirmed for later Quest 00 data work:

- The generic runtime may expose unresolved asset-role blockers.
- Quest 00 asset-role records must explicitly exist in published data before runtime can report them as slice-specific blockers.
- Unresolved asset roles must visibly block runtime completion.
- No dummy assets may be created.
- No runtime hardcoding may assign asset roles.
- Any GLB assignment must come from editor/node-data, asset register, GameBible update or explicit Kevin confirmation.

## Runtime read-model shape for future Quest 00 publication

Fase 18 extends runtime projection with these generic content-bearing record types, all sourced from published data:

```json
[
  "quest.reference",
  "dialogue.reference",
  "objective.reference",
  "interactable.reference",
  "reward.reference",
  "unlock.reference",
  "checkpoint.reference",
  "asset-role.reference"
]
```

Each record keeps this outer envelope:

```json
{
  "recordId": "string",
  "recordType": "quest.reference | dialogue.reference | objective.reference | interactable.reference | reward.reference | unlock.reference | checkpoint.reference | asset-role.reference",
  "sourceId": "published-snapshot-or-node-id",
  "snapshotId": "published snapshot id",
  "dataReference": {
    "source": "publish-snapshot-metadata",
    "id": "published data id"
  },
  "runtimeReadable": true,
  "rendererInstruction": null,
  "safetyFlags": {
    "fromPublishedData": true,
    "usesEditorDraftData": false,
    "usesEditorAdminRoutes": false,
    "hardcodesContent": false,
    "mutatesPublishedData": false
  }
}
```

Potential Quest 00 package read model after later editor/publish work:

```json
{
  "quest": "quest.reference for quest-00",
  "dialogues": "dialogue.reference records keyed by dialogueId",
  "objectives": "objective.reference records keyed by objectiveId",
  "interactables": "interactable.reference records keyed by interactableId",
  "rewards": "reward.reference records keyed by rewardId",
  "unlocks": "unlock.reference records keyed by unlockId",
  "checkpoints": "checkpoint.reference records keyed by checkpointId",
  "assetRoles": "asset-role.reference records keyed by assetRoleId"
}
```

## Runtime state shape for future Quest 00 publication

Runtime may persist only state, not source content:

```json
{
  "questStates": {
    "quest-00": {
      "status": "not-started | active | completed | blocked",
      "activeObjectiveId": "string | null",
      "completedObjectiveIds": [],
      "blockedReason": "string | null"
    }
  },
  "dialogueStates": {
    "q00.dialogue.mentor.failure-feedback": {
      "currentNodeId": "string | null",
      "completed": false
    }
  },
  "interactableStates": {},
  "rewardStates": {},
  "checkpointState": {
    "lastCheckpointId": "string | null"
  },
  "questFlags": {
    "empathy_feedback_flag": false
  }
}
```

## Implementation gate

Current generic Fase 18 gates:

1. Runtime must consume only published read-model records.
2. Quest/dialogue/objective/reward/checkpoint state must persist as runtime state only.
3. Testfixtures may not become runtime fallback content.
4. Server-side verification must run `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm typecheck`, route-smokes and browser-smokes.
5. A full visual playable claim requires real published slice-data and asset-role mappings from editor/node-data or explicit Kevin confirmation.

Future Quest 00 data gates:

1. Quest 00 must be authored as node/editor-data.
2. Publish-flow must produce the generic read-model records listed above.
3. Runtime must read those records without copying content into source code.
4. Asset roles must remain unresolved blockers until mapped through the allowed data path.
