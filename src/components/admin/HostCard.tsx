import { Disclosure } from "@/components/admin/Disclosure";
import type { HostPanel, Meter } from "@/lib/host-usage";

/** Amber from 80% of an allowance, red at 100%. */
function level(ratio: number | null): string {
  if (ratio == null) return "";
  if (ratio >= 1) return " is-over";
  if (ratio >= 0.8) return " is-warn";
  return "";
}

function MeterRow({ meter }: { meter: Meter }) {
  return (
    <li className={`a-meter${level(meter.ratio)}`}>
      <div className="a-meter-top">
        <span>{meter.label}</span>
        <span>
          {meter.unavailable ? <span className="a-meter-na">{meter.used}</span> : meter.used}
          {meter.limit ? ` / ${meter.limit}` : null}
        </span>
      </div>
      {meter.ratio != null ? (
        <div className="a-meter-bar" aria-hidden>
          <span style={{ width: `${Math.max(2, meter.ratio * 100)}%` }} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * One hosting allowance card. When some meters are marked tight, only those (plus any at 80% or
 * more) show at first; the rest open under "All limits".
 */
export function HostCard({ panel }: { panel: HostPanel }) {
  const collapsible = panel.meters.some((m) => m.tight) && panel.meters.some((m) => !m.tight);
  const shown = collapsible ? panel.meters.filter((m) => m.tight || (m.ratio ?? 0) >= 0.8) : panel.meters;
  const rest = collapsible ? panel.meters.filter((m) => !shown.includes(m)) : [];
  return (
    <section className="a-card a-host" aria-label={panel.title}>
      <div className="a-host-head">
        <h2 className="a-h2">{panel.title}</h2>
        {panel.detail ? <p className="a-quiet">{panel.detail}</p> : null}
      </div>
      <ul className="a-meters">
        {shown.map((meter) => (
          <MeterRow key={meter.label} meter={meter} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <Disclosure className="a-host-more" headClassName="a-host-more-head" summary="All limits">
          <ul className="a-meters">
            {rest.map((meter) => (
              <MeterRow key={meter.label} meter={meter} />
            ))}
          </ul>
        </Disclosure>
      ) : null}
      {panel.note || panel.link ? (
        <p className="a-quiet a-host-note">
          {panel.note}
          {panel.note && panel.link ? " " : null}
          {panel.link ? (
            <a className="a-host-link" href={panel.link.href} target="_blank" rel="noopener noreferrer">
              {panel.link.label}
            </a>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
