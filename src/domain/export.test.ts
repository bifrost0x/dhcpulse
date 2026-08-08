import { describe, expect, it } from 'vitest';
import { defaultScenario } from './defaults';
import { createMarkdownPlan } from './export';
import { buildPlan } from './planner';

describe('createMarkdownPlan', () => {
  it('creates a complete English change-plan draft from the scenario and result', () => {
    const input = { ...defaultScenario, leaseDurationHours: 192, clientCount: 250 };
    const markdown = createMarkdownPlan(input, buildPlan(input), 'en');

    expect(markdown).toContain('# DHCPulse change plan');
    expect(markdown).toContain('**Scenario:** Server migration');
    expect(markdown).toContain('**Current lease:** 8 days');
    expect(markdown).toContain('**Estimated clients:** 250');
    expect(markdown).toContain('## Lease timeline');
    expect(markdown).toContain('- T1 renewal: 4 days after lease acquisition');
    expect(markdown).toContain('## Cutover checklist');
    expect(markdown).toContain('- [ ] Export and securely back up the current DHCP configuration.');
    expect(markdown).toContain('## Assumptions');
    expect(markdown).not.toContain('undefined');
  });

  it('uses complete German headings and action text', () => {
    const input = {
      ...defaultScenario,
      scenarioType: 'serverAddress' as const,
      sameServerAddress: false,
    };
    const markdown = createMarkdownPlan(input, buildPlan(input), 'de');

    expect(markdown).toContain('# DHCPulse-Change-Plan');
    expect(markdown).toContain('**Szenario:** Neue DHCP-Serveradresse');
    expect(markdown).toContain('## Bewertung');
    expect(markdown).toContain('## Lease-Zeitachse');
    expect(markdown).toContain('Clients sind auf Rebinding angewiesen');
    expect(markdown).not.toContain('undefined');
  });

  it('formats sub-day durations without rounding away operational detail', () => {
    const input = { ...defaultScenario, leaseDurationHours: 6, t1Percent: 50, t2Percent: 87.5 };
    const markdown = createMarkdownPlan(input, buildPlan(input), 'en');

    expect(markdown).toContain('T1 renewal: 3 hours');
    expect(markdown).toContain('T2 rebinding: 5 hours 15 minutes');
  });
});
