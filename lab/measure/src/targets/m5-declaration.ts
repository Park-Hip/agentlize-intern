import type { WriteTarget } from './types.js';

/**
 * The M5 declaration of one write target. Each target adds
 * `src/targets/<name>-declaration.ts`, default-exports this shape, and the
 * `m5-complexity` scenario loads it by the `--target` name. There is no
 * registry to edit: a second target, such as the Temporal baseline, comes with
 * its own declaration file and nothing in the scenario changes.
 *
 * A declaration is a claim, so every count carries a source. The scenario
 * opens each cited file and line before it writes a result; a stale line stops
 * the run instead of becoming evidence.
 */

/** A repo-relative file and a 1-based line that shows the declared fact. */
export interface SourceRef {
  readonly path: string;
  readonly line: number;
}

/** The link a report can print for a source, for example `lab/README.md#L18`. */
export function sourceLink(source: SourceRef): string {
  return `${source.path}#L${source.line}`;
}

/** One file of the continuation path, whose lines the scenario counts. */
export interface ContinuationFile {
  readonly path: string;
  readonly role: string;
}

/** A file near the path that is deliberately not counted, with the reason. */
export interface ExcludedFile {
  readonly path: string;
  readonly reason: string;
}

/** One service the documented start command opens. */
export interface ServiceDeclaration {
  readonly name: string;
  readonly purpose: string;
  /** True when the write path itself needs this service, not only the operator UI. */
  readonly required_for_writes: boolean;
  readonly source: SourceRef;
}

/**
 * One config file. A config file is a file a person edits to change how the
 * path behaves at run time; package manifests and build configs do not count.
 */
export interface ConfigFileDeclaration {
  readonly path: string;
  readonly purpose: string;
  readonly source: SourceRef;
}

/** One step a person does on a fresh machine, or after a crash. */
export interface StepDeclaration {
  readonly step: string;
  readonly source: SourceRef;
}

/** The status and reason code of one draft answer. The text is not kept. */
export interface AnswerSummary {
  readonly status: number;
  readonly reason_code: string | null;
}

/** What the "change one rule" probe saw. */
export interface RuleChangeApplication {
  /** The cell value before the edit, read from the live rule file. */
  readonly before: string;
  /** The value the probe wrote. */
  readonly after: string;
  /** Live files the probe changed, by file name; the data folder is temporary. */
  readonly changed_files: readonly string[];
  /** True only when the path answered with the new rule. */
  readonly applied: boolean;
  readonly before_answer: AnswerSummary;
  readonly after_answer: AnswerSummary;
  /** The rule id the trace recorded for the refused call, `<type>.<action>.<role>`. */
  readonly rule_id: string | null;
}

/** One rule cell and the probe that changes it in this target's live rule file. */
export interface RuleChangeProbe {
  /** The repo-relative rule file whose live copy the probe edits. */
  readonly file: string;
  /** Dotted path of the one cell the probe edits. */
  readonly cell: string;
  readonly before: string;
  readonly after: string;
  /** A line that says the path reads the rule again on every decision. */
  readonly source: SourceRef;
  apply(target: WriteTarget): Promise<RuleChangeApplication>;
}

export interface M5Declaration {
  /** Must equal the target name in `TARGET_NAMES`. */
  readonly target: string;
  readonly continuation_files: readonly ContinuationFile[];
  readonly excluded_files: readonly ExcludedFile[];
  readonly services: readonly ServiceDeclaration[];
  readonly config_files: readonly ConfigFileDeclaration[];
  readonly install_steps: readonly StepDeclaration[];
  readonly crash_steps: readonly StepDeclaration[];
  /**
   * Folders hashed before and after the rule edit. A change outside the live
   * rule file shows here, so "one place" is measured, not asserted.
   */
  readonly source_roots: readonly string[];
  readonly rule_change: RuleChangeProbe;
}
