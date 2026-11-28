import type { ReasonCode } from '@lab/shared';
import type { AuthorizationFailure } from './types.js';

/** One refusal for every surface: the code stays a `ReasonCode`, so the trace and the tests keep comparing codes. */
export interface AuthorizationRefusal {
  readonly code: ReasonCode;
  readonly status: number;
  readonly ruleId: string;
  readonly sentence: string;
}

/**
 * The single mapping from an authorization failure to what a person reads.
 * A grant that expired is refused like an invalid source, never called a
 * revocation: the two clocks are different by design.
 */
export function authorizationRefusal(reason: AuthorizationFailure): AuthorizationRefusal {
  switch (reason) {
    case 'AUTHORIZATION_REVOKED':
      return {
        code: 'KEY_REVOKED',
        status: 401,
        ruleId: 'WRITE.KEY_REVOKED',
        sentence: 'Nguồn quyền đã soạn đề xuất đã bị thu hồi nên cổng không ghi. Hãy xin người quản lý Lab cấp quyền mới.',
      };
    case 'AUTHORIZATION_EXPIRED':
      return {
        code: 'KEY_INVALID',
        status: 401,
        ruleId: 'WRITE.AUTHORIZATION_EXPIRED',
        sentence: 'Nguồn quyền đã soạn đề xuất đã hết hạn nên cổng không ghi. Hãy kết nối lại rồi nhờ AI soạn lại.',
      };
    case 'AUTHORIZATION_UNKNOWN':
      return {
        code: 'KEY_INVALID',
        status: 401,
        ruleId: 'WRITE.AUTHORIZATION_UNKNOWN',
        sentence: 'Đề xuất này không xác định được nguồn quyền nên cổng không ghi. Hãy nhờ AI soạn lại bằng một nguồn quyền hợp lệ.',
      };
    case 'AUTHORIZATION_INVALID':
      return {
        code: 'KEY_INVALID',
        status: 401,
        ruleId: 'WRITE.KEY_INVALID',
        sentence: 'Nguồn quyền đã soạn đề xuất không còn trong danh sách cấp quyền nên cổng không ghi. Hãy đăng nhập lại bằng nguồn quyền hợp lệ.',
      };
  }
}
