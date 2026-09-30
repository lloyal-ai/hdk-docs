---
title: "From async/await to Lloyal"
description: "The whole translation from async/await to Lloyal's generators in one page: what each form means, the four lines that carry the model, the mistakes that compile and leak, and the rules to hand your coding agent."
lede: "If you write async/await, this page is the whole translation — and the one thing you gain from it."
---

<!--
Moved, not rewritten: the Rosetta Stone, the four lines, the operator reference, the return-type rule,
the common mistakes and the repository invariants all come from Thinking in Lloyal (2026-09-30).
The opening paragraph is the lloyal-ai README's "The one idea underneath".
-->

A Lloyal program is a generator. Read `function*` as `async function` and `yield*` as `await`, and what you gain is **ownership**: whatever a piece of work starts is finished or cleaned up when that work ends, however it ends. That is why a Stop works in the middle of anything, and why there is almost no teardown code to write.

The rules below are few, and they matter: code that breaks them usually compiles, runs, and leaks. [Thinking in Lloyal](/thinking-in-lloyal) is the long version of why.

## Async-to-Lloyal Rosetta Stone {#async-to-lloyal-rosetta-stone}

| JavaScript instinct | Lloyal/Effection form | Ownership meaning |
| --- | --- | --- |
| `async function` | `function*(): Operation<T>` | A composable scoped program |
| `await work()` | `yield* work()` | Perform work under the current owner |
| `Promise<T>` | `Operation<T>` | Work waiting to be placed in a scope |
| `Promise.all(...)` | `yield* all(...)` | Run and join an owned cohort |
| fire-and-forget Promise | `yield* spawn(...)` | Start a child that cannot outlive this scope |
| `Promise.race(...)` | `yield* race(...)` | Race owned alternatives and halt losers |
| call an async API | `yield* call(() => ...)` | Cross deliberately into Promise code |
| write into the model — `commitTurn`, `commit`, `prefill`, `promote` | `yield* waitUntilSettled(session.commitTurn(...))` | Finish the native write, even when halted |
| `finally` cleanup | `ensure()` or a resource | Bind cleanup to scope exit |
| `for await` | `for (... of yield* each(stream))` | Consume a scoped subscription |
| global dependency | Effection Context | Inherit a capability inside a scope |
| temporary workspace | `withSpine(...)` | Borrow live inference state and reclaim it |

Further language-level references:

