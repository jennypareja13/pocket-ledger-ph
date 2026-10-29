import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { Field, PageHeader, Panel, Select } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_NAME } from "@/lib/config";
import { createSpace } from "@/lib/actions";
import { formatPHP } from "@/lib/money";
import { spaceCash } from "@/lib/selectors";
import type { CategoryData, CategoryType, SpaceData, SpaceType } from "@/lib/types";

export const Route = createFileRoute("/_shell/spaces")({
  head: () => ({ meta: [
    { title: `Spaces & categories — ${APP_NAME}` }, { name: "description", content: "Separate personal money from sinking and managed funds." },
    { property: "og:title", content: `Spaces — ${APP_NAME}` }, { property: "og:description", content: "Separate personal money from managed funds." },
  ] }),
  component: Spaces,
});

function Spaces() {
  const { store, snap, setSpaceId } = useApp();
  const { spaceId, categories } = useSpace();
  const [name, setName] = useState("");
  const [type, setType] = useState<SpaceType>("managed");
  const [cName, setCName] = useState("");
  const [cType, setCType] = useState<CategoryType>("expense");
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!store || !name.trim()) return;
    setSpaceId(await createSpace(store, name, type));
    setName("");
    toast.success("Space created");
  }
  async function addCat(e: FormEvent) {
    e.preventDefault();
    if (!store || !cName.trim() || !spaceId) return;
    await store.save<CategoryData>("category", spaceId, { name: cName.trim(), type: cType });
    setCName("");
  }
  const activeCount = snap.spaces.filter((s) => !s.data.archived).length;
  return (
    <>
      <PageHeader title="Spaces & categories" />
      <Panel title="New space" className="mb-4">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Name" htmlFor="sp-n"><Input id="sp-n" placeholder="Sinking Fund" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Ownership" htmlFor="sp-t"><Select id="sp-t" value={type} onChange={(e) => setType(e.target.value as SpaceType)}><option value="personal">My own money</option><option value="managed">Managed fund (held for others)</option></Select></Field>
          <Button type="submit">Create</Button>
        </form>
      </Panel>
      <Panel title="Spaces" className="mb-4">
        {snap.spaces.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
            <Input aria-label="Space name" defaultValue={s.data.name} className="max-w-xs"
              onBlur={(e) => e.target.value.trim() && e.target.value !== s.data.name && store?.save<SpaceData>("space", s.id, { ...s.data, name: e.target.value.trim() }, s.id)} />
            <span className="text-muted-foreground">{s.data.type === "managed" ? "Managed" : "Personal"} · <span className="num">{formatPHP(spaceCash(s.id, snap.accounts, snap.transactions))}</span></span>
            <Button size="sm" variant="ghost" disabled={!s.data.archived && activeCount <= 1}
              onClick={() => store?.save<SpaceData>("space", s.id, { ...s.data, archived: !s.data.archived }, s.id)}>{s.data.archived ? "Unarchive" : "Archive"}</Button>
          </div>
        ))}
      </Panel>
      <Panel title="Categories in this space">
        <form onSubmit={addCat} className="mb-3 flex gap-2">
          <Input aria-label="Category name" placeholder="New category" value={cName} onChange={(e) => setCName(e.target.value)} />
          <Select aria-label="Category type" value={cType} onChange={(e) => setCType(e.target.value as CategoryType)} className="w-32"><option value="expense">Expense</option><option value="income">Income</option></Select>
          <Button type="submit">Add</Button>
        </form>
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 py-1 text-sm">
            <Input aria-label="Category name" defaultValue={c.data.name} className="max-w-xs" onBlur={(e) => e.target.value.trim() && e.target.value !== c.data.name && store?.save<CategoryData>("category", c.space_id, { ...c.data, name: e.target.value.trim() }, c.id)} />
            <span className="text-xs text-muted-foreground">{c.data.type}</span>
            <Button size="sm" variant="ghost" onClick={() => store?.save<CategoryData>("category", c.space_id, { ...c.data, archived: !c.data.archived }, c.id)}>{c.data.archived ? "Unarchive" : "Archive"}</Button>
          </div>
        ))}
      </Panel>
    </>
  );
}
