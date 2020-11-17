import { err, ok, Result } from '../neverthrow/neverthrow';
import { Table } from '../table';
import { AlgebraicOperation } from './algebraic_operation';
import { newComponent } from './component';
import { ConditionalFunctionCall } from './conditional_function';
import { newRange, Range } from './range';
import { SingleParamFunctionCall } from './single_param_function';
import { Grammars, IToken } from 'ebnf';
import { concat } from 'lodash';

// TODO: Add unit test for table.setCellAt
// TODO: Add unit test for tablerow.setCellAt
// TODO: Add support for @-n as a shorthand for @>-(n-1)
// TODO: Add a test to check that arity of source and destination matches when calling aggregating functions
// TODO: Add tests with multiple functions. Ensure applied sequentially.

/**
 * W3C grammar describing a valid formula at the bottom of a table.
 *
 * The library being used to parse the formula does not suport EBNF, only BNF,
 * so W3C syntax was used in order to get access to extended features.
 *
 * The parser generates a PEG parser, whic is not able to handle ambiguity. The
 * order of constructions is significant.
 * See https://github.com/lys-lang/node-ebnf/issues/34
 */
const parserGrammar = `
tblfm_line ::= "<!-- TBLFM: " formula_list " -->"
formula_list ::= formula ( "::" formula_list )?
formula ::= destination "=" source display_directive?
destination ::=  range | component
source ::= range | component | single_param_function_call | conditional_function_call | algebraic_operation

range ::= component ".." component
component ::= row column | row | column
row ::= "@" ( real | relative_row )
column ::= "$" ( real | relative_column )
relative_row ::= ( "<" | ">" | "I" ) offset?
relative_column ::= ( "<" | ">" ) offset?
offset ::= ( "-" | "+" ) int

single_param_function_call ::= single_param_function "(" source ")"
single_param_function ::= "mean" | "vmean" | "sum" | "vsum"

conditional_function_call ::= "if(" predicate ", " source ", " source ")"
predicate ::= source conditional_operator source
conditional_operator ::= ">" | "<" | ">=" | "<=" | "==" | "!="

algebraic_operation ::= "(" source " "? algebraic_operator " "? source ")"
algebraic_operator ::= "+" | "-" | "*" | "/"

display_directive ::= ";" display_directive_option
display_directive_option ::= formatting_directive
formatting_directive ::= "%." int "f"

real ::= '-'? int
int ::= [0-9]+
`;

export class Arity {
  public rows: number;
  public cols: number;

  constructor(rows: number, columns: number) {
    this.rows = rows;
    this.cols = columns;
  }

  public isRow = (): boolean => this.rows > 1 && this.cols === 1;

  public isColumn = (): boolean => this.rows === 1 && this.cols > 1;

  public isCell = (): boolean => this.rows === 1 && this.cols === 1;
}

export class Value {
  public readonly val: string[][];

  constructor(val: string[][]) {
    this.val = val;
  }

  public get(row: number, column: number): string {
    return this.val[row][column];
  }

  /**
   * getArity returns the dimensions of the contained value, in rows and columns
   */
  public getArity = (): Arity => {
    const maxCols = this.val.reduce<number>(
      (max: number, currentRow: string[]): number =>
        Math.max(max, currentRow.length),
      0,
    );
    return new Arity(this.val.length, maxCols);
  };
}

export interface ValueProvider {
  getValue(table: Table): Result<Value, Error>;
}

export class Formula {
  private readonly source: Source;
  private readonly destination: Destination;

  constructor(ast: IToken, table: Table) {
    this.destination = new Destination(ast.children[0], table);
    this.source = new Source(ast.children[1], table);
  }

  public merge = (table: Table): Result<Table, Error> => {
    const value = this.source.getValue(table);
    if (value.isErr()) {
      return err(value.error);
    }

    const valueArity = value.value.getArity();
    const destArity = this.destination.getArity(table);
    if (
      valueArity.rows !== destArity.rows ||
      valueArity.cols !== destArity.cols
    ) {
      console.log(`Destination arity: ${destArity.rows}, ${destArity.cols}`);
      console.log(`Value arity: ${valueArity.rows}, ${valueArity.cols}`);
      return err(new Error('Source and destination arity mismatch'));
    }

    return this.destination.merge(table, value.value);
  };
}

export class Source {
  private readonly locationDescriptor: ValueProvider;

  constructor(ast: IToken, table: Table) {
    if (ast.type !== 'source') {
      throw Error('Invalid AST token type of ' + ast.type);
    }
    if (ast.children.length !== 1) {
      throw Error('Unexpected children length in Source');
    }

    const paramChild = ast.children[0];
    const vp = newValueProvider(paramChild, table);
    if (vp.isErr()) {
      throw vp.error;
    }
    this.locationDescriptor = vp.value;
  }

  public getValue = (table: Table): Result<Value, Error> =>
    this.locationDescriptor.getValue(table);
}

export class Destination {
  private readonly locationDescriptor: Range;

