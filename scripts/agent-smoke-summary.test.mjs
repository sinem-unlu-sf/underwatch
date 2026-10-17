// node --test scripts/agent-smoke-summary.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreflight, parseProxyLog, parseStream, parseHooks } from './agent-smoke-summary.mjs';

const PREFLIGHT_OK = `P1 claude_version: 2.1.302 (Claude Code)
P2 identity: uid=1000(agent) gid=1000(agent) groups=1000(agent)
P3 policy_write: denied
P4 policy_dropin_write: denied
P5 forwarder_write: denied
P6 mounts:
    /workspace rw,relatime
    /kw-hooks rw,relatime
    /etc/claude-code ro,nosuid,nodev,relatime
    /opt/kw/kw-hook.mjs ro,nosuid,nodev,relatime
P7 allowed_via_proxy[api.anthropic.com:443]: http=404 connect=200 exit=0
P8 denied_via_proxy[example.com:443]: curl: (56) CONNECT tunnel failed, response 403 http=000 connect=403 exit=56
P9 denied_port_via_proxy[api.anthropic.com:22]: curl: (56) CONNECT tunnel failed, response 403 connect=403 exit=56
P10 direct_no_proxy[api.anthropic.com:443]: curl: (6) Could not resolve host: api.anthropic.com http=000 exit=6
P11 direct_tcp[1.1.1.1:443]: bash: connect: Network is unreachable exit=1
P12 external_dns[api.anthropic.com]: exit=2
`;

test('all preflight checks pass on a good run', () => {
  const c = parsePreflight(PREFLIGHT_OK);
  for (const [k, v] of Object.entries(c)) assert.equal(v.pass, true, k);
});

test('writable policy, open egress and missing lines fail or are null with a reason', () => {
  const bad = PREFLIGHT_OK
    .replace('P3 policy_write: denied', 'P3 policy_write: WRITABLE')
    .replace('connect=403 exit=56\nP9', 'connect=200 exit=0\nP9')
    .replace('http=000 exit=6', 'http=404 exit=0')
    .replace('/etc/claude-code ro,', '/etc/claude-code rw,')
    .replace(/P12.*\n/, '');
  const c = parsePreflight(bad);
  assert.equal(c.policy_file_not_writable.pass, false);
  assert.equal(c.proxy_denies_non_allowlisted.pass, false);
  assert.equal(c.no_direct_https_without_proxy.pass, false);
  assert.equal(c.policy_mount_read_only.pass, false);
  assert.equal(c.no_external_dns.pass, null);
  assert.match(c.no_external_dns.reason, /P12/);
});

test('proxy log: allowed, filtered domain and refused port', () => {
  const log = [
    '2026-10-17T01:36:16Z CONNECT   Oct 17 01:36:16.927 [1]: Request (file descriptor 4): CONNECT api.anthropic.com:443 HTTP/1.1',
    '2026-10-17T01:36:16Z CONNECT   Oct 17 01:36:16.937 [1]: Established connection to host "api.anthropic.com" using file descriptor 5.',
    '2026-10-17T01:36:16Z CONNECT   Oct 17 01:36:16.969 [1]: Request (file descriptor 4): CONNECT example.com:443 HTTP/1.1',
    '2026-10-17T01:36:16Z NOTICE    Oct 17 01:36:16.970 [1]: Proxying refused on filtered domain "example.com"',
    '2026-10-17T01:36:16Z INFO      Oct 17 01:36:16.972 [1]: Refused CONNECT method on port 22',
  ].join('\n');
  const p = parseProxyLog(log);
  assert.deepEqual(p.requests, ['CONNECT api.anthropic.com:443', 'CONNECT example.com:443']);
  assert.deepEqual(p.established, ['api.anthropic.com']);
  assert.deepEqual(p.refused, [{ host: 'example.com', reason: 'domain_not_allowlisted' }, { port: 22, reason: 'connect_port_not_allowed' }]);
});

test('stream + hooks parsing tolerates junk lines', () => {
  const s = parseStream('{"type":"system","subtype":"init","session_id":"s1","model":"m"}\nnot json\n{"type":"result","subtype":"success","is_error":true,"num_turns":1,"terminal_reason":"api_error"}\n');
  assert.equal(s.nonJson, 1);
  assert.equal(s.init.session_id, 's1');
  assert.equal(s.result.is_error, true);
  const h = parseHooks('{"hook_event_name":"SessionStart"}\n{"payload":{"hook_event_name":"Stop"}}\n{bad\n');
  assert.deepEqual(h, { lines: 3, events: { SessionStart: 1, Stop: 1, '<non-json>': 1 } });
});

import { parseConformance } from './agent-smoke-summary.mjs';
test('conformance: pass when managed tier wins, fail when repo settings leak through', () => {
  const ok = parseConformance('C1 managed_hooks_fired: hook_started=1\nC2 repo_hook_marker: absent\nC3 local_hook_marker: absent\nC4 init_permission_mode: default\n');
  for (const [k, v] of Object.entries(ok)) assert.equal(v.pass, true, k);
  const bad = parseConformance('C1 managed_hooks_fired: hook_started=0\nC2 repo_hook_marker: PRESENT\nC4 init_permission_mode: bypassPermissions\n');
  assert.equal(bad.managed_hooks_fire_despite_repo_disableAllHooks.pass, false);
  assert.equal(bad.repo_hooks_blocked.pass, false);
  assert.equal(bad.local_hooks_blocked.pass, null);
  assert.equal(bad.repo_bypass_mode_not_applied.pass, false);
});

import { splitProxyPhases, workspaceChange } from './agent-smoke-summary.mjs';
test('proxy log is split at the host-recorded agent-run offset; missing offset -> null with reason', () => {
  const pre = 'x Request (file descriptor 4): CONNECT example.com:443 HTTP/1.1\nx Proxying refused on filtered domain "example.com"\n';
  const run = 'x Request (file descriptor 4): CONNECT api.anthropic.com:443 HTTP/1.1\nx Established connection to host "api.anthropic.com" using file descriptor 5.\n';
  const buf = Buffer.from(pre + run, 'utf8');
  const s = splitProxyPhases(buf, `agent_run_start_byte=${Buffer.byteLength(pre)}\n`);
  assert.deepEqual(s.agent_run.requests, ['CONNECT api.anthropic.com:443']);
  assert.deepEqual(s.agent_run.refused, []);
  assert.deepEqual(s.preflight.refused, [{ host: 'example.com', reason: 'domain_not_allowlisted' }]);
  const n = splitProxyPhases(buf, '');
  assert.equal(n.agent_run, null);
  assert.match(n.reason, /phases/);
  assert.equal(n.all.requests.length, 2);
});
test('workspace change: equal / different / missing snapshot', () => {
  assert.equal(workspaceChange('a  ./x\n', 'a  ./x\n', '').changed, false);
  assert.equal(workspaceChange('a  ./x\n', 'b  ./x\n', '< a  ./x\n> b  ./x\n').changed, true);
  const m = workspaceChange('a  ./x\n', '', '');
  assert.equal(m.changed, null);
  assert.match(m.reason, /after/);
});
