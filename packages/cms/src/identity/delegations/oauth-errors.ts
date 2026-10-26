import { CmsError } from '@new-cms/cms/platform/contracts';

export type OAuthErrorCode =
  | 'unauthorized_client'
  | 'unsupported_response_type'
  | 'invalid_token'
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'invalid_target'
  | 'temporarily_unavailable';

export class OAuthError extends CmsError {
  readonly oauthError: OAuthErrorCode;
  readonly oauthStatus: number;

  constructor(error: OAuthErrorCode, status = 400) {
    super(status === 401 ? 'unauthenticated' : 'invalid_input');
    this.oauthError = error;
    this.oauthStatus = status;
  }
}
