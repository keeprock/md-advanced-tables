import { expect } from "chai";

import { Alignment } from "../lib/alignment";
import { Table } from "../lib/table.js";
import { readTable } from "../lib/parser.js";
import {
  _delimiterText,
  _extendArray,
  completeTable,
  _computeTextWidth,
  _alignText
} from "../lib/formatter.js";

/**
 * @test {_delimiterText}
 */
describe("_delimiterText(width, alignment)", () => {
  it("should return a delimiter text for the specified alignment", () => {
    expect(_delimiterText(5, Alignment.DEFAULT)).to.equal(" ----- ");
    expect(_delimiterText(5, Alignment.LEFT)).to.equal(":----- ");
    expect(_delimiterText(5, Alignment.RIGHT)).to.equal(" -----:");
    expect(_delimiterText(5, Alignment.CENTER)).to.equal(":-----:");
  });

  it("should throw an error if the alignment is unknown", () => {
    expect(() => { _delimiterText(5, "top"); }).to.throw(Error, /unknown/i);
  });
});

/**
 * @test {_extendArray}
 */
describe("_extendArray(arr, size, callback)", () => {
  it("should create a new array that is extended to the specified size, filling empty elements by return values of the callback", () => {
    expect(_extendArray([], 2, i => i)).to.deep.equal([0, 1]);
    expect(_extendArray([0, 1], 4, i => i)).to.deep.equal([0, 1, 2, 3]);
    expect(_extendArray([0, 1, 2, 3], 2, i => i)).to.deep.equal([0, 1, 2, 3]);
  });
});

/**
 * @test {completeTable}
 */
describe("completeTable(table, options)", () => {
  it("should complete the given table by adding missing delimiter and cells", () => {
    {
      const tableText =
          "| A | B |\n"
        + "| --- |:----- |\n"
        + "  | C | D |  ";
      const expectText =
          "| A | B |\n"
        + "| --- |:----- |\n"
        + "  | C | D |  ";
      const table = readTable(tableText.split("\n"));
      const completed = completeTable(table, { delimiterWidth: 3 });
      expect(completed).to.be.an("object");
      expect(completed.table).to.be.an.instanceOf(Table);
      expect(completed.table.toText()).to.equal(expectText);
      expect(completed.delimiterInserted).to.be.false;
    }
    {
      const tableText =
          "| A |\n"
        + "| --- |:----- |\n"
        + "  | C | D |  ";
      const expectText =
          "| A ||\n"
        + "| --- |:----- |\n"
        + "  | C | D |  ";
      const table = readTable(tableText.split("\n"));
      const completed = completeTable(table, { delimiterWidth: 3 });
      expect(completed).to.be.an("object");
      expect(completed.table).to.be.an.instanceOf(Table);
      expect(completed.table.toText()).to.equal(expectText);
      expect(completed.delimiterInserted).to.be.false;
    }
    {
      const tableText =
          "| A | B |\n"
        + "| --- |\n"
        + "  | C | D |  ";
      const expectText =
          "| A | B |\n"
        + "| --- | --- |\n"
        + "  | C | D |  ";
      const table = readTable(tableText.split("\n"));
      const completed = completeTable(table, { delimiterWidth: 3 });
      expect(completed).to.be.an("object");
      expect(completed.table).to.be.an.instanceOf(Table);
      expect(completed.table.toText()).to.equal(expectText);
      expect(completed.delimiterInserted).to.be.false;
    }
    {
      const tableText =
          "| A | B |\n"
        + "  | C | D |  ";
      const expectText =
          "| A | B |\n"
        + "| --- | --- |\n"
        + "  | C | D |  ";
      const table = readTable(tableText.split("\n"));
      const completed = completeTable(table, { delimiterWidth: 3 });
      expect(completed).to.be.an("object");
      expect(completed.table).to.be.an.instanceOf(Table);
      expect(completed.table.toText()).to.equal(expectText);
      expect(completed.delimiterInserted).to.be.true;
    }
    {
      const tableText =
          "| A | B |\n"
        + "| --- |:----- |\n"
        + "  | C |";
      const expectText =
          "| A | B |\n"
        + "| --- |:----- |\n"
        + "  | C ||";
      const table = readTable(tableText.split("\n"));
      const completed = completeTable(table, { delimiterWidth: 3 });
      expect(completed).to.be.an("object");
      expect(completed.table).to.be.an.instanceOf(Table);
      expect(completed.table.toText()).to.equal(expectText);
      expect(completed.delimiterInserted).to.be.false;
    }
    {
      const tableText =
          "| A | B |\n"
        + "| --- |:----- |\n"
        + "  | C |  ";
      const expectText =
          "| A | B |\n"
        + "| --- |:----- |\n"
        + "  | C |  |";
      const table = readTable(tableText.split("\n"));
      const completed = completeTable(table, { delimiterWidth: 3 });
      expect(completed).to.be.an("object");
      expect(completed.table).to.be.an.instanceOf(Table);
      expect(completed.table.toText()).to.equal(expectText);
      expect(completed.delimiterInserted).to.be.false;
    }
    {
      const tableText =
          "|\n"
        + "|\n"
        + " |  ";
      const expectText =
          "||\n"
        + "| --- |\n"
        + "||\n"
        + " |  |";
      const table = readTable(tableText.split("\n"));
      const completed = completeTable(table, { delimiterWidth: 3 });
      expect(completed).to.be.an("object");
      expect(completed.table).to.be.an.instanceOf(Table);
      expect(completed.table.toText()).to.equal(expectText);
      expect(completed.delimiterInserted).to.be.true;
    }
  });

  it("should throw an error if table has no rows", () => {
    const table = new Table([]);
    expect(() => { completeTable(table,  { delimiterWidth: 3 }); }).to.throw(Error, /empty/i);
  });
});

