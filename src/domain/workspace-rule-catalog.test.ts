import { describe, expect, it } from 'vitest';
import { workspaceRuleCatalog } from './workspace-rule-catalog';

describe('workspace rule catalog', () => {
  it('contains complete bilingual guidance and authoritative HTTPS sources for every supported rule', () => {
    for (const [ruleId, rule] of Object.entries(workspaceRuleCatalog)) {
      expect(ruleId).not.toBe('reservation-in-dynamic-pool');
      expect(rule.source).toMatch(/^https:\/\//);
      for (const locale of ['en', 'de'] as const) {
        expect(rule.copy[locale].title.trim()).not.toBe('');
        expect(rule.copy[locale].rationale.trim()).not.toBe('');
        expect(rule.copy[locale].impact.trim()).not.toBe('');
        expect(rule.copy[locale].recommendation.trim()).not.toBe('');
      }
    }
  });

  it('links Microsoft reservation validation to the documented distribution-range behavior', () => {
    expect(workspaceRuleCatalog['reservation-outside-scope'].source).toBe(
      'https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/cant-add-dhcp-reservation',
    );
  });
});
