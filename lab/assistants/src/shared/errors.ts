/** A non-2xx answer from DeepSeek. The status is safe to keep; the body and key are not. */
export class ModelHttpError extends Error {
  constructor(readonly status: number) {
    super(`DeepSeek answered HTTP ${status}`);
    this.name = 'ModelHttpError';
  }
}

/** The model did not answer before the client's deadline. */
export class ModelTimeoutError extends Error {
  constructor() {
    super('DeepSeek did not answer before the deadline');
    this.name = 'ModelTimeoutError';
  }
}

/** The model endpoint could not be reached. */
export class ModelNetworkError extends Error {
  constructor() {
    super('DeepSeek could not be reached');
    this.name = 'ModelNetworkError';
  }
}

export type ConversationStage = 'model' | 'door';

/** A model or door failure with a short code that is safe to write to a result file. */
export class ConversationError extends Error {
  constructor(
    readonly stage: ConversationStage,
    readonly code: string,
    cause: unknown,
  ) {
    super(`${stage} failed`, { cause });
    this.name = 'ConversationError';
  }
}

/** Node's timer and fetch abort errors use these names, even when they are not `Error` instances. */
export function isTimeoutError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}

function httpCode(status: number): string {
  return `model_http_${Math.trunc(status)}`;
}

/** Map a model failure to a short code. The message never leaves this function. */
export function modelErrorCode(error: unknown): string {
  if (error instanceof ModelHttpError) return httpCode(error.status);
  if (error instanceof ModelTimeoutError) return 'model_timeout';
  if (error instanceof ModelNetworkError) return 'model_network';
  return 'model_error';
}

/** Map whatever reached the command to the code the sample keeps. */
export function runErrorCode(error: unknown): string {
  if (error instanceof ConversationError) return error.code;
  if (error instanceof ModelHttpError) return httpCode(error.status);
  if (error instanceof ModelTimeoutError) return 'model_timeout';
  if (error instanceof ModelNetworkError) return 'model_network';
  return 'run_error';
}
