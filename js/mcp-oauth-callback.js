/* (mcp-oauth) The service sent the reader back to mcp-oauth-callback.html with ?code=…&state=… (or ?error=…). This hands that query to the IntMap
   page that opened the window — the same origin only — and closes. It reads nothing else, stores nothing, and calls no server: the code is exchanged by the
   IntMap page, which alone holds the PKCE verifier. Served as it is (a plain script, not part of the app bundle). */
(function () {
  var msg = { type: 'intmap-mcp-oauth', query: location.search || '' };
  try { if (window.opener) window.opener.postMessage(msg, location.origin); } catch (e) { /* no opener: the channel below carries it */ }
  try { var bc = new BroadcastChannel('intmap-mcp-oauth'); bc.postMessage(msg); bc.close(); } catch (e) { /* no BroadcastChannel */ }
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* keep the address */ }
  setTimeout(function () { try { window.close(); } catch (e) { /* the browser keeps the window */ } document.getElementById('m').textContent = 'Sign-in finished. You can close this window.'; }, 300);
})();
