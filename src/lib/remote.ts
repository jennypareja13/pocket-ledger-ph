import { supabase } from "@/integrations/supabase/client";
import { RecordRejected, SyncAbort, type PushResult, type Remote, type RemoteRow, type SyncContext } from "./sync-engine";

export function classifyRemoteError(error: { message: string; code?: string | undefined; status?: number | undefined }, status?: number): Error {
  const httpStatus = status ?? error.status;
  if (httpStatus === 401 || error.code === "PGRST301" || error.code === "PGRST302" || /jwt|auth/i.test(error.message)) return new SyncAbort(error.message, error.code, httpStatus);
  if (httpStatus !== undefined && (httpStatus >= 500 || httpStatus === 408 || httpStatus === 429)) return Object.assign(new Error(error.message), { code: error.code, status: httpStatus });
  if (error.code && !/^\d+$/.test(error.code)) return new RecordRejected(error.message, error.code, httpStatus);
  return Object.assign(new Error(error.message), { code: error.code, status: httpStatus });
}

async function assertUser(userId: string): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== userId) throw new SyncAbort("Sync stopped: the signed-in account is missing or changed.");
}
async function checkContext(ctx?: SyncContext) {
  if (!ctx) return;
  if (ctx.signal.aborted) throw new SyncAbort("Sync was cancelled.");
  await assertUser(ctx.userId);
  if (ctx.signal.aborted) throw new SyncAbort("Sync was cancelled.");
}

export const cloudRemote: Remote = {
  assertUser,
  async push(r) {
    const { data, error, status } = await supabase.rpc("push_record", {
      p_id: r.id, p_kind: r.kind, p_space_id: r.space_id as string,
      p_data: r.data as never, p_deleted: r.deleted, p_base_rev: r._meta.rev, p_mutation_id: r._meta.mutation_id,
    });
    if (error) throw classifyRemoteError(error, status);
    return data as unknown as PushResult;
  },
  async pull(since, ctx) {
    const out: RemoteRow[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      await checkContext(ctx);
      let q = supabase.from("ledger_records")
        .select("id,kind,space_id,data,deleted,rev,last_mutation_id,created_at,updated_at")
        .order("updated_at", { ascending: true }).order("id", { ascending: true }).range(from, from + page - 1);
      if (since) q = q.gte("updated_at", since);
      const { data, error, status } = await q;
      await checkContext(ctx);
      if (error) throw classifyRemoteError(error, status);
      out.push(...(data as unknown as RemoteRow[]));
      if (!data || data.length < page) break;
    }
    return out;
  },
};
