// Graph helpers for the recalculation engine. Pure, no DOM.

/**
 * Strongly connected components (iterative Tarjan). Components come out in
 * reverse topological order: if u -> v, v's component is listed before u's.
 * @template T
 * @param {Iterable<T>} nodes
 * @param {(node:T)=>Iterable<T>} edges  successors of a node
 * @returns {T[][]}
 */
export function stronglyConnected(nodes, edges) {
  let counter = 0;
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];

  const visit = (v, work) => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    work.push([v, edges(v)[Symbol.iterator]()]);
  };

  for (const start of nodes) {
    if (index.has(start)) continue;
    const work = [];
    visit(start, work);
    while (work.length) {
      const [v, it] = work[work.length - 1];
      const step = it.next();
      if (!step.done) {
        const w = step.value;
        if (!index.has(w)) visit(w, work);
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
        continue;
      }
      work.pop();
      if (work.length) {
        const u = work[work.length - 1][0];
        low.set(u, Math.min(low.get(u), low.get(v)));
      }
      if (low.get(v) === index.get(v)) components.push(popComponent(stack, onStack, v));
    }
  }
  return components;
}

function popComponent(stack, onStack, root) {
  const component = [];
  let w;
  do {
    w = stack.pop();
    onStack.delete(w);
    component.push(w);
  } while (w !== root);
  return component;
}

/**
 * Every node reachable from the seeds (seeds included), breadth first.
 * @template T
 * @param {Iterable<T>} seeds
 * @param {(node:T)=>Iterable<T>} edges
 * @returns {Set<T>}
 */
export function reachable(seeds, edges) {
  const seen = new Set(seeds);
  const queue = [...seen];
  for (let i = 0; i < queue.length; i += 1) {
    for (const w of edges(queue[i])) {
      if (!seen.has(w)) {
        seen.add(w);
        queue.push(w);
      }
    }
  }
  return seen;
}
