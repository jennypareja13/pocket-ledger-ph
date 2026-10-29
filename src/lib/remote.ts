import { supabase } from "@/integrations/supabase/client";
import type { PushResult, Remote, RemoteRow } from "./sync-engine";

export const cloudRemote: Remote = {
  async push(r) {
    const { data, error } = await supabase.rpc("push_record", {
      p_id: r.id,
      p_kind: r.kind,
      p_space_id: r.space_id as string,
      p_data: r.data as never,
      p_deleted: r.deleted,
      p_base_rev: r._meta.rev,
      p_mutation_id: r._meta.mutation_id,
    });
    if (error) throw new Error(error.message);
    return data as unknown as PushResult;
  },
  async pull(since) {
    const out: RemoteRow[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      let q = supabase
        .from("ledger_records")
        .select("id,kind,space_id,data,deleted,rev,last_mutation_id,created_at,updated_at")
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + page - 1);
      if (since) q = q.gte("updated_at", since);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      out.push(...(data as unknown as RemoteRow[]));
      if (!data || data.length < page) break;
    }
    return out;
  },
};
