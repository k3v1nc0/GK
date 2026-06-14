export const RUNTIME_CLIENT_SHELL_STYLES = `
:root {
  color-scheme: light;
  font-family: system-ui, sans-serif;
  background: #f6f7f8;
  color: #15171a;
}
body {
  margin: 0;
  min-height: 100vh;
  background: #f6f7f8;
}
main {
  width: min(1040px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0;
}
header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  border-bottom: 1px solid #d9dde3;
  padding-bottom: 18px;
}
h1 {
  margin: 0;
  font-size: 1.6rem;
  line-height: 1.2;
  letter-spacing: 0;
}
h2 {
  margin: 0 0 10px;
  font-size: 1rem;
  line-height: 1.3;
  letter-spacing: 0;
}
p {
  margin: 8px 0 0;
  line-height: 1.5;
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
}
.status-pill {
  border: 1px solid #b8c0cc;
  border-radius: 6px;
  padding: 6px 10px;
  background: #fff;
  white-space: nowrap;
}
.runtime-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}
.panel,
.render-surface,
.scene-assembly,
.asset-reference-planning,
.runtime-game-core {
  min-width: 0;
  border: 1px solid #d9dde3;
  border-radius: 8px;
  padding: 14px;
  background: #fff;
}
.panel ul {
  margin: 0;
  padding-left: 18px;
}
.render-surface,
.scene-assembly,
.asset-reference-planning,
.runtime-game-core {
  margin-top: 12px;
}
.render-header,
.scene-assembly-header,
.asset-reference-header,
.runtime-game-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.render-host {
  position: relative;
  min-height: 180px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid #c6ccd4;
  border-radius: 6px;
  background: #15171a;
  color: #fff;
}
.render-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.04;
  pointer-events: none;
}
.render-host p {
  position: relative;
  margin: 0;
  padding: 16px;
  text-align: center;
}
.scene-plan-panel,
.asset-reference-plan-panel,
.runtime-game-panel {
  border: 1px solid #d9dde3;
  border-radius: 6px;
  padding: 12px;
  background: #f6f7f8;
}
.scene-plan-panel p,
.asset-reference-plan-panel p,
.runtime-game-panel p {
  margin: 0;
}
.render-capability-grid,
.scene-assembly-grid,
.asset-reference-grid,
.runtime-game-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}
.render-capability-grid span,
.scene-assembly-grid span,
.asset-reference-grid span,
.runtime-game-grid span {
  min-width: 0;
  border: 1px solid #d9dde3;
  border-radius: 6px;
  padding: 8px;
  background: #f6f7f8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}
.muted {
  color: #5c6672;
}
.error {
  margin-top: 18px;
  border: 1px solid #b84a4a;
  border-radius: 8px;
  padding: 12px;
  color: #7b1f1f;
  background: #fff7f7;
}
[hidden] {
  display: none !important;
}
@media (max-width: 760px) {
  header,
  .runtime-grid,
  .render-header,
  .scene-assembly-header,
  .asset-reference-header,
  .runtime-game-header,
  .render-capability-grid,
  .scene-assembly-grid,
  .asset-reference-grid,
  .runtime-game-grid {
    display: block;
  }
  .panel,
  .render-capability-grid span,
  .scene-assembly-grid span,
  .asset-reference-grid span,
  .runtime-game-grid span {
    margin-top: 12px;
  }
  .status-pill {
    display: inline-block;
    margin-top: 12px;
  }
}
`;
