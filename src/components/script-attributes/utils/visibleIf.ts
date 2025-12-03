import { evaluate } from "@/utils/expr-eval";
import type { ScriptAttributeDefinition, ScriptAttributePayload } from "@/types/messaging";

/**
 * Evaluates a visibleif condition for script attributes.
 * Supports multiple formats:
 * 1. String expressions (e.g., "someAttribute === true", "value > 5")
 * 2. Array of condition objects with lhs, rhs, operator
 * 3. Object with key-value pairs (simple equality checks)
 *
 * This mirrors the behavior of the native PlayCanvas Editor's visibleif evaluation.
 */
export const evaluateVisibleIf = (
  definition: ScriptAttributeDefinition | undefined,
  attributes: Record<string, ScriptAttributePayload> | undefined
): boolean => {
  if (!definition?.visibleif) {
    return true;
  }

  const visibleIf = definition.visibleif;
  const values =
    attributes &&
    Object.fromEntries(
      Object.entries(attributes).map(([key, attr]) => [key, attr?.value])
    );

  // Handle string expressions (e.g., "someAttribute === true")
  if (typeof visibleIf === "string") {
    return evaluateStringExpression(visibleIf, values);
  }

  // Handle array of conditions
  if (Array.isArray(visibleIf)) {
    return visibleIf.every((cond) => evaluateSingleCondition(cond, values));
  }

  // Handle object with key-value pairs (simple equality checks)
  if (typeof visibleIf === "object" && visibleIf !== null) {
    return Object.entries(visibleIf).every(([key, expected]) => {
      return values && values[key] === expected;
    });
  }

  return true;
};

/**
 * Evaluates a string expression using the same parser as native PlayCanvas Editor.
 * This ensures 100% compatibility with Editor's visibleif/enabledif expressions.
 */
const evaluateStringExpression = (
  expression: string,
  values: Record<string, unknown> | undefined
): boolean => {
  if (!values || !expression.trim()) {
    return true;
  }

  try {
    // Create evaluation context with attribute values
    // Include null, undefined, true, false as they are commonly used in expressions
    const context: Record<string, unknown> = {
      ...values,
      null: null,
      undefined: undefined,
      true: true,
      false: false,
    };

    // Use the same parse and evaluate functions as native Editor
    const result = evaluate(expression, context);
    return !!result;
  } catch (error) {
    console.warn(
      `[ScriptAttributesPanel] Failed to evaluate visibleif expression: "${expression}"`,
      error
    );
    // On error, default to visible (fail-safe)
    return true;
  }
};

/**
 * Evaluates a single condition object with lhs, rhs, and operator.
 */
const evaluateSingleCondition = (
  condition: any,
  values: Record<string, unknown> | undefined
): boolean => {
  if (!condition) {
    return true;
  }

  // If condition is a string, treat it as an expression
  if (typeof condition === "string") {
    return evaluateStringExpression(condition, values);
  }

  // Handle condition object format
  const { lhs, rhs, operator = "==" } = condition;
  if (!values || !(lhs in values)) {
    return false;
  }

  const leftValue = values[lhs];
  switch (operator) {
    case "==":
    case "===":
      return leftValue === rhs;
    case "!=":
    case "!==":
      return leftValue !== rhs;
    case ">":
      return Number(leftValue) > Number(rhs);
    case ">=":
      return Number(leftValue) >= Number(rhs);
    case "<":
      return Number(leftValue) < Number(rhs);
    case "<=":
      return Number(leftValue) <= Number(rhs);
    default:
      return true;
  }
};

