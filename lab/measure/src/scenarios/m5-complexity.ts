import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { safetyCounter } from '../safety.js';
import { roundMs } from '../stats.js';
import { createTarget, type TargetName } from '../targets/index.js';
import { sourceLink, type M5Declaration, type SourceRef } from '../targets/m5-declaration.js';
import type { MeasureContext, SafetyCounter, Sample, Scenario, ScenarioResult } from '../types.js';

/** From `lab/measure/src/scenarios` or `lab/measure/dist/scenarios` to the repo root. */
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', 'dist', '.data', '.git']);
/** The initial M5 goal: changing one permission rule edits one place. */
const TARGET_PLACES = 1;
/** The outbox numbers published on 2026-11-19, kept as a cross-check of the classifier. */
const PUBLISHED_OUTBOX = { physical: 319, code: 267 } as const;

interface LineBuckets {
  readonly physical: number;
  readonly code: number;
  readonly comment: number;
  readonly blank: number;
}

interface CountedFile extends LineBuckets {
  readonly path: string;
  readonly role: string;
}

interface RuleCheck {
  readonly before: string;
  readonly after: string;
  readonly applied: boolean;
  readonly rule_id: string | null;
  readonly before_answer: { readonly status: number; readonly reason_code: string | null };
  readonly after_answer: { readonly status: number; readonly reason_code: string | null };
  readonly changed_files: readonly string[];
  readonly source_files: number;
  readonly source_changes: readonly string[];
  readonly places_changed: number;
  readonly met: boolean;
  readonly write_commands: number;
  readonly trace_rows: number;
  readonly trace_hits: number;
  readonly elapsed_ms: number;
}

/**
 * Physical, code, comment and blank lines. A line with code and a trailing
 * comment counts as code; a blank line inside a block comment counts as blank.
 * On `lab/gateway/src/writes/outbox.ts` this gives 319/267/29/23, the numbers
 * published on 2026-11-19, so the bucket boundaries are the accepted ones.
 */
export function countLines(source: string): LineBuckets {
  const lines = source.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  let inBlock = false;
  let code = 0;
  let comment = 0;
  let blank = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed === '') {
        blank += 1;
        continue;
      }
      const end = trimmed.indexOf('*/');
      if (end === -1) {
        comment += 1;
        continue;
      }
      inBlock = false;
      if (trimmed.slice(end + 2).trim() === '') comment += 1;
      else code += 1;
      continue;
    }

    if (trimmed === '') {
      blank += 1;
      continue;
    }
    if (trimmed.startsWith('//')) {
      comment += 1;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      const end = trimmed.indexOf('*/', 2);
      if (end === -1) {
        inBlock = true;
        comment += 1;
      } else if (trimmed.slice(end + 2).trim() === '') {
        comment += 1;
      } else {
        code += 1;
      }
      continue;
    }

    const start = line.indexOf('/*');
    if (start !== -1 && line.indexOf('*/', start + 2) === -1) inBlock = true;
    code += 1;
  }

  const physical = lines.length;
  if (physical !== code + comment + blank) {
    throw new Error(`line buckets do not add up: ${physical} physical, ${code} code, ${comment} comment, ${blank} blank`);
  }
  return { physical, code, comment, blank };
}

/** Load the target's own declaration. A missing file names the convention to follow. */
async function loadDeclaration(target: TargetName): Promise<M5Declaration> {
  let loaded: { default?: unknown };
  try {
    loaded = (await import(`../targets/${target}-declaration.js`)) as { default?: unknown };
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : '';
    throw new Error(
      `target ${target} has no M5 declaration; add src/targets/${target}-declaration.ts and default-export M5Declaration${detail}`,
      { cause },
    );
  }
  const declaration = loaded.default as M5Declaration | undefined;
  if (declaration === undefined || declaration.target !== target) {
    throw new Error(
      `target ${target} must default-export an M5Declaration whose target is "${target}" from src/targets/${target}-declaration.ts`,
    );
  }
  if (declaration.continuation_files.length === 0) {
    throw new Error(`the declaration for ${target} names no continuation file`);
  }
  return declaration;
}

