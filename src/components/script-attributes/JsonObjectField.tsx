import { useMemo } from "react";
import type {
  EntityPayload,
  ScriptAttributeDefinition,
  ScriptAttributePayload,
} from "@/types/messaging";
import { FieldTooltip } from "./FieldTooltip";
import { evaluateVisibleIf } from "./utils/visibleIf";
import { getDefaultValueForSchemaField } from "./utils/schema";
import type { AttributeInputProps } from "./ScriptAttributesPanel";

type JsonObjectFieldProps = {
  value: Record<string, any>;
  schema: NonNullable<ScriptAttributeDefinition["schema"]>;
  onChange: (next: Record<string, any>) => void;
  entities?: Record<string, EntityPayload>;
  entityGuid?: string;
  // Context for evaluating visibleif - the current object's values
  context?: Record<string, any>;
  // AttributeInput component to render nested fields
  AttributeInput: React.ComponentType<AttributeInputProps>;
};

export const JsonObjectField = ({
  value,
  schema,
  onChange,
  entities,
  entityGuid,
  context,
  AttributeInput,
}: JsonObjectFieldProps) => {
  const handleFieldChange = (fieldName: string, fieldValue: any) => {
    onChange({
      ...value,
      [fieldName]: fieldValue,
    });
  };

  // Filter schema fields based on visibleif conditions
  // Use the current object's values as context for evaluation
  const evaluationContext = context || value;
  const visibleFields = useMemo(() => {
    return schema.filter((field) => {
      // Convert schema fields to attribute format for evaluation
      const attributesForContext: Record<string, ScriptAttributePayload> = {};
      schema.forEach((f) => {
        attributesForContext[f.name] = {
          type: f.type,
          value:
            evaluationContext?.[f.name] ?? getDefaultValueForSchemaField(f),
          definition: f,
        };
      });
      return evaluateVisibleIf(field, attributesForContext);
    });
  }, [schema, evaluationContext]);

  return (
    <div className="space-y-3 rounded-xl border border-pc-border-primary/50 bg-pc-dark p-3">
      {visibleFields.map((field) => {
        const fieldValue =
          value?.[field.name] ?? getDefaultValueForSchemaField(field);
        const fieldLabel = field.title || field.name;
        const fieldDescription = field.description;

        return (
          <div key={field.name} className="space-y-1">
            <FieldTooltip
              label={fieldLabel}
              description={fieldDescription}
              placement="right"
            >
              <p className="w-full text-xs font-semibold text-pc-text-primary">
                {fieldLabel}
              </p>
            </FieldTooltip>
            {entities && entityGuid ? (
              <AttributeInput
                value={fieldValue}
                attribute={{
                  type: field.type,
                  value: fieldValue,
                  definition: field,
                }}
                definition={field}
                onChange={(next) => handleFieldChange(field.name, next)}
                entities={entities}
                entityGuid={entityGuid}
                attributeKey={field.name}
                // Pass context for nested visibleif evaluation
                parentContext={evaluationContext}
              />
            ) : (
              <div className="text-xs text-pc-text-dark">
                Entity context required for editing
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

