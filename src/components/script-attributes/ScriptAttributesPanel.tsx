import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Handle, Position } from "reactflow";
import "@playcanvas/pcui/styles";

import { useGraphEditorStore } from "@/stores/useGraphEditorStore";
import { stopReactFlowEvent } from "@/utils/events";
import type {
  EntityPayload,
  ScriptAttributeDefinition,
  ScriptAttributePayload,
} from "@/types/messaging";
import { Input } from "@/components/ui/Input";
import { findTypeHandler } from "./TypeHandlers";
import { evaluateVisibleIf } from "./utils/visibleIf";
import { parseArrayValue } from "./utils/schema";
import { ArrayField } from "./ArrayField";

type ScriptAttributesPanelProps = {
  entityGuid: string;
  scriptName: string;
  attributes?: Record<string, ScriptAttributePayload>;
};

export const ScriptAttributesPanel = memo(
  ({ entityGuid, scriptName, attributes = {} }: ScriptAttributesPanelProps) => {
    const updateScriptAttribute = useGraphEditorStore(
      (state) => state.updateScriptAttribute
    );
    const entities = useGraphEditorStore((state) => state.entities);

    // Filter and sort attributes based on visibleif conditions
    // This ensures that when attribute values change, visibleif conditions are re-evaluated
    const visibleAttributes = useMemo(() => {
      return Object.entries(attributes)
        .filter(([name, attribute]) => {
          if (!attribute) {
            return false;
          }
          // Evaluate visibleif condition - this will re-run when attributes change
          return evaluateVisibleIf(attribute.definition, attributes);
        })
        .sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
    }, [attributes]);

    if (visibleAttributes.length === 0) {
      return (
        <p className="text-xs italic text-pc-text-dark">
          No script attributes detected for this script.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        {visibleAttributes.map(([name, attribute]) => {
          if (!attribute) {
            return null;
          }
          return (
            <AttributeField
              key={name}
              attributeName={name}
              attribute={attribute}
              entityGuid={entityGuid}
              scriptName={scriptName}
              updateScriptAttribute={updateScriptAttribute}
              entities={entities}
            />
          );
        })}
      </div>
    );
  }
);
ScriptAttributesPanel.displayName = "ScriptAttributesPanel";

type AttributeFieldProps = {
  attributeName: string;
  attribute: ScriptAttributePayload;
  entityGuid: string;
  scriptName: string;
  updateScriptAttribute: (
    entityGuid: string,
    scriptName: string,
    attributeName: string,
    value: unknown
  ) => void;
  entities: Record<string, EntityPayload>;
};

const AttributeField = ({
  attributeName,
  attribute,
  entityGuid,
  scriptName,
  updateScriptAttribute,
  entities,
}: AttributeFieldProps) => {
  const { definition } = attribute;
  const label = definition?.title || attributeName;
  const description = definition?.description;

  const handleChange = (value: unknown) => {
    updateScriptAttribute(entityGuid, scriptName, attributeName, value);
  };

  return (
    <div className=" rounded-2xl border border-pc-border-primary/50 bg-pc-dark p-3 text-sm text-pc-text-primary">
      <div className="relative flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold mb-1">{label}</p>
          {description ? (
            <p className="text-xs text-pc-text-dark">{description}</p>
          ) : null}
        </div>
        {definition?.placeholder ? (
          <span className="text-[10px] uppercase text-pc-text-dark">
            {definition.placeholder}
          </span>
        ) : null}

        {definition?.type === "entity" ? (
          <Handle
            type="source"
            position={Position.Right}
            id={attributeName}
            className="absolute -right-2 top-1/2 h-3 w-3 bg-pc-text-active"
            style={{ transform: "translateY(-50%)" }}
            onConnect={(params) => {}}
          />
        ) : null}
      </div>
      <div className="mt-3">
        <AttributeInput
          attribute={attribute}
          definition={definition}
          value={attribute.value}
          onChange={handleChange}
          entities={entities}
          entityGuid={entityGuid}
          attributeKey={attributeName}
        />
      </div>
    </div>
  );
};

export type AttributeInputProps = {
  value: any;
  attribute: ScriptAttributePayload;
  definition?: ScriptAttributeDefinition;
  onChange: (value: unknown) => void;
  entities: Record<string, EntityPayload>;
  entityGuid: string;
  attributeKey: string;
  // Context for evaluating nested visibleif conditions
  parentContext?: Record<string, any>;
};

const AttributeInput = ({
  value,
  attribute,
  definition,
  onChange,
  entities,
  entityGuid,
  attributeKey,
  parentContext,
}: AttributeInputProps) => {
  const type = attribute.type || definition?.type || "string";

  // Try to find a matching type handler
  // For complex types (entity, asset, array, json, colorArray), we still use the old logic below
  const handler = findTypeHandler({
    type,
    definition,
    value,
    attributeKey,
  });

  // If handler exists and returns a valid component (not null), use it
  if (handler) {
    const rendered = handler.render({
      type,
      value,
      definition,
      onChange,
      entities,
      entityGuid,
      attributeKey,
      useState,
      useEffect,
      useLayoutEffect,
      useMemo,
      useCallback,
      useRef,
    });

    // If handler returned null, it means it needs special handling (e.g., ColorArrayField, ArrayField)
    // Fall through to the old logic below
    if (rendered !== null) {
      return <>{rendered}</>;
    }
  }

  // Handle array types (both "array" and "json" with array: true)
  if (type === "array" || (type === "json" && definition?.array === true)) {
    const list = Array.isArray(value) ? value : [];
    return (
      <ArrayField
        current={list}
        onChange={onChange}
        definition={definition}
        entities={entities}
        entityGuid={entityGuid}
        AttributeInput={AttributeInput}
      />
    );
  }

  // Handle non-array json/object types
  if (type === "json" || type === "object") {
    return (
      <textarea
        value={JSON.stringify(value ?? {}, null, 2)}
        onPointerDownCapture={stopReactFlowEvent}
        onChange={(event) => {
          try {
            const parsed = JSON.parse(event.target.value);
            onChange(parsed);
          } catch {
            // ignore parse errors until valid
          }
        }}
        className="min-h-[120px] w-full rounded-xl border border-pc-border-primary bg-pc-darkest px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-pc-text-active"
      />
    );
  }

  // string fallback - use unified Input component
  return (
    <Input
      type="text"
      value={value ?? ""}
      placeholder={definition?.placeholder}
      onChange={onChange}
      className="w-full"
    />
  );
};

// VectorField has been moved to type-handlers.tsx
// ArrayField and JsonObjectField have been moved to separate files