async function checkSource(source: SourceRef): Promise<void> {
  const text = await readFile(join(REPO_ROOT, source.path), 'utf8');
  const lines = text.split(/\r?\n/);
  if (!Number.isInteger(source.line) || source.line < 1 || source.line > lines.length) {
    throw new Error(
      `${source.path} has ${lines.length} lines, but the declaration cites line ${source.line}; fix the declaration before measuring`,
    );
  }
}

function cited(source: SourceRef): SourceRef & { readonly link: string } {
  return { path: source.path, line: source.line, link: sourceLink(source) };
}

async function countContinuationFiles(
  declaration: M5Declaration,
): Promise<{ files: CountedFile[]; samples: Sample[] }> {
  const files: CountedFile[] = [];
  const samples: Sample[] = [];

  for (const file of declaration.continuation_files) {
    const startedAt = performance.now();
    const text = await readFile(join(REPO_ROOT, file.path), 'utf8');
    if (text.length === 0) throw new Error(`${file.path} is empty`);
    const buckets = countLines(text);
    const elapsed = roundMs(performance.now() - startedAt);
    files.push({ path: file.path, role: file.role, ...buckets });
    samples.push({
      door: 'm5-lines',
      tool: file.path,
      run: 1,
      client_ms: elapsed,
      gateway_duration_ms: null,
      trace_id: null,
      status: 200,
      reason_code: null,
    });
  }

  return { files, samples };
}

function totalOf(files: readonly CountedFile[]): LineBuckets {
  return files.reduce<LineBuckets>(
    (total, file) => ({
      physical: total.physical + file.physical,
      code: total.code + file.code,
      comment: total.comment + file.comment,
      blank: total.blank + file.blank,
    }),
    { physical: 0, code: 0, comment: 0, blank: 0 },
  );
}

async function walk(dir: string, files: Map<string, string>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(join(dir, entry.name), files);
      continue;
    }
    if (!entry.isFile()) continue;
    const full = join(dir, entry.name);
    const key = relative(REPO_ROOT, full).split(sep).join('/');
    files.set(key, createHash('sha256').update(await readFile(full)).digest('hex'));
  }
}

async function hashTree(roots: readonly string[]): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const root of roots) await walk(join(REPO_ROOT, root), files);
  return files;
}

function changesBetween(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): string[] {
  const changed: string[] = [];
  for (const [path, hash] of before) {
    if (after.get(path) !== hash) changed.push(path);
  }
  for (const path of after.keys()) {
    if (!before.has(path)) changed.push(path);
  }
  return changed.sort();
}

/**
 * Build the target, draft once under the old rule, flip one cell in the live
 * rule file, and draft again. The source tree is hashed before and after, so a
 * hidden edit outside the rule file would show up as a second place.
 */
async function checkOneRule(declaration: M5Declaration, target: TargetName): Promise<RuleCheck> {
  const probe = createTarget(target);
  const startedAt = performance.now();
  try {
    await probe.build();
    const sourceBefore = await hashTree(declaration.source_roots);
    const application = await declaration.rule_change.apply(probe);
    const observation = probe.observe();
    const scan = probe.scanTrace();
    const sourceAfter = await hashTree(declaration.source_roots);
    const sourceChanges = changesBetween(sourceBefore, sourceAfter);
    const changed = [...new Set([...application.changed_files, ...sourceChanges])].sort();
    const applied =
      application.before === declaration.rule_change.before &&
      application.after === declaration.rule_change.after &&
      application.applied;

    return {
      before: application.before,
      after: application.after,
      applied,
      rule_id: application.rule_id,
      before_answer: application.before_answer,
      after_answer: application.after_answer,
      changed_files: changed,
      source_files: sourceBefore.size,
      source_changes: sourceChanges,
      places_changed: changed.length,
      met: applied && changed.length === TARGET_PLACES,
      write_commands: observation.writeCommands,
      trace_rows: scan.rows,
      trace_hits: scan.hits,
      elapsed_ms: roundMs(performance.now() - startedAt),
    };
  } finally {
    await probe.close();
  }
}

