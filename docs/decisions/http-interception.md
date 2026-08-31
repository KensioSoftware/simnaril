# HTTP interception uses `@mswjs/interceptors`

Status accepted on 2026-08-31.

Simnaril uses `@mswjs/interceptors` as its low-level HTTP interception
dependency. The dependency stays inside `src/http/interception.ts`. Code above
that boundary provides a function from `Request` to `Response | undefined`.
Returning `undefined` passes the request through to the network.

`@mswjs/interceptors` works with the Web Platform request and response types at
its public boundary. Its `HttpRequestInterceptor` operates at the TCP and TLS
socket layer and covers HTTP regardless of the request client. It also provides
explicit apply and dispose operations for its process-wide changes. Simnaril
wraps those operations so the dependency's types and lifecycle do not spread
through the simulation model.

Nock was considered because it has broad Node HTTP compatibility. Its public
API centres on request expectations, matching, and replies. Those concepts
would pull the interception boundary towards the request-mocking model that
Simnaril avoids.

Undici's `MockAgent` was also considered. It covers Node's fetch implementation
but leaves callers of `http` and `https` outside the interception. Supporting
those callers would require a second mechanism.

Maintaining Node networking patches in Simnaril was rejected. The work is
sensitive to changes in Node's networking implementations and already belongs
to the chosen low-level dependency.
