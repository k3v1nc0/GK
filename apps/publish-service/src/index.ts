import { NodeRegistry } from "@gk/node-engine";
import type { PublishedNodeEnvelope, ValidationIssue } from "@gk/schemas";

export interface PublishValidationResult {
  readonly canPublish: boolean;
  readonly issues: readonly ValidationIssue[];
}

export function validateForPublish(
  registry: NodeRegistry,
  nodes: readonly PublishedNodeEnvelope[]
): PublishValidationResult {
  const issues = nodes.flatMap((node) => [...registry.validate(node)]);

  return {
    canPublish: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