/**
 * @test {_computeTextWidth}
 */
describe("_computeTextWidth(text, options)", () => {
  it("should compute the width of a text based on EAW properties", () => {
    {
      const options = {
        normalize      : false,
        wideChars      : new Set(),
        narrowChars    : new Set(),
        ambiguousAsWide: false
      };
      expect(_computeTextWidth("ℵAあＡｱ∀", options)).to.equal(8);
      expect(_computeTextWidth("\u0065\u0301", options)).to.equal(2);
    }
    {
      const options = {
        normalize      : false,
        wideChars      : new Set(),
        narrowChars    : new Set(),
        ambiguousAsWide: true
      };
      expect(_computeTextWidth("ℵAあＡｱ∀", options)).to.equal(9);
    }
    {
      const options = {
        normalize      : false,
        wideChars      : new Set(["∀"]),
        narrowChars    : new Set(),
        ambiguousAsWide: false
      };
      expect(_computeTextWidth("ℵAあＡｱ∀", options)).to.equal(9);
    }
    {
      const options = {
        normalize      : false,
        wideChars      : new Set(),
        narrowChars    : new Set(["∀"]),
        ambiguousAsWide: true
      };
      expect(_computeTextWidth("ℵAあＡｱ∀", options)).to.equal(8);
    }
    {
      const options = {
        normalize      : true,
        wideChars      : new Set(),
        narrowChars    : new Set(),
        ambiguousAsWide: false
      };
      expect(_computeTextWidth("\u0065\u0301", options)).to.equal(1);
    }
  });
});

/**
 * @test {_alignText}
 */
describe("_alignText(text, width, alignment, options)", () => {
  it("should align the text", () => {
    {
      const options = {
        normalize      : false,
        wideChars      : new Set(),
        narrowChars    : new Set(),
        ambiguousAsWide: false
      };
      expect(_alignText("foo", 5, Alignment.LEFT, options)).to.equal("foo  ");
      expect(_alignText("foo", 5, Alignment.RIGHT, options)).to.equal("  foo");
      expect(_alignText("foo", 5, Alignment.CENTER, options)).to.equal(" foo ");

      expect(_alignText("foobar", 5, Alignment.LEFT, options)).to.equal("foobar");
      expect(_alignText("foobar", 5, Alignment.RIGHT, options)).to.equal("foobar");
      expect(_alignText("foobar", 5, Alignment.CENTER, options)).to.equal("foobar");

      expect(_alignText("∀", 5, Alignment.LEFT, options)).to.equal("∀    ");
      expect(_alignText("\u0065\u0301", 5, Alignment.LEFT, options)).to.equal("\u0065\u0301   ");
    }
    {
      const options = {
        normalize      : false,
        wideChars      : new Set(),
        narrowChars    : new Set(),
        ambiguousAsWide: false
      };
      expect(_alignText("foo", 7, Alignment.LEFT, options)).to.equal("foo    ");
      expect(_alignText("foo", 7, Alignment.RIGHT, options)).to.equal("    foo");
      expect(_alignText("foo", 7, Alignment.CENTER, options)).to.equal("  foo  ");
    }
    {
      const options = {
        normalize      : false,
        wideChars      : new Set(),
        narrowChars    : new Set(),
        ambiguousAsWide: true
      };
      expect(_alignText("∀", 5, Alignment.LEFT, options)).to.equal("∀   ");
    }
    {
      const options = {
        normalize      : false,
        wideChars      : new Set("∀"),
        narrowChars    : new Set(),
        ambiguousAsWide: false
      };
      expect(_alignText("∀", 5, Alignment.LEFT, options)).to.equal("∀   ");
    }
    {
      const options = {
        normalize      : false,
        wideChars      : new Set(),
        narrowChars    : new Set("∀"),
        ambiguousAsWide: true
      };
      expect(_alignText("∀", 5, Alignment.LEFT, options)).to.equal("∀    ");
    }
    {
      const options = {
        normalize      : true,
        wideChars      : new Set(),
        narrowChars    : new Set(),
        ambiguousAsWide: false
      };
      expect(_alignText("\u0065\u0301", 5, Alignment.LEFT, options)).to.equal("\u0065\u0301    ");
    }
  });

  it("should throw an error if the alignment is unknown", () => {
    const options = {
      normalize      : false,
      wideChars      : new Set(),
      narrowChars    : new Set(),
      ambiguousAsWide: false
    };
    expect(() => { _alignText("foo", 5, "top", options); }).to.throw(Error, /unknown/i);
  });

  it("should throw an error if default alignment is specified", () => {
    const options = {
      normalize      : false,
      wideChars      : new Set(),
      narrowChars    : new Set(),
      ambiguousAsWide: false
    };
    expect(() => { _alignText("foo", 5, Alignment.DEFAULT, options); }).to.throw(Error, /unexpected/i);
  });
});
