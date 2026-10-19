// V73 Expert Quality Layer: deterministic critic + bounded auto-repair helpers.
export function criticOutput(output, selectedSkills = [], toolTrace = []) {
  const text = String(output || '').trim();
  const findings = [];
  if (text.length < 2) findings.push({ code: 'empty_or_too_short_output', severity: 'high', action: 'regenerate' });
  if (/I (?:used|ran|executed|checked|verified) (?:a )?(?:tool|database|search)/i.test(text) && toolTrace.length === 0) {
    findings.push({ code: 'unsupported_tool_execution_claim', severity: 'high', action: 'repair' });
  }
  if (/^(done|completed|successfully completed)\.?$/i.test(text)) {
    findings.push({ code: 'unsupported_completion_claim', severity: 'high', action: 'repair' });
  }
  if (selectedSkills.length === 0 && text.length >= 2) {
    findings.push({ code: 'no_skill_match', severity: 'low', action: 'observe' });
  }
  return {
    passed: findings.every(x => x.severity !== 'high'),
    findings,
    selectedSkillCount: selectedSkills.length,
    toolCallCount: toolTrace.length,
    reviewedAt: new Date().toISOString()
  };
}

export function deterministicRepair(output, critic) {
  let text = String(output || '').trim();
  const codes = new Set((critic?.findings || []).map(x => x.code));
  if (codes.has('unsupported_tool_execution_claim')) {
    text = text.replace(/I (?:used|ran|executed|checked|verified) (?:a )?(?:tool|database|search)/gi, 'I did not execute or verify a tool, database, or search');
  }
  if (codes.has('unsupported_completion_claim')) {
    text = 'The task is not marked complete until the required result and verification checks pass.';
  }
  return text;
}
