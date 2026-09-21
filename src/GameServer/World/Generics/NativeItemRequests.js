// Per-connection burst allowance, then at most five catalog operations/second.
// Keep only the latest pending request; normal UI clicks complete within 200 ms.
// Budgets survive close/reopen and character switches. Weak keys expire on logout.
const { performance } = require('node:perf_hooks');
const states = new WeakMap();
function run(session, action) {
    let state = states.get(session);
    if (!state) { state = { tokens: 4, at: performance.now(), timer: null, pending: null }; states.set(session, state); }
    const now = performance.now();
    state.tokens = Math.min(4, state.tokens + Math.max(0, now - state.at) / 200);
    state.at = now;
    if (state.tokens >= 1) {
        clearTimeout(state.timer); state.timer = null; state.pending = null;
        state.tokens--; action(); return;
    }
    state.pending = { actor: session.actor, action };
    if (!state.timer) state.timer = setTimeout(() => {
        const pending = state.pending;
        state.timer = null; state.pending = null;
        if (pending && session.actor === pending.actor) {
            try { run(session, pending.action); }
            catch (error) { utils.infoWarn('NativeItems', 'deferred request failed: %s', error.message); }
        }
    }, Math.max(1, Math.ceil((1 - state.tokens) * 200)));
}
function cancel(session) {
    const state = states.get(session);
    if (state) { clearTimeout(state.timer); state.timer = null; state.pending = null; }
}
module.exports = { run, cancel };
