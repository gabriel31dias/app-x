import { format } from "date-fns";

export const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
export const pct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`);
export const num = (v: number) => v.toLocaleString("pt-BR");
export const dataHora = (v: string | null) => (v ? format(new Date(v), "dd/MM/yyyy HH:mm") : "—");
export const ymd = (d: Date) => format(d, "yyyy-MM-dd");
/** CPF 52998224725 → 529.***.***-25 (a tela não precisa do documento inteiro) */
export const doc = (d: string) => (d.length === 11 ? `${d.slice(0, 3)}.***.***-${d.slice(9)}` : d);
