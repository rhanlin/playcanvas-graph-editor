/**
 * Expression parser and evaluator for visibleif/enabledif conditions.
 * Copied from editor/src/editor/scripting/expr-eval/ to ensure compatibility
 * with native PlayCanvas Editor's expression evaluation.
 */

export type ASTNode = {
  /** The type or kind of this AST node */
  type:
    | "BinaryExpression"
    | "UnaryExpression"
    | "MemberExpression"
    | "Identifier"
    | "Literal";
  /** The associated token */
  name?: string;
  /** The type of operator for this AST node */
  operator?: string;
  /** The value of the node, if applicable */
  value?: string | number | boolean | null;
  /** Reference to the object node, in nested props */
  object?: ASTNode;
  /** Whether the node is computed ie `obj["a" + "b"]` */
  computed?: boolean;
  /** The AST Node of a nodes property ie `obj.prop` */
  property?: ASTNode;
  /** The left node in a binary expression, ie `a` in `a + b` */
  left?: ASTNode;
  /** The right node in a binary expression, ie `b` in `a + b` */
  right?: ASTNode;
};

/**
 * Tokenizes a string based on the grammar rules below
 * @param {string} str - The expression to tokenize
 * @returns {string[]} An array of tokens
 */
const tokenize = (str: string): string[] => {
  // This regex captures:
  // - numbers (int or float)
  // - parentheses, punctuation ( ( ) [ ] . )
  // - logical/comparison/operators (&&, ||, ==, ===, !=, !==, <=, >=, <, >, +, -, *, /, !)
  // - identifiers (including underscores and $)
  // - strings in quotes (single or double)
  const tokenPattern =
    /\s*(\d+\.\d*|\.\d+|\d+|[A-Z_$][\w$]*|\.|&&|\|\||===|!==|==|!=|<=|>=|[<>+\-*/!()[\]]|"[^"]*"|'[^']*')\s*/gi;

  const result: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(str)) !== null) {
    result.push(match[1]);
  }
  return result;
};

// Utils
const NUM_REGEXP = /^(?:\d*\.\d+|\d+\.\d*|\d+)$/;
const IDENTIFIER_REGEXP = /^[A-Z_$][\w$]*$/i;

/**
 * @param {string} token - Checks if the token is a number
 * @returns {boolean} true if the token is a number, otherwise false
 */
const isNumber = (token: string): boolean => NUM_REGEXP.test(token);

/**
 * @param {string} token - Checks if the token is a string
 * @returns {boolean} true if the token is a string, false otherwise
 */
const isString = (token: string): boolean =>
  (token.startsWith('"') && token.endsWith('"')) ||
  (token.startsWith("'") && token.endsWith("'"));

/**
 * Assumes string has quotation marks, and removes them
 * @param {string} token - The string to parse
 * @returns {string} returns the string without quotes
 */
const parseString = (token: string): string => token.slice(1, -1);

/**
 * Checks if the token is a identifier, such as a variable
 * @param {string} token - The token to check
 * @returns {boolean} returns true if the token is a identifier, false otherwise
 */
const isIdentifier = (token: string): boolean => IDENTIFIER_REGEXP.test(token);

/**
 * Parses an array of tokens into an AST.
 * Uses a the following set of grammar rules.
 *
 * Grammar outline with "member expressions":
 * expression -> or
 * or         -> and ("||" and)*
 * and        -> equality ("&&" equality)*
 * equality   -> comparison (("==","===","!=","!==") comparison)*
 * comparison -> term (("<", "<=", ">", ">=") term)*
 * term       -> factor (("+"|"-") factor)*
 * factor     -> unary (("*"|"/") unary)*
 * unary      -> ("!" | "+" | "-") unary | member
 * member     -> primary ("." identifier | "[" expression "]")*
 * primary    -> NUMBER | STRING | true | false | identifier | "(" expression ")"
 *
 * @param {string[]} tokens - The array of tokens to parse
 * @returns {ASTNode} - The parsed AST
 */
