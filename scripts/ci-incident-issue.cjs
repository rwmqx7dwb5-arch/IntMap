/* ============================================================================
 *  IntMap · one incident issue per scheduled job — opened on red, rewritten while red, closed on green
 * ----------------------------------------------------------------------------
 *  Called from actions/github-script (which resolves a relative require against the workspace):
 *
 *      const incident = require('./scripts/ci-incident-issue.cjs');
 *      await incident({ github, context }, { label, title, ok, cause, runbook });
 *
 *  This is db-backup.yml's original inline script, moved here so the Supabase deploy/drift workflow
 *  uses the SAME mechanism instead of a second copy (.agents/rules/no-ad-hoc-hardcoding.md §1).
 *  One change in behaviour, and it is the reason for the move:
 *
 *  ⚠ THE BODY IS REWRITTEN ON EVERY RED RUN. The inline version wrote the body once and then left
 *  the issue alone, so it could only ever say 「the backup failed」. Once a MISSING SECRET is a red
 *  run (scripts/ci-require-secrets.sh), the issue has to say WHICH secret — and that changes when
 *  the owner registers one of two. The issue is a state, not a log: no comment a night (that is the
 *  same silence in a louder font — scripts/deep-alarm.mjs measured fourteen of them), one body that
 *  always describes the latest run.
 * ==========================================================================*/
'use strict';

module.exports = async function incident({ github, context }, opts) {
  const { label, title, ok, cause, runbook, labelDescription } = opts;
  if (!label || !title) throw new Error('ci-incident-issue: label and title are required');
  const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const now = new Date().toISOString();

  const open = (await github.rest.issues.listForRepo({ ...context.repo, state: 'open', labels: label })).data;

  if (ok) {
    for (const iss of open) {
      await github.rest.issues.createComment({ ...context.repo, issue_number: iss.number,
        body: `Cleared by ${runUrl} at ${now}. Auto-closing.` });
      await github.rest.issues.update({ ...context.repo, issue_number: iss.number, state: 'closed' });
    }
    return { action: open.length ? 'closed' : 'none' };
  }

  const body = [
    `**${title}** — the latest run is red.`, '',
    `- Cause: ${cause || 'a step failed — read the run log'}`,
    `- Detected (UTC): ${now}`,
    `- Run: ${runUrl}`, '',
    runbook ? `Runbook: ${runbook}` : '',
    'This issue is rewritten by every red run and closes itself on the next green one.',
  ].filter((l) => l !== null).join('\n');

  if (open.length) {
    await github.rest.issues.update({ ...context.repo, issue_number: open[0].number, body });
    return { action: 'rewritten', number: open[0].number };
  }
  try { await github.rest.issues.getLabel({ ...context.repo, name: label }); }
  catch (e) {
    if (e.status !== 404) throw e;
    await github.rest.issues.createLabel({ ...context.repo, name: label, color: 'b60205',
      description: labelDescription || `Automated: ${title}` });
  }
  const created = await github.rest.issues.create({ ...context.repo, title, labels: [label], body });
  return { action: 'opened', number: created.data.number };
};
