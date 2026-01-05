/**
 * Calculate degree and betweenness centrality for all nodes
 */
export function calculateMetrics(people, relationships) {
  const metrics = new Map();
  const adjacency = new Map();

  // Initialize
  people.forEach(p => {
    metrics.set(p.id, { degree: 0, betweenness: 0 });
    adjacency.set(p.id, new Set());
  });

  // Build adjacency list and calculate degree
  relationships.forEach(rel => {
    const p1 = rel.person1_id;
    const p2 = rel.person2_id;

    if (adjacency.has(p1) && adjacency.has(p2)) {
      adjacency.get(p1).add(p2);
      adjacency.get(p2).add(p1);

      metrics.get(p1).degree++;
      metrics.get(p2).degree++;
    }
  });

  // Calculate betweenness centrality using Brandes algorithm
  const nodeIds = people.map(p => p.id);

  for (const source of nodeIds) {
    const stack = [];
    const predecessors = new Map();
    const sigma = new Map(); // number of shortest paths
    const dist = new Map();
    const delta = new Map();

    nodeIds.forEach(v => {
      predecessors.set(v, []);
      sigma.set(v, 0);
      dist.set(v, -1);
      delta.set(v, 0);
    });

    sigma.set(source, 1);
    dist.set(source, 0);

    const queue = [source];

    // BFS
    while (queue.length > 0) {
      const v = queue.shift();
      stack.push(v);

      const neighbors = adjacency.get(v) || new Set();
      for (const w of neighbors) {
        // First time visiting w?
        if (dist.get(w) < 0) {
          queue.push(w);
          dist.set(w, dist.get(v) + 1);
        }

        // Shortest path to w via v?
        if (dist.get(w) === dist.get(v) + 1) {
          sigma.set(w, sigma.get(w) + sigma.get(v));
          predecessors.get(w).push(v);
        }
      }
    }

    // Accumulation
    while (stack.length > 0) {
      const w = stack.pop();
      for (const v of predecessors.get(w)) {
        const contribution = (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w));
        delta.set(v, delta.get(v) + contribution);
      }
      if (w !== source) {
        const current = metrics.get(w);
        current.betweenness += delta.get(w);
      }
    }
  }

  // For undirected graphs, divide by 2
  nodeIds.forEach(v => {
    metrics.get(v).betweenness /= 2;
  });

  // Calculate max values for normalization
  let maxDegree = 0;
  let maxBetweenness = 0;

  metrics.forEach(m => {
    if (m.degree > maxDegree) maxDegree = m.degree;
    if (m.betweenness > maxBetweenness) maxBetweenness = m.betweenness;
  });

  metrics.maxDegree = maxDegree;
  metrics.maxBetweenness = maxBetweenness;

  return metrics;
}