const parseTokens = (tokens: string[]): ASTNode => {
  let position = 0;

  // Helper functions for navigating the tokens
  const advance = (): string => tokens[position++];
  const previous = (): string => tokens[position - 1];
  const peek = (): string | undefined => tokens[position];
  const isAtEnd = (): boolean => position >= tokens.length;

  const match = (...expected: string[]): boolean => {
    if (!isAtEnd() && peek() && expected.includes(peek()!)) {
      position++;
      return true;
    }
    return false;
  };

  // Parsing functions

  const parseExpression = (): ASTNode => parseOr();

  function parseOr(): ASTNode {
    let node = parseAnd();
    while (match("||")) {
      const operator = previous();
      const right = parseAnd();
      node = { type: "BinaryExpression", operator, left: node, right };
    }
    return node;
  }

  function parseAnd(): ASTNode {
    let node = parseEquality();
    while (match("&&")) {
      const operator = previous();
      const right = parseEquality();
      node = { type: "BinaryExpression", operator, left: node, right };
    }
    return node;
  }

  function parseEquality(): ASTNode {
    let node = parseComparison();
    while (match("==", "!=", "===", "!==")) {
      const operator = previous();
      const right = parseComparison();
      node = { type: "BinaryExpression", operator, left: node, right };
    }
    return node;
  }

  function parseComparison(): ASTNode {
    let node = parseTerm();
    while (match("<", "<=", ">", ">=")) {
      const operator = previous();
      const right = parseTerm();
      node = { type: "BinaryExpression", operator, left: node, right };
    }
    return node;
  }

  function parseTerm(): ASTNode {
    let node = parseFactor();
    while (match("+", "-")) {
      const operator = previous();
      const right = parseFactor();
      node = { type: "BinaryExpression", operator, left: node, right };
    }
    return node;
  }

  function parseFactor(): ASTNode {
    let node = parseUnary();
    while (match("*", "/")) {
      const operator = previous();
      const right = parseUnary();
      node = { type: "BinaryExpression", operator, left: node, right };
    }
    return node;
  }

  function parseUnary(): ASTNode {
    if (match("!", "+", "-")) {
      const operator = previous();
      const right = parseUnary();
      return { type: "UnaryExpression", operator, right };
    }
    return parseMember();
  }

  function consume(expected: string, errorMsg: string): string {
    if (check(expected)) {
      return advance();
    }
    throw new Error(`${errorMsg} (found '${peek() ?? "EOF"}')`);
  }

  function consumeIdentifier(msg: string): string {
    const t = peek();
    if (t && isIdentifier(t)) {
      advance();
      return t;
    }
    throw new Error(`${msg} (found '${t ?? "EOF"}')`);
  }

  function check(tokenVal: string): boolean {
    if (isAtEnd()) {
      return false;
    }
    return peek() === tokenVal;
  }

  // Member Expression Handling
  function parseMember(): ASTNode {
    // Start with a primary (number, string, identifier, or (expr))
    let node = parsePrimary();

    // Then handle property access: "." identifier or "[" expression "]"
    while (true) {
      if (match(".")) {
        // object.prop
        const propertyName = consumeIdentifier(
          "Expected property name after '.'"
        );
        node = {
          type: "MemberExpression",
          object: node,
          property: { type: "Literal", value: propertyName },
          computed: false,
        };
      } else if (match("[")) {
        // object[ expression ]
        const propertyExpr = parseExpression(); // parse what's inside []
        consume("]", "Expected ']' after property expression");
        node = {
          type: "MemberExpression",
          object: node,
          property: propertyExpr,
          computed: true,
        };
      } else {
        break;
      }
    }
    return node;
  }

  function parsePrimary(): ASTNode {
    if (match("(")) {
      const exprNode = parseExpression();
      consume(")", "Expected ')' after expression");
      return exprNode;
    }

    if (isAtEnd()) {
      throw new SyntaxError("Unexpected end of input");
    }

    const token = advance();

    if (isNumber(token)) {
      return { type: "Literal", value: parseFloat(token) };
    }
    if (isString(token)) {
      return { type: "Literal", value: parseString(token) };
    }
    if (token === "true") {
      return { type: "Literal", value: true };
    }
    if (token === "false") {
      return { type: "Literal", value: false };
    }
    // Otherwise, treat as identifier
    if (isIdentifier(token)) {
      return { type: "Identifier", name: token };
    }

    throw new Error(`Unexpected token "${token}" in parsePrimary`);
  }

  const ast = parseExpression();

  if (!isAtEnd()) {
    throw new SyntaxError(`Unexpected identifier '${peek()}'`);
  }

  return ast;
};

