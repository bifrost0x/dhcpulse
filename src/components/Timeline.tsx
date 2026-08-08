import { Clock3 } from 'lucide-react';
import { formatDuration } from '../domain/export';
import { interpolate, translate, type CopyKey, type Locale } from '../content/copy';
import type { LeaseTimeline } from '../domain/types';

export function Timeline({ timeline, locale }: { timeline: LeaseTimeline; locale: Locale }) {
  return (
    <section className="result-section" aria-labelledby="timeline-heading">
      <div className="result-section-heading">
        <Clock3 size={18} aria-hidden="true" />
        <div><h3 id="timeline-heading">{translate(locale, 'timeline.title')}</h3><p>{translate(locale, 'timeline.description')}</p></div>
      </div>
      <ol className="timeline-list">
        {timeline.events.map((event, index) => {
          const wave = timeline.waves[index];
          if (!wave) return null;
          return (
            <li key={event.kind}>
              <div className={`timeline-node ${event.kind}`} aria-hidden="true" />
              <div className="timeline-time">{formatDuration(event.offsetHours, locale)}</div>
              <div className="timeline-content">
                <strong>{translate(locale, `timeline.${event.kind}` as CopyKey)}</strong>
                <span>{wave.startsAfterHours === 0
                  ? interpolate(translate(locale, 'timeline.firstHour'), { count: wave.clientsWithinFirstHour })
                  : interpolate(translate(locale, 'timeline.startsAfter'), { duration: formatDuration(wave.startsAfterHours, locale) })}</span>
                <small>{interpolate(translate(locale, 'timeline.allBy'), { duration: formatDuration(wave.allClientsByHours, locale) })}</small>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
