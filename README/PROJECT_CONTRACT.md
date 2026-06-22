# Project Contract

This project has one hard rule that everything else follows from:

**No seeded game content. Ever.**

The engine knows *how* to do things (move a player, follow with a camera, detect
collisions, trigger interactions). It never decides *what* the game contains.
Every concrete value - a world, a ground, a model, a spawn point, a key binding -
is authored in the editor or imported as an asset. A fresh database produces a
game that returns 404 until you publish something real.

## What this means in practice

- The database seeds exactly one node: a single `game_output`. Nothing else.
- The runtime has no built-in controls. Movement and interaction only work once
  you author `keybind` nodes. Click-to-move is a pointer capability, not content.
- Assets are never generated. Image and texture assets are their own thumbnails;
  models, audio and data show a typed icon. No placeholder geometry, no proxy boxes.
- Publishing is gated by validation. You cannot publish an unplayable world.
- The smoke test asserts the 404-before-publish behaviour so a regression that
  seeds content fails CI.
- Nodes moeten een standaard waarde hebben als je ze invoegd in de node-graph, ook als je een waarde input leeg maakt moet de standaard waarde weer terug komen.

## Engine vs content boundary

| Engine (allowed in code) | Content (must come from the editor) |
| --- | --- |
| Top-down follow camera math | Camera pitch, yaw, distance, zoom range |
| Circle collision resolver | Which entities are solid and their radius |
| Click-to-move raycasting | The ground size that bounds movement |
| Key-to-action dispatch | Which key maps to which action |
| Interaction proximity check | Interactable positions, prompts, actions |
| GLB / texture loaders | The actual model and texture files |

If you add a feature, put the *capability* in the engine and expose the *content*
as node fields. Never hardcode a value a designer would want to change.