/**
 * Parses an expression string into an AST
 * @param {string} expression - The expression to parse
 * @returns {ASTNode} - The parsed AST
 */
const parse = (expression: string): ASTNode => {
  const tokens = tokenize(expression);
  return parseTokens(tokens);
};

/**
 * Takes an expression as an AST and evaluates it.
 *
 * @param {ASTNode | string} node - The root node of the expression to evaluate, or a string to parse first
 * @param {{}} context - The variables used in the expression
 * @returns {*} The evaluated expression
 */
const evaluateAST = (
  node: ASTNode,
  context: Record<string, unknown> = {}
): unknown => {
  /**
   * Expand the context to include null and undefined.
   * This allows expressions like `a !== null`
   */
  const expandedContext = {
    ...context,
    null: null,
    undefined: undefined,
  };

  switch (node.type) {
    case "Literal":
      return node.value;

    case "Identifier": {
      if (!node.name || !(node.name in expandedContext)) {
        throw new ReferenceError(`Undefined identifier: ${node.name}`);
      }
      return expandedContext[node.name];
    }

    case "UnaryExpression": {
      if (!node.right) {
        throw new Error("UnaryExpression missing right operand");
      }
      const val = evaluateAST(node.right, expandedContext);
      switch (node.operator) {
        case "!":
          return !val;
        case "+":
          return +val;
        case "-":
          return -val;
        default:
          throw new Error(`Unknown unary operator: ${node.operator}`);
      }
    }

    case "BinaryExpression": {
      if (!node.left || !node.right) {
        throw new Error("BinaryExpression missing operands");
      }
      const leftVal = evaluateAST(node.left, expandedContext);
      const rightVal = evaluateAST(node.right, expandedContext);
      switch (node.operator) {
        // simple arithmetic
        case "+":
          return leftVal + rightVal;
        case "-":
          return leftVal - rightVal;
        case "*":
          return leftVal * rightVal;
        case "/":
          return leftVal / rightVal;

        // comparison
        case "<":
          return leftVal < rightVal;
        case "<=":
          return leftVal <= rightVal;
        case ">":
          return leftVal > rightVal;
        case ">=":
          return leftVal >= rightVal;

        // equality
        case "==":
          return leftVal == rightVal; // eslint-disable-line eqeqeq
        case "!=":
          return leftVal != rightVal; // eslint-disable-line eqeqeq
        case "===":
          return leftVal === rightVal;
        case "!==":
          return leftVal !== rightVal;

        // logical
        case "&&":
          return leftVal && rightVal;
        case "||":
          return leftVal || rightVal;

        default:
          throw new Error(`Unknown binary operator: ${node.operator}`);
      }
    }

    case "MemberExpression": {
      if (!node.object) {
        throw new Error("MemberExpression missing object");
      }
      const obj = evaluateAST(node.object, expandedContext);
      if (obj === null || obj === undefined) {
        return undefined;
      }
      let propertyKey: string | number;
      if (node.computed) {
        // e.g. obj[ expr ]
        if (!node.property) {
          throw new Error("MemberExpression missing property");
        }
        propertyKey = evaluateAST(node.property, expandedContext) as
          | string
          | number;
      } else {
        // e.g. obj.prop (property is a literal storing the string name)
        if (!node.property || node.property.type !== "Literal") {
          throw new Error(
            "MemberExpression missing property or property is not a Literal"
          );
        }
        propertyKey = node.property.value as string;
      }
      return (obj as Record<string | number, unknown>)[propertyKey];
    }

    default:
      throw new Error(`Unknown node type: ${(node as ASTNode).type}`);
  }
};

/**
 * Evaluates an expression (either as a string or AST) with the given context
 * @param {string | ASTNode} expression - The expression to evaluate (string will be parsed first)
 * @param {{}} context - The variables used in the expression
 * @returns {*} The evaluated expression
 */
export const evaluate = (
  expression: string | ASTNode,
  context: Record<string, unknown> = {}
): unknown => {
  // If the expression is a string, parse it first
  const ast = typeof expression === "string" ? parse(expression) : expression;

  return evaluateAST(ast, context);
};