const scenario: Scenario = {
  name: 'm5-complexity',
  description:
    'M5: đếm dòng phần chạy tiếp, số dịch vụ, số file cấu hình, số bước cài và bước xử lý khi sập của đích, rồi đổi một ô luật xem cổng có áp ngay không; đích chọn bằng --target, mặc định gateway.',
  needs: { stack: false, target: true },

  async run(context: MeasureContext): Promise<ScenarioResult> {
    const target = context.target;
    if (target === null) throw new Error('m5-complexity needs a write target');

    const declarationStarted = performance.now();
    const declaration = await loadDeclaration(target);

    for (const file of declaration.excluded_files) {
      await readFile(join(REPO_ROOT, file.path), 'utf8');
    }
    for (const service of declaration.services) await checkSource(service.source);
    for (const file of declaration.config_files) await checkSource(file.source);
    for (const step of declaration.install_steps) await checkSource(step.source);
    for (const step of declaration.crash_steps) await checkSource(step.source);
    await checkSource(declaration.rule_change.source);

    const sources = [
      ...declaration.services.map((service) => cited(service.source)),
      ...declaration.config_files.map((file) => cited(file.source)),
      ...declaration.install_steps.map((step) => cited(step.source)),
      ...declaration.crash_steps.map((step) => cited(step.source)),
      cited(declaration.rule_change.source),
    ];
    const declarationMs = roundMs(performance.now() - declarationStarted);

    const counted = await countContinuationFiles(declaration);
    const totals = totalOf(counted.files);

    const rule = await checkOneRule(declaration, target);

    const samples: Sample[] = [
      ...counted.samples,
      {
        door: 'm5-declaration',
        tool: target,
        run: 1,
        client_ms: declarationMs,
        gateway_duration_ms: null,
        trace_id: null,
        status: 200,
        reason_code: null,
      },
      {
        door: 'm5-rule',
        tool: target,
        run: 1,
        client_ms: rule.elapsed_ms,
        gateway_duration_ms: null,
        trace_id: null,
        status: rule.met ? 200 : 500,
        reason_code: rule.met ? 'RULE_APPLIED' : rule.applied ? 'MULTIPLE_PLACES' : 'RULE_NOT_APPLIED',
      },
    ];

    const counters: SafetyCounter[] = [
      safetyCounter(
        'duplicate_writes',
        false,
        null,
        'Phép đo chỉ soạn đề xuất để hỏi luật, không bấm Gửi nên không có lệnh ghi nào để ghi trùng.',
      ),
      safetyCounter(
        'lost_commands',
        false,
        null,
        'Phép đo không bấm Gửi nên không tạo lệnh ghi; không có lệnh nào có thể mất.',
      ),
      safetyCounter(
        'unauthorized_writes',
        true,
        rule.write_commands,
        `Đếm lệnh ghi trong bảng write_commands sau hai lần soạn đề xuất; phải bằng 0 vì không lần nào bấm Gửi, thấy ${rule.write_commands}.`,
      ),
      safetyCounter(
        'out_of_scope_fields',
        false,
        null,
        'Phép đo không gọi tool đọc bản ghi nhân viên hay task; chỉ đọc mã trạng thái của đề xuất.',
      ),
      safetyCounter(
        'personal_data_in_trace',
        true,
        rule.trace_hits,
        `Đã quét ${rule.trace_rows} dòng vết cho tên, email, số điện thoại, địa chỉ và khoá; ${rule.trace_hits} dòng chứa.`,
      ),
    ];

    const requiredServices = declaration.services.filter((service) => service.required_for_writes);
    const outbox = counted.files.find((file) => file.path.endsWith('/writes/outbox.ts'));
    const outboxMatches =
      outbox !== undefined &&
      outbox.physical === PUBLISHED_OUTBOX.physical &&
      outbox.code === PUBLISHED_OUTBOX.code;
    const outboxNote =
      outbox === undefined
        ? 'Khai báo không có outbox.ts, nên không đối chiếu được với số 319 dòng vật lý và 267 dòng mã đã công bố ngày 2026-11-19.'
        : `outbox.ts ra ${outbox.physical} dòng vật lý, ${outbox.code} dòng mã, ${outbox.comment} dòng chú thích và ${outbox.blank} dòng trắng; ${outboxMatches ? 'khớp' : 'khác'} số 319/267 đã công bố ngày 2026-11-19.`;

    return {
      samples,
      safety: counters,
      parameters: {
        target,
        declaration_file: `lab/measure/src/targets/${target}-declaration.ts`,
        runs_requested: context.runs,
        runs_used: 1,
        line_counts: {
          files: counted.files,
          total: totals,
        },
        services: {
          count: declaration.services.length,
          write_path_count: requiredServices.length,
          items: declaration.services.map((service) => ({
            name: service.name,
            purpose: service.purpose,
            required_for_writes: service.required_for_writes,
            source: cited(service.source),
          })),
        },
        config_files: {
          count: declaration.config_files.length,
          items: declaration.config_files.map((file) => ({
            path: file.path,
            purpose: file.purpose,
            source: cited(file.source),
          })),
        },
        install_steps: {
          count: declaration.install_steps.length,
          items: declaration.install_steps.map((step) => ({ step: step.step, source: cited(step.source) })),
        },
        crash_steps: {
          count: declaration.crash_steps.length,
          items: declaration.crash_steps.map((step) => ({ step: step.step, source: cited(step.source) })),
        },
        excluded_files: declaration.excluded_files,
        sources_checked: { count: sources.length, items: sources },
        rule_change: {
          file: declaration.rule_change.file,
          cell: declaration.rule_change.cell,
          source: cited(declaration.rule_change.source),
          before: rule.before,
          after: rule.after,
          applied: rule.applied,
          rule_id: rule.rule_id,
          before_answer: rule.before_answer,
          after_answer: rule.after_answer,
          changed_files: rule.changed_files,
          source_tree: { files: rule.source_files, changes: rule.source_changes },
          places_changed: rule.places_changed,
          target_places: TARGET_PLACES,
          met: rule.met,
        },
      },
      notes: [
        `M5 đếm phần chạy tiếp của đích ${target}, không đếm cả cổng: ${counted.files.length} file, ${totals.physical} dòng vật lý và ${totals.code} dòng mã.`,
        outboxNote,
        `Lệnh npm start mở ${declaration.services.length} dịch vụ; ${requiredServices.length} dịch vụ cần cho đường ghi, còn lại là trang điều khiển.`,
        `Có ${declaration.config_files.length} file cấu hình theo định nghĩa: file người vận hành sửa để đổi hành vi lúc chạy. package.json và tsconfig.json là file dựng mã, không tính.`,
        `Cài trên máy mới: ${declaration.install_steps.length} bước; sau khi sập: ${declaration.crash_steps.length} bước, vì vòng chạy nền tự nhặt lệnh còn mở.`,
        `Đổi một ô luật ${declaration.rule_change.cell} từ ${rule.before} sang ${rule.after}: ${rule.places_changed} chỗ đổi, mục tiêu ${TARGET_PLACES} chỗ, ${rule.met ? 'đạt' : 'chưa đạt'}; cổng ${rule.applied ? 'áp luật mới' : 'không áp luật mới'}.`,
        `M5 là phép đếm tĩnh: --runs ${context.runs} không lặp phép đếm, một lần chạy là đủ và runs_used bằng 1. Thời gian trong mẫu là thời gian đọc file và kiểm luật, không phải độ trễ dịch vụ.`,
        'Kết quả chỉ đo đường ghi cục bộ, không gồm bước cắm skill vào Thổ Thần hay mở đường hầm.',
      ],
    };
  },
};

export default scenario;
