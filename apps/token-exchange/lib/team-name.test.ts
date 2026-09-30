import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normaliseTeamName, TEAM_NAME_MAX_LENGTH, teamNameToApply } from './team-name';

describe('normaliseTeamName', () => {
  it('returns null when no name was sent (backward compatible)', () => {
    assert.equal(normaliseTeamName(undefined), null);
    assert.equal(normaliseTeamName(null), null);
  });

  it('ignores non-string values instead of failing the exchange', () => {
    assert.equal(normaliseTeamName(42), null);
    assert.equal(normaliseTeamName({ name: 'Petland' }), null);
    assert.equal(normaliseTeamName(['Petland']), null);
  });

  it('trims and collapses whitespace', () => {
    assert.equal(normaliseTeamName('  Petland   Frisco \n'), 'Petland Frisco');
  });

  it('ignores names shorter than 3 characters after trimming', () => {
    assert.equal(normaliseTeamName(''), null);
    assert.equal(normaliseTeamName('   '), null);
    assert.equal(normaliseTeamName(' ab '), null);
    assert.equal(normaliseTeamName('abc'), 'abc');
  });

  it('truncates to the Documenso team-name limit rather than dropping the name', () => {
    const long = 'Petland Kennesaw - Town Center Mall';
    const result = normaliseTeamName(long);

    assert.ok(result);
    assert.ok(result.length <= TEAM_NAME_MAX_LENGTH);
    assert.equal(result, long.slice(0, TEAM_NAME_MAX_LENGTH).trim());
  });

  it('does not leave trailing whitespace after truncation', () => {
    // 29 chars + a space at index 29 + more text: the cut lands just after the space.
    const name = `${'a'.repeat(29)} tail`;

    assert.equal(normaliseTeamName(name), 'a'.repeat(29));
  });

  it('rejects names containing URLs, like ZTeamNameSchema does', () => {
    assert.equal(normaliseTeamName('https://evil.example'), null);
    assert.equal(normaliseTeamName('visit www.example.com'), null);
  });
});

describe('teamNameToApply', () => {
  const slug = 'pinogy-client-107';
  const teamUrl = 'pinogy-client-107';

  it('renames a team that still carries its slug as its name', () => {
    assert.equal(
      teamNameToApply({ currentName: slug, slug, teamUrl, requestedName: 'Petland Frisco' }),
      'Petland Frisco',
    );
  });

  it('treats the derived team URL as the machine default too', () => {
    assert.equal(
      teamNameToApply({
        currentName: 'pinogy-client-107',
        slug: 'Pinogy Client 107',
        teamUrl: 'pinogy-client-107',
        requestedName: 'Petland Frisco',
      }),
      'Petland Frisco',
    );
  });

  it('never overwrites a name a human set', () => {
    assert.equal(
      teamNameToApply({ currentName: 'Petland Frisco (TX)', slug, teamUrl, requestedName: 'Petland Frisco' }),
      null,
    );
  });

  it('does nothing when no name was requested', () => {
    assert.equal(teamNameToApply({ currentName: slug, slug, teamUrl, requestedName: null }), null);
  });

  it('does nothing when the name already matches', () => {
    assert.equal(
      teamNameToApply({ currentName: 'Petland Frisco', slug, teamUrl, requestedName: 'Petland Frisco' }),
      null,
    );
  });
});
