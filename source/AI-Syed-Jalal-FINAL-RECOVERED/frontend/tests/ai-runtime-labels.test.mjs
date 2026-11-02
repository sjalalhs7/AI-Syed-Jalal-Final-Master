import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = await readFile(join(root, 'workspace.html'), 'utf8');

test('AI workspace labels describe the actual text-only runtime', () => {
  assert.match(workspace, /AI TEXT WORKSPACE/);
  assert.match(workspace, /One workspace for AI text tasks/);
  assert.match(workspace, /Only configured keys are selectable/);
  assert.match(workspace, /Local tools require confirmation/);
  assert.match(workspace, /Local tools \+ optional cloud AI/);
  assert.doesNotMatch(workspace, /<div class=\"value\">TOOLS<\/div>/);
  assert.doesNotMatch(workspace, /Gemini \+ multi-provider/);
  assert.match(workspace, /\$\('#aiCapabilityCount'\)\.textContent='NONE'/);
});
