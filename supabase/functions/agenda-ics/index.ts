// Calendario suscribible (.ics) de la agenda.
// Uso: /functions/v1/agenda-ics            → todos los eventos
//      /functions/v1/agenda-ics?carrera=lc → generales + los de LC (también "ltm")
// Solo lee eventos publicados, con la clave pública y las mismas reglas que el sitio.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://ubkqmjotwyapxfnwiarj.supabase.co";
const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "sb_publishable_5_fGFHqCzJ-Lj44aLKI-cg_j1CzZ5Uj";
const SITE = "https://jrehlaender91.github.io/agenda-mcd/";
const MTY_OFFSET_MS = 6 * 3600 * 1000; // Monterrey: UTC-6 todo el año

type Ev = {
  id: string; title: string; description: string; category: string; location: string;
  starts_at: string; ends_at: string | null; all_day: boolean;
  status: string; audience: string; updated_at: string;
};

const stamp = (d: string | Date) => new Date(d).toISOString().replace(/[-:]|\.\d{3}/g, "");
const dayKey = (d: string) => new Date(new Date(d).getTime() - MTY_OFFSET_MS).toISOString().slice(0, 10);
const nextDay = (key: string) => {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const text = (s: string) =>
  String(s ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** Las líneas de un .ics no deben pasar de 75 bytes: se parten con salto + espacio. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > 73) { out.push(cur); cur = " "; size = 1; }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

export function buildCalendar(events: Ev[], name: string): string {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Medios y Cultura Digital//Agenda//ES",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${text(name)}`, "X-WR-TIMEZONE:America/Monterrey",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  for (const ev of events) {
    const cancelled = ev.status === "cancelado";
    const prefix = cancelled ? "CANCELADO: " : ev.status === "reprogramado" ? "REPROGRAMADO: " : "";
    lines.push("BEGIN:VEVENT", `UID:${ev.id}@agenda-medios`, `DTSTAMP:${stamp(ev.updated_at || new Date())}`);
    if (ev.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${dayKey(ev.starts_at).replace(/-/g, "")}`);
      lines.push(`DTEND;VALUE=DATE:${nextDay(dayKey(ev.ends_at || ev.starts_at)).replace(/-/g, "")}`);
    } else {
      const end = ev.ends_at ? new Date(ev.ends_at) : new Date(new Date(ev.starts_at).getTime() + 3600e3);
      lines.push(`DTSTART:${stamp(ev.starts_at)}`, `DTEND:${stamp(end)}`);
    }
    lines.push(`SUMMARY:${text(prefix + ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${text(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${text(ev.location)}`);
    lines.push(`URL:${SITE}#e-${ev.id}`, `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

Deno.serve(async (req: Request) => {
  const carrera = (new URL(req.url).searchParams.get("carrera") || "").toLowerCase();
  const since = new Date(Date.now() - 120 * 86400e3).toISOString();
  let query = `agenda_events?select=*&published=eq.true&starts_at=gte.${since}&order=starts_at.asc&limit=1000`;
  if (carrera === "lc" || carrera === "ltm") query += `&audience=in.(todas,${carrera})`;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers: { apikey: PUBLIC_KEY } });
  if (!res.ok) return new Response("No se pudo generar el calendario.", { status: 502 });

  const name = "Agenda Medios y Cultura Digital" + (carrera === "lc" ? " · LC" : carrera === "ltm" ? " · LTM" : "");
  return new Response(buildCalendar(await res.json(), name), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="agenda-medios.ics"',
      "Cache-Control": "public, max-age=900",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
