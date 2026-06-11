import type { PublishedNodeEnvelope, ValidationIssue } from "@gk/schemas";
import type { NodeTypeDefinition, NodeTypeRegistrySnapshot } from "@gk/node-types";

export class NodeRegistry {
  readonly #definitions = new Map<string, NodeTypeDefinition>();

  register(definition: NodeTypeDefinition): void {
    this.#definitions.set(definition.type, definition);
  }

  validate(envelope: PublishedNodeEnvelope): readonly ValidationIssue[] {
    const definition = this.#definitions.get(envelope.nodeType);

    if (!definition) {
      return [{
        path: "nodeType",
        message: `Unknown node type: ${envelope.nodeType}`,
        severity: "error"
      }];
    }

    return definition.validate.validate(envelope.data);
  }

  snapshot(): NodeTypeRegistrySnapshot {
    return {
      nodeTypes: [...this.#definitions.keys()].sort()
    };
  }
}

export * from "./draft-preview.js";
export * from "./graph-history.js";
export * from "./graph-validation.js";
