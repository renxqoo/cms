'use client';

import { useEffect, useRef, useState } from 'react';
import { requestApi } from '../../../api/client';
import type { ApiResult } from '../../../api/result';
import type { ApiFailure } from '../../management-shared/read-all-pages';
import { previewTicketSchema, previewRevocationSchema } from './contracts';
import type { PreviewTicket, PreviewTarget } from './contracts';
interface PreviewState {
  ticket: PreviewTicket | null;
  failure: ApiFailure | null;
  pending: boolean;
  expired: boolean;
}
const initialState: PreviewState = { ticket: null, failure: null, pending: false, expired: false };
function issueTicket(target: PreviewTarget, signal: AbortSignal) {
  return requestApi({
    operation: 'documents.createPreviewTicket',
    params: { collection: target.collection, id: target.id },
    body: { locale: target.locale, expectedRevision: target.revision },
    response: previewTicketSchema,
    signal,
  });
}
function revokeTicket(target: PreviewTarget, ticket: PreviewTicket, signal: AbortSignal) {
  return requestApi({
    operation: 'documents.revokePreviewTicket',
    params: { collection: target.collection, id: target.id, ticketId: ticket.ticketId },
    response: previewRevocationSchema,
    signal,
  });
}
export function useContentPreview(
  target: PreviewTarget,
  report: (result: ApiResult<unknown>) => void,
) {
  const [state, setState] = useState(initialState);
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => current.current?.abort(), []);
  useEffect(() => {
    if (!state.ticket) return () => {};
    const timer = setTimeout(
      () => setState((value) => ({ ...value, expired: true })),
      Math.max(0, Date.parse(state.ticket.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [state.ticket]);
  async function issue() {
    if (current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setState({ ...initialState, pending: true });
    const result = await issueTicket(target, controller.signal);
    if (controller.signal.aborted) return;
    report(result);
    setState(
      result.ok ? { ...initialState, ticket: result.data } : { ...initialState, failure: result },
    );
    current.current = null;
  }
  async function revoke() {
    if (!state.ticket || current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setState((value) => ({ ...value, failure: null, pending: true }));
    const result = await revokeTicket(target, state.ticket, controller.signal);
    if (controller.signal.aborted) return;
    report(result);
    setState((value) => (result.ok ? initialState : { ...value, pending: false, failure: result }));
    current.current = null;
  }
  return { ...state, issue, revoke };
}