  constructor(ast: IToken, table: Table) {
    if (ast.type !== 'destination') {
      throw Error('Invalid AST token type of ' + ast.type);
    }
    if (ast.children.length !== 1) {
      throw Error('Unexpected children length in Destination');
    }

    const child = ast.children[0];
    switch (ast.children[0].type) {
      case 'range':
        const r1 = newRange(child, table);
        if (r1.isErr()) {
          throw r1.error;
        }
        this.locationDescriptor = r1.value;
        break;
      case 'component':
        const r2 = newComponent(child, table);
        if (r2.isErr()) {
          throw r2.error;
        }
        this.locationDescriptor = r2.value;
        break;
      default:
        throw Error('Unrecognized destination type ' + child.type);
    }
  }

  /**
   * getArity returns the dimensions described by the destination, in rows and
   * columns. Unlike in a Value, a table object is required to resolve the
   * relative references and dimensions of rows/columns.
   */
  public getArity = (table: Table): Arity => this.locationDescriptor.getArity();

  /**
   * merge takes the provided values, and attempts to place them in the
   * location described by this Range in the provided table.
   */
  public readonly merge = (table: Table, value: Value): Result<Table, Error> =>
    this.locationDescriptor.merge(table, value);
}

const newValueProvider = (
  ast: IToken,
  table: Table,
): Result<ValueProvider, Error> => {
  // TODO: ValueProviders should make use of destination to handle implied arity

  try {
    switch (ast.type) {
      case 'range':
        return newRange(ast, table);
      case 'component':
        return newComponent(ast, table);
      case 'single_param_function_call':
        return ok(new SingleParamFunctionCall(ast, table));
      case 'conditional_function_call':
        return ok(new ConditionalFunctionCall(ast, table));
      case 'algebraic_operation':
        return ok(new AlgebraicOperation(ast, table));
      default:
        throw Error('Unrecognized valueProvider type ' + ast.type);
    }
  } catch (error) {
    return err(error);
  }
};

export const parseAndApply = (
  formulaLines: string[],
  table: Table,
): Result<Table, Error> => {
  // Parse each formula line, flattening the resulting lists of formulas into a
  // single list, but returning an error if any formula fails to parse.
  const formulas: Result<Formula[], Error> = formulaLines.reduce(
    (
      prev: Result<Formula[], Error>,
      formulaLine: string,
    ): Result<Formula[], Error> =>
      prev.andThen(
        (currentFormulas: Formula[]): Result<Formula[], Error> => {
          const newFormulas = parseFormula(formulaLine, table);
          if (newFormulas.isErr()) {
            return newFormulas;
          }

          return ok(concat(newFormulas.value, currentFormulas));
        },
      ),
    ok([]),
  );

  // If there is no error,
  return formulas.andThen((innerFormulas: Formula[]) =>
    // for each formula
    innerFormulas.reduce<Result<Table, Error>>(
      (prevValue, formula) =>
        // If the previous formula didn't give an error
        prevValue.andThen(
          (prevTable): Result<Table, Error> =>
            // attempt to apply this formula to the table and return the result
            formula.merge(prevTable),
        ),
      // Start with the current table state
      ok(table),
    ),
  );
};

/**
 * Parse the provided line, returning any found formulas. A single line may
 * contain zero or more formulas.
 *
 * @param line A line of the form `<!-- TBFM: {FORMULA}::{FORMULA} -->`
 */
export const parseFormula = (
  line: string,
  table: Table,
): Result<Formula[], Error> => {
  const parser = new Grammars.W3C.Parser(parserGrammar);
  const ast = parser.getAST(line);

  // TODO: Determine how to return errors when a formula-like string
  //       is not actually a valid formula.

  if (!ast) {
    return err(new Error(`Formula '${line}' could not be parsed`));
  }

  const typeError = checkType(ast, 'tblfm_line');
  if (typeError) {
    return err(typeError);
  }

  const lengthError = checkChildLength(ast, 1);
  if (lengthError) {
    return err(lengthError);
  }

  const formulas = ast.children[0].children;
  return ok(formulas.map((formula) => new Formula(formula, table)));
};

export const checkType = (
  ast: IToken,
  expectedType: string,
): Error | undefined => {
  if (ast.type === expectedType) {
    return;
  }

  return new Error(
    `Formula element '${ast.text}' is a ${ast.type} but expected ` +
      `a ${expectedType} in this position.`,
  );
};

export const checkChildLength = (
  ast: IToken,
  len: number,
): Error | undefined => {
  if (ast.children.length === len) {
    return;
  }

  return new Error(
    `Formula element '${ast.text}' was expected to have ${len} ` +
      `elements, but had ${ast.children.length}`,
  );
};

const prettyPrintAST = (token: IToken, level = 0): void => {
  console.log(
    '  '.repeat(level) +
      `|-${token.type}${token.children.length === 0 ? '=' + token.text : ''}`,
  );
  if (token.children) {
    token.children.forEach((c) => {
      prettyPrintAST(c, level + 1);
    });
  }
};