-   [https://frontside.com/effection/guides/v4/thinking-in-effection/](https://frontside.com/effection/guides/v4/thinking-in-effection/)
-   [https://frontside.com/effection/guides/v4/async-rosetta-stone/](https://frontside.com/effection/guides/v4/async-rosetta-stone/)


## Four lines that carry the model {#four-lines-that-carry-the-model}

```ts label="TypeScript"
const value = yield* operation;
```

Perform owned work and resume with its result.

```ts label="TypeScript"
const task = yield* spawn(operation);
```

Start concurrent work without detaching it from the current scope.

```ts label="TypeScript"
const findings = yield* withSpine(options, body);
```

Borrow live inference state, return durable data, and reclaim the temporary subtree.

```ts label="TypeScript"
yield* waitUntilSettled(session.commitTurn(query, answer));
```

Make the result durable, explicitly — and let the write finish even if the owner is halted.


## Operator ownership reference {#operator-ownership-reference}

`yield*` performs the Operation it receives. Different Operations complete at different moments.

| Code | Meaning |
| --- | --- |
| `yield* operation` | Perform scoped work and receive its result |
| `yield* spawn(operation)` | Attach and start a concurrent child |
| `yield* all(operations)` | Run and join an owned cohort |
| `yield* race(operations)` | Race owned alternatives and halt losers |
| `yield* call(() => promise)` | Cross deliberately into Promise-based code |
| `yield* waitUntilSettled(promise)` | Await a native write into the model; exit only once it has settled, even on halt |
| `yield* ensure(cleanup)` | Register cleanup for scope exit |
| `for (... of yield* each(stream))` | Consume a subscription owned by the scope |
| `yield* context.expect()` | Read an inherited scoped capability |
| `yield* resourceOperation` | Acquire a live capability whose provider remains beneath you |

This matters most with `spawn` and resources: `yield*` does not always mean “wait for every activity underneath this call to finish”.


## Follow the return type {#follow-the-return-type}

Two APIs may share a method name but have different semantics.

```ts label="TypeScript"
events.send(event);
```

may be synchronous.

```ts label="TypeScript"
yield* channel.send(event);
```

may return `Operation<void>` and require `yield*`.

Do not infer from names such as `send`, `read`, or `close`.

Let TypeScript tell you whether an API is:

-   synchronous;
-   Promise-returning;
-   or Operation-returning.

A floating-Operation lint rule would be valuable for harness projects.


## Common mistakes {#common-mistakes}

### Converting an Operation to `async` {#converting-an-operation-to-async}

Avoid:

```ts label="TypeScript"
async function runResearch() {
  // ...
}
```

when the function must compose Lloyal Operations.

Use:

```ts label="TypeScript"
function* runResearch(): Operation<Result> {
  // ...
}
```

### Calling an Operation without performing it {#calling-an-operation-without-performing-it}

Avoid:

```ts label="TypeScript"
ctx.spawn(task);
```

Use:

```ts label="TypeScript"
const agent = yield* ctx.spawn(task);
```

### Treating an Agent as a Task {#treating-an-agent-as-a-task}

Avoid:

```ts label="TypeScript"
yield* agent;
```

Use:

```ts label="TypeScript"
yield* ctx.waitFor(agent);
```

### Returning a scoped branch {#returning-a-scoped-branch}

Avoid relying on:

```ts label="TypeScript"
const spine = yield* withSpine(options, function* (spine) {
  return spine;
});
```

Return findings or another explicitly durable value.

### Detached background loops {#detached-background-loops}

Avoid:

```ts label="TypeScript"
void listenForever();
```

Use:

```ts label="TypeScript"
yield* spawn(listenForever);
```

### Wrapping a native write in `call()` {#wrapping-a-native-write-in-call}

Avoid:

```ts label="TypeScript"
yield* call(() => session.commitTurn(query, answer));
```

Use:

```ts label="TypeScript"
import { waitUntilSettled } from "@lloyal-labs/lloyal-agents";

yield* waitUntilSettled(session.commitTurn(query, answer));
```

A native decode is queued on a worker thread and cannot be recalled. If the owner is halted — the reader presses Stop — `call` abandons the promise while the decode keeps writing the model's memory, and whatever cleans up next touches the same state: a corrupted branch, or a crash. `waitUntilSettled` waits for that one call to finish before the scope exits. It applies to every call that writes into the model: `commitTurn`, `commit`, the `prefill` family, `promote` and `retainOnly`.

### Assuming `call()` cancels every Promise {#assuming-call-cancels-every-promise}

Bind provider cancellation into the scope where available.

### Marking a native Tool as off-loop {#marking-a-native-tool-as-off-loop}

Do not set `Tool.fanout = true` when the Tool may touch the main SessionContext, a branch, or a nested Agent runtime.


## Repository invariants {#repository-invariants}

```md label="Markdown"
## Lloyal structured-concurrency invariants

- A harness is a long-lived Effection scope.
- Read `yield*` as “perform this operation here, under this owner.”
- Do not convert Operation generators into async functions.
- Do not call and ignore a value of type `Operation<T>`.
- Perform Operations with `yield*`, `all`, `race`, `spawn`, or return them.
- Use `spawn` only for concurrent children owned by the current scope.
- Use `call()` at Promise or async-library boundaries.
- Await a native write into the model (`commitTurn`, `commit`, `prefill*`, `promote`) with `waitUntilSettled`, never `call()`.
- An Agent is not an Effection Task; the pool advances Agents.
- Agent concurrency is executed by the pool over BranchStore.
- A Branch or spine normally cannot outlive the scope that created it.
- Return durable findings from `withSpine`, not live branch handles.
- Effection Context values are scoped capabilities, not globals.
- Follow TypeScript return types: some `send()` methods are synchronous,
  while Channels return Operations that must be yielded.
- Do not mark a Tool as `fanout` if it may touch the main SessionContext.
```

## Next {#next}

- [Build your first harness](/build-your-first-harness) — these forms in a real project.
- [Thinking in Lloyal](/thinking-in-lloyal) — the execution model they describe.
