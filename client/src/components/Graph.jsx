import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { calculateMetrics } from '../utils/graphMetrics';
import './Graph.css';

const MIN_NODE_SIZE = 20;
const MAX_NODE_SIZE = 60;
const DEGREE_WEIGHT = 0.4;
const BETWEENNESS_WEIGHT = 0.6;

// Progressive reveal timing
const REVEAL_WAVE_DELAY = 500;      // ms between distance waves
const REVEAL_NODE_STAGGER = 80;     // ms between nodes in same wave

// Force simulation parameters (non-configurable)
const LINK_STRENGTH = 0.8;
const COLLISION_PADDING = 15;
const CENTER_GRAVITY = 0.03;
const UNCROSS_STRENGTH = 1.5;
const EDGE_NODE_REPULSION = 50;

// Default settings (configurable)
const DEFAULT_SETTINGS = {
  repulsion: 12500,     // 1/r² repulsion strength
  linkDistance: 30,     // Target distance for connected nodes
  nodeSizeMode: 'both', // 'connections', 'betweenness', or 'both'
};

// Fixed attraction value (not configurable)
const ATTRACTION_STRENGTH = 10;

// Slider ranges for percentage calculation
const SLIDER_RANGES = {
  repulsion: { min: 1000, max: 60000 },      // max x2 (doubled)
  linkDistance: { min: 15, max: 66 },         // min /2, max /3
};

// Convert value to step index (0-5 for 6 steps)
const valueToStep = (value, key) => {
  const { min, max } = SLIDER_RANGES[key];
  const normalized = (value - min) / (max - min);
  return Math.round(normalized * 5);
};

// Convert step index back to value
const stepToValue = (step, key) => {
  const { min, max } = SLIDER_RANGES[key];
  return min + (step / 5) * (max - min);
};

// Dot-based slider component with drag support
function DotSlider({ value, settingKey, onChange }) {
  const STEPS = 6;
  const currentStep = valueToStep(value, settingKey);
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const getStepFromPosition = useCallback((clientX) => {
    if (!containerRef.current) return currentStep;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(percent * (STEPS - 1));
  }, [currentStep]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    const step = getStepFromPosition(e.clientX);
    onChange(stepToValue(step, settingKey));
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const step = getStepFromPosition(e.clientX);
      const newValue = stepToValue(step, settingKey);
      onChange(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, getStepFromPosition, onChange, settingKey]);

  return (
    <div 
      className="dot-slider"
      ref={containerRef}
      onMouseDown={handleMouseDown}
    >
      <div className="dot-slider-track">
        <div 
          className="dot-slider-fill" 
          style={{ width: `${(currentStep / (STEPS - 1)) * 100}%` }} 
        />
      </div>
      <div className="dot-slider-dots">
        {Array.from({ length: STEPS }, (_, i) => (
          <div
            key={i}
            className={`dot-slider-dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'passed' : ''}`}
            aria-label={`Step ${i + 1} of ${STEPS}`}
          />
        ))}
      </div>
    </div>
  );
}

// Custom force: 1/r² repulsion + 1/r attraction between all nodes
function forceCustomPhysics(repulsionK, attractionK) {
  let nodes;

  function force(alpha) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 1;

        // Minimum distance to prevent extreme forces
        const minDist = (nodeA.size + nodeB.size) / 2 + 10;
        const effectiveDist = Math.max(dist, minDist);
        const effectiveDistSq = effectiveDist * effectiveDist;

        // F = attraction/r - repulsion/r²
        // Positive = attract, Negative = repel
        const attraction = attractionK / effectiveDist;
        const repulsion = repulsionK / effectiveDistSq;
        const netForce = (attraction - repulsion) * alpha;

        // Apply force along the line connecting nodes
        const fx = (dx / dist) * netForce;
        const fy = (dy / dist) * netForce;

        nodeA.vx += fx;
        nodeA.vy += fy;
        nodeB.vx -= fx;
        nodeB.vy -= fy;
      }
    }
  }

  force.initialize = (_) => { nodes = _; };
  return force;
}

// Check if two line segments intersect
function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (Math.abs(denom) < 0.0001) return false;

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  return ua > 0.01 && ua < 0.99 && ub > 0.01 && ub < 0.99;
}

// Custom force to reduce edge crossings
function forceUncross(links) {
  function force(alpha) {
    const len = links.length;
    for (let i = 0; i < len; i++) {
      const link1 = links[i];
      const s1 = link1.source;
      const t1 = link1.target;

      for (let j = i + 1; j < len; j++) {
        const link2 = links[j];
        const s2 = link2.source;
        const t2 = link2.target;

        // Skip if links share a node
        if (s1 === s2 || s1 === t2 || t1 === s2 || t1 === t2) continue;

        if (segmentsIntersect(s1.x, s1.y, t1.x, t1.y, s2.x, s2.y, t2.x, t2.y)) {
          const push = alpha * UNCROSS_STRENGTH * 10;

          const dx = (s2.x + t2.x) / 2 - (s1.x + t1.x) / 2;
          const dy = (s2.y + t2.y) / 2 - (s1.y + t1.y) / 2;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          const moveX = (dx / dist) * push;
          const moveY = (dy / dist) * push;

          s1.vx -= moveX;
          s1.vy -= moveY;
          t1.vx -= moveX;
          t1.vy -= moveY;
          s2.vx += moveX;
          s2.vy += moveY;
          t2.vx += moveX;
          t2.vy += moveY;
        }
      }
    }
  }

  force.initialize = () => {};
  return force;
}

// Smooth falloff function - returns 1 at distance 0, smoothly approaches 0
function smoothFalloff(distance, threshold) {
  if (distance >= threshold) return 0;
  // Cubic ease-out for smooth transition
  const t = distance / threshold;
  return (1 - t) * (1 - t) * (1 - t);
}

// Calculate cubic Bezier path that curves away from nearby nodes
function calculateCurvedPath(source, target, nodes, curveFactor = 50) {
  const x1 = source.x, y1 = source.y;
  const x2 = target.x, y2 = target.y;
  
  // Edge direction
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return `M${x1},${y1}L${x2},${y2}`;
  
  // Find nodes that are close to the edge and calculate push direction
  let pushX = 0, pushY = 0;
  
  for (const node of nodes) {
    if (node === source || node === target) continue;
    
    // Check if node is close to the line segment
    const nodeToStart = { x: node.x - x1, y: node.y - y1 };
    const projection = (nodeToStart.x * dx + nodeToStart.y * dy) / (len * len);
    
    // Smooth falloff at edge endpoints (0.0-0.15 and 0.85-1.0)
    let edgeFactor = 1;
    if (projection < 0.15) {
      edgeFactor = projection / 0.15;
    } else if (projection > 0.85) {
      edgeFactor = (1 - projection) / 0.15;
    }
    if (projection < 0 || projection > 1) continue;
    
    // Point on the line closest to the node
    const closestX = x1 + projection * dx;
    const closestY = y1 + projection * dy;
    
    // Distance from node to the line
    const distToLine = Math.sqrt(
      (node.x - closestX) ** 2 + (node.y - closestY) ** 2
    );
    
    // Use smooth falloff instead of hard threshold
    // Larger nodes push edges away more strongly
    const nodeSize = node.size || 30;
    const threshold = nodeSize + 80;
    const sizeMultiplier = nodeSize / 30;  // 30 is baseline size
    const pushStrength = smoothFalloff(distToLine, threshold) * edgeFactor * sizeMultiplier;
    
    if (pushStrength > 0.001) {
      // Direction from node to closest point on line (we push AWAY from node)
      const awayX = closestX - node.x;
      const awayY = closestY - node.y;
      const awayDist = distToLine || 1;
      
      pushX += (awayX / awayDist) * pushStrength * curveFactor;
      pushY += (awayY / awayDist) * pushStrength * curveFactor;
    }
  }
  
  // Cap the push magnitude smoothly
  const pushMagnitude = Math.sqrt(pushX * pushX + pushY * pushY);
  const maxPush = Math.min(len * 0.4, curveFactor * 2);
  if (pushMagnitude > maxPush) {
    const scale = maxPush / pushMagnitude;
    pushX *= scale;
    pushY *= scale;
  }
  
  // Control points for cubic Bezier - offset from 1/3 and 2/3 points
  const cp1x = x1 + dx * 0.33 + pushX * 0.5;
  const cp1y = y1 + dy * 0.33 + pushY * 0.5;
  const cp2x = x1 + dx * 0.66 + pushX * 0.5;
  const cp2y = y1 + dy * 0.66 + pushY * 0.5;
  
  return `M${x1},${y1}C${cp1x},${cp1y} ${cp2x},${cp2y} ${x2},${y2}`;
}

// Calculate shortest distance from point to line segment
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);

  // Project point onto line, clamped to segment
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const nearestX = x1 + t * dx;
  const nearestY = y1 + t * dy;

  return {
    dist: Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2),
    nearestX,
    nearestY,
    t
  };
}

// Force to prevent edges from passing through non-endpoint nodes
function forceEdgeAvoidNodes(links, nodes) {
  function force(alpha) {
    for (const link of links) {
      const s = link.source;
      const t = link.target;

      for (const node of nodes) {
        // Skip if node is an endpoint of this link
        if (node === s || node === t) continue;

        const result = pointToSegmentDistance(node.x, node.y, s.x, s.y, t.x, t.y);
        const minDist = node.size / 2 + 10; // Node radius + padding

        if (result.dist < minDist && result.t > 0.05 && result.t < 0.95) {
          // Node is too close to edge (and not near endpoints)
          const overlap = minDist - result.dist;
          const strength = alpha * EDGE_NODE_REPULSION * (overlap / minDist);

          // Direction from nearest point on edge to node
          const dx = node.x - result.nearestX;
          const dy = node.y - result.nearestY;
          const dist = result.dist || 1;

          const pushX = (dx / dist) * strength;
          const pushY = (dy / dist) * strength;

          // Push node away from edge
          node.vx += pushX;
          node.vy += pushY;

          // Push edge endpoints away from node (smaller force)
          const edgePush = strength * 0.3;
          s.vx -= pushX * edgePush / strength;
          s.vy -= pushY * edgePush / strength;
          t.vx -= pushX * edgePush / strength;
          t.vy -= pushY * edgePush / strength;
        }
      }
    }
  }

  force.initialize = () => {};
  return force;
}

// Initialize nodes in circular layout
function initializeCircularLayout(nodes, width, height) {
  const count = nodes.length;
  const radius = Math.max(80, count * 12);
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / count;
    node.x = width / 2 + radius * Math.cos(angle);
    node.y = height / 2 + radius * Math.sin(angle);
    node.vx = 0;
    node.vy = 0;
    node.fx = null;
    node.fy = null;
  });
}

// Find a connected existing node to position new nodes near
function findConnectedExistingNode(newNodeId, links, allNodes) {
  const connectedLink = links.find(
    l => (l.source === newNodeId || l.source.id === newNodeId ||
          l.target === newNodeId || l.target.id === newNodeId)
  );

  if (!connectedLink) return null;

  const connectedId = (connectedLink.source === newNodeId || connectedLink.source.id === newNodeId)
    ? (connectedLink.target.id ?? connectedLink.target)
    : (connectedLink.source.id ?? connectedLink.source);

  return allNodes.find(n => n.id === connectedId && n.x !== undefined);
}

// Calculate transform to fit nodes in viewport
function calculateFitTransform(nodes, width, height, padding = 40) {
  if (nodes.length === 0) return d3.zoomIdentity;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(node => {
    const nodeX = node.x ?? width / 2;
    const nodeY = node.y ?? height / 2;
    const radius = node.size / 2;
    minX = Math.min(minX, nodeX - radius);
    minY = Math.min(minY, nodeY - radius);
    maxX = Math.max(maxX, nodeX + radius);
    maxY = Math.max(maxY, nodeY + radius);
  });

  const graphWidth = maxX - minX;
  const graphHeight = maxY - minY;

  const scaleX = (width - padding * 2) / graphWidth;
  const scaleY = (height - padding * 2) / graphHeight;
  const scale = Math.min(scaleX, scaleY, 2);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(scale)
    .translate(-centerX, -centerY);
}

// Generate BFS reveal order starting from a node, then jumping to disconnected clusters
function generateRevealOrder(nodes, links, startNodeId) {
  // Build adjacency list
  const adjacency = new Map();
  nodes.forEach(n => adjacency.set(n.id, []));
  links.forEach(l => {
    const srcId = l.source.id ?? l.source;
    const tgtId = l.target.id ?? l.target;
    adjacency.get(srcId)?.push(tgtId);
    adjacency.get(tgtId)?.push(srcId);
  });

  const order = [];  // Array of arrays (waves)
  const visited = new Set();
  const nodeIds = nodes.map(n => n.id);

  function bfsFrom(startId) {
    if (visited.has(startId)) return;
    const queue = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const wave = [...queue];
      order.push(wave);
      queue.length = 0;

      for (const nodeId of wave) {
        for (const neighborId of adjacency.get(nodeId) || []) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(neighborId);
          }
        }
      }
    }
  }

  // Start from user node if valid
  if (startNodeId && adjacency.has(startNodeId)) {
    bfsFrom(startNodeId);
  }

  // Then any remaining disconnected clusters (in DB order)
  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId)) {
      bfsFrom(nodeId);
    }
  }

  return order; // Array of waves (each wave = array of node IDs)
}

function Graph({ people, relationships, currentUserId, onShowTooltip, onHideTooltip, onRefresh, onOpenFeed, onNodeClick }) {
  const svgRef = useRef(null);
  const simulationRef = useRef(null);
  const zoomRef = useRef(null);
  const gRef = useRef(null);
  const hasFittedRef = useRef(false);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(settings);
  const nodePositionsRef = useRef(new Map()); // Persist node positions across renders
  const linkIdsRef = useRef(new Set()); // Track existing link IDs
  const animatedLinksRef = useRef(new Set()); // Track which links have been animated

  // Progressive reveal: false = not started (show nothing), Set = during reveal, null = complete (show all)
  const [visibleNodeIds, setVisibleNodeIds] = useState(false);
  const [positionsReady, setPositionsReady] = useState(false);
  const [showRefreshMessage, setShowRefreshMessage] = useState(false);
  const revealTimeoutsRef = useRef([]);
  const hasRevealedRef = useRef(false);

  // Full graph data (all nodes/links) - used for BFS reveal order
  const fullGraphData = useMemo(() => {
    if (people.length === 0) return { nodes: [], links: [] };

    const metrics = calculateMetrics(people, relationships);
    const storedPositions = nodePositionsRef.current;

    const nodes = people.map(person => {
      const m = metrics.get(person.id) || { degree: 0, betweenness: 0 };
      const normalizedDegree = m.degree / (metrics.maxDegree || 1);
      const normalizedBetweenness = m.betweenness / (metrics.maxBetweenness || 1);

      // Calculate size score based on nodeSizeMode setting
      let sizeScore;
      switch (settings.nodeSizeMode) {
        case 'connections':
          sizeScore = normalizedDegree;
          break;
        case 'betweenness':
          sizeScore = normalizedBetweenness;
          break;
        case 'both':
        default:
          sizeScore = normalizedDegree * DEGREE_WEIGHT + normalizedBetweenness * BETWEENNESS_WEIGHT;
      }
      const size = MIN_NODE_SIZE + sizeScore * (MAX_NODE_SIZE - MIN_NODE_SIZE);

      // Restore position if this node existed before
      const storedPos = storedPositions.get(person.id);

      return {
        id: person.id,
        firstName: person.first_name,
        lastName: person.last_name,
        avatar: person.avatar,
        bio: person.bio,
        isPending: !!person.is_pending,
        degree: m.degree,
        betweenness: m.betweenness,
        size,
        // Preserve position for existing nodes
        x: storedPos?.x,
        y: storedPos?.y,
        vx: storedPos?.vx ?? 0,
        vy: storedPos?.vy ?? 0,
        // Mark as new if no stored position
        isNew: !storedPos
      };
    });

    const existingLinkIds = linkIdsRef.current;
    // Create a map for quick person lookup
    const peopleMap = new Map(people.map(p => [p.id, p]));
    const links = relationships.map(rel => {
      const person1 = peopleMap.get(rel.person1_id);
      const person2 = peopleMap.get(rel.person2_id);
      const isPending = !!(person1?.is_pending || person2?.is_pending);
      return {
        id: rel.id,
        source: rel.person1_id,
        target: rel.person2_id,
        intensity: rel.intensity || 'kiss',
        date: rel.date,
        context: rel.context,
        person1FirstName: rel.person1_first_name,
        person1LastName: rel.person1_last_name,
        person1Avatar: rel.person1_avatar,
        person2FirstName: rel.person2_first_name,
        person2LastName: rel.person2_last_name,
        person2Avatar: rel.person2_avatar,
        isNew: !existingLinkIds.has(rel.id),
        isPending
      };
    });

    return { nodes, links };
  }, [people, relationships, settings.nodeSizeMode]);

  // Filtered graph data during progressive reveal
  const graphData = useMemo(() => {
    // null = reveal complete, show all
    if (visibleNodeIds === null) {
      return fullGraphData;
    }

    // false = not started yet, show nothing (wait for effect to kick in)
    if (visibleNodeIds === false) {
      return { nodes: [], links: [] };
    }

    // Set = during reveal, filter to visible nodes only
    const nodes = fullGraphData.nodes.filter(n => visibleNodeIds.has(n.id));

    // Show links where both endpoints are visible
    const links = fullGraphData.links.filter(l => {
      const srcId = l.source.id ?? l.source;
      const tgtId = l.target.id ?? l.target;
      return visibleNodeIds.has(srcId) && visibleNodeIds.has(tgtId);
    });

    return { nodes, links };
  }, [fullGraphData, visibleNodeIds]);

  // Pre-compute stable positions for all nodes before reveal
  useEffect(() => {
    if (fullGraphData.nodes.length === 0 || hasRevealedRef.current || positionsReady) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Initialize circular layout for all nodes
    const nodes = fullGraphData.nodes.map(n => ({ ...n }));
    initializeCircularLayout(nodes, width, height);

    // Create temporary simulation to compute stable positions
    const links = fullGraphData.links.map(l => ({
      ...l,
      source: l.source.id ?? l.source,
      target: l.target.id ?? l.target
    }));

    const tempSim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(50).strength(LINK_STRENGTH))
      .force('physics', forceCustomPhysics(DEFAULT_SETTINGS.repulsion, ATTRACTION_STRENGTH))
      .force('x', d3.forceX(width / 2).strength(CENTER_GRAVITY))
      .force('y', d3.forceY(height / 2).strength(CENTER_GRAVITY))
      .force('collision', d3.forceCollide().radius(d => d.size / 2 + COLLISION_PADDING).strength(1))
      .force('uncross', forceUncross(links))
      .force('edgeAvoid', forceEdgeAvoidNodes(links, nodes))
      .stop();

    // Run simulation until settled
    for (let i = 0; i < 300; i++) {
      tempSim.tick();
    }

    // Store computed positions
    nodes.forEach(node => {
      nodePositionsRef.current.set(node.id, {
        x: node.x,
        y: node.y,
        vx: 0,
        vy: 0
      });
      // Also update fullGraphData nodes directly
      const original = fullGraphData.nodes.find(n => n.id === node.id);
      if (original) {
        original.x = node.x;
        original.y = node.y;
        original.vx = 0;
        original.vy = 0;
      }
    });

    setPositionsReady(true);
  }, [fullGraphData, positionsReady]);

  // Trigger progressive reveal on first load
  useEffect(() => {
    // Skip if no data, already completed, or positions not ready
    if (fullGraphData.nodes.length === 0 || hasRevealedRef.current || !positionsReady) return;

    // Clear any pending timeouts from previous interrupted runs (StrictMode)
    revealTimeoutsRef.current.forEach(clearTimeout);
    revealTimeoutsRef.current = [];

    // Generate reveal order (BFS from currentUserId)
    const revealOrder = generateRevealOrder(
      fullGraphData.nodes,
      fullGraphData.links,
      currentUserId
    );

    if (revealOrder.length === 0) return;

    // Start with user node visible (first wave, no animation)
    const firstWave = revealOrder[0];
    const userNodeId = currentUserId && firstWave.includes(currentUserId) ? currentUserId : firstWave[0];

    // Start with just the user node
    setVisibleNodeIds(new Set([userNodeId]));

    // Schedule remaining nodes in waves
    let delay = REVEAL_WAVE_DELAY;

    // Process remaining nodes in first wave (if any besides user)
    const remainingFirstWave = firstWave.filter(id => id !== userNodeId);

    // Combine remaining first wave with rest of waves
    const wavesToAnimate = remainingFirstWave.length > 0
      ? [remainingFirstWave, ...revealOrder.slice(1)]
      : revealOrder.slice(1);

    wavesToAnimate.forEach((wave) => {
      wave.forEach((nodeId, nodeIndex) => {
        const nodeDelay = delay + nodeIndex * REVEAL_NODE_STAGGER;
        const timeout = setTimeout(() => {
          setVisibleNodeIds(prev => {
            const next = new Set(prev);
            next.add(nodeId);
            return next;
          });
        }, nodeDelay);
        revealTimeoutsRef.current.push(timeout);
      });
      delay += REVEAL_WAVE_DELAY + wave.length * REVEAL_NODE_STAGGER;
    });

    // After all nodes revealed, mark as complete
    const finalTimeout = setTimeout(() => {
      setVisibleNodeIds(null);
      hasRevealedRef.current = true; // Only mark complete when animation finishes
    }, delay + 500);
    revealTimeoutsRef.current.push(finalTimeout);

    // Cleanup pending timeouts on re-run (allows animation restart in StrictMode)
    return () => {
      revealTimeoutsRef.current.forEach(clearTimeout);
      revealTimeoutsRef.current = [];
    };
  }, [fullGraphData, currentUserId, positionsReady]);

  const handleReset = useCallback(() => {
    if (!simulationRef.current || !svgRef.current || !zoomRef.current) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    initializeCircularLayout(graphData.nodes, width, height);

    // Update position cache with new circular positions
    graphData.nodes.forEach(node => {
      nodePositionsRef.current.set(node.id, {
        x: node.x,
        y: node.y,
        vx: node.vx,
        vy: node.vy
      });
    });

    simulationRef.current.alpha(1).restart();

    // Zoom immediately in parallel with simulation
    const transform = calculateFitTransform(graphData.nodes, width, height);
    d3.select(svgRef.current)
      .transition()
      .duration(750)
      .ease(d3.easeCubicOut)
      .call(zoomRef.current.transform, transform);
  }, [graphData.nodes]);

  const handleRefresh = useCallback(() => {
    onRefresh();
    setShowRefreshMessage(true);
    setTimeout(() => setShowRefreshMessage(false), 2000);
  }, [onRefresh]);

  // Update simulation when settings change
  useEffect(() => {
    settingsRef.current = settings;

    if (!simulationRef.current) return;

    const linkForce = simulationRef.current.force('link');
    if (linkForce) {
      linkForce.distance(d => settings.linkDistance + ((d.source.size || MIN_NODE_SIZE) + (d.target.size || MIN_NODE_SIZE)) / 4);
    }

    simulationRef.current
      .force('physics', forceCustomPhysics(settings.repulsion, ATTRACTION_STRENGTH))
      .alpha(0.3)
      .restart();
  }, [settings]);

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: Number(value) }));
  };

  const toggleSetting = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Intensity stroke widths
    const intensityStroke = { kiss: 1, cuddle: 1.5, couple: 2, hidden: 1 };

    // Intensity highlight colors (for hover)
    const intensityColors = {
      kiss: '#ff6b6b',      // Red
      cuddle: '#ffaa55',    // Orange  
      couple: '#ff99cc',    // Pink
      hidden: '#888888'     // Gray
    };

    // Detect touch device
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Helper to show node tooltip
    const showNodeTooltip = (event, d) => {
      // Intensity sort order: kiss < cuddle < couple
      const intensityOrder = { kiss: 0, cuddle: 1, couple: 2, hidden: -1 };

      // Get all relationships for this node with partner info
      const nodeRelations = graphData.links
        .filter(l => {
          const srcId = l.source.id ?? l.source;
          const tgtId = l.target.id ?? l.target;
          return srcId === d.id || tgtId === d.id;
        })
        .map(l => {
          const srcId = l.source.id ?? l.source;
          const tgtId = l.target.id ?? l.target;
          const partnerId = srcId === d.id ? tgtId : srcId;
          const partner = graphData.nodes.find(n => n.id === partnerId);
          return {
            name: partner ? `${partner.firstName} ${partner.lastName}` : 'Unknown',
            intensity: l.intensity
          };
        })
        .sort((a, b) => (intensityOrder[a.intensity] ?? 0) - (intensityOrder[b.intensity] ?? 0));

      onShowTooltip({
        type: 'node',
        firstName: d.firstName,
        lastName: d.lastName,
        avatar: d.avatar,
        bio: d.bio,
        connections: d.degree,
        relations: nodeRelations
      }, { x: event.clientX ?? event.touches?.[0]?.clientX, y: event.clientY ?? event.touches?.[0]?.clientY });
    };

    // Helper to show link tooltip
    const showLinkTooltip = (event, d) => {
      onShowTooltip({
        type: 'link',
        person1FirstName: d.person1FirstName,
        person1LastName: d.person1LastName,
        person2FirstName: d.person2FirstName,
        person2LastName: d.person2LastName,
        intensity: d.intensity,
        date: d.date,
        context: d.context
      }, { x: event.clientX ?? event.touches?.[0]?.clientX, y: event.clientY ?? event.touches?.[0]?.clientY });
    };

    // Initialize container only once
    let g = gRef.current;
    let isFirstRender = false;
    if (!g) {
      isFirstRender = true;
      svg.selectAll('*').remove();
      g = svg.append('g');
      gRef.current = g;

      // Create groups for links and nodes
      g.append('g').attr('class', 'links');
      g.append('g').attr('class', 'nodes');

      // Zoom behavior
      const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => g.attr('transform', event.transform));
      svg.call(zoom);
      zoomRef.current = zoom;

      // Background click to dismiss (touch)
      if (isTouchDevice) {
        svg.on('click', (event) => {
          if (event.target === svgRef.current) {
            g.selectAll('.node').classed('highlighted', false);
            g.selectAll('.link').classed('highlighted connected dimmed', false);
            onHideTooltip();
          }
        });
      }
    }

    // Initialize positions for new nodes only
    graphData.nodes.forEach((node) => {
      if (node.x === undefined || node.y === undefined) {
        // Find connected existing node for better placement
        const connected = findConnectedExistingNode(node.id, graphData.links, graphData.nodes);
        if (connected && connected.x !== undefined) {
          // Place at a nice distance from connected node
          const angle = Math.random() * 2 * Math.PI;
          const distance = 80 + Math.random() * 40;
          node.x = connected.x + Math.cos(angle) * distance;
          node.y = connected.y + Math.sin(angle) * distance;
        } else {
          // Fallback to circular layout position
          const count = graphData.nodes.length;
          const idx = graphData.nodes.indexOf(node);
          const radius = Math.max(80, count * 12);
          const angle = (2 * Math.PI * idx) / count;
          node.x = width / 2 + radius * Math.cos(angle);
          node.y = height / 2 + radius * Math.sin(angle);
        }
        node.vx = 0;
        node.vy = 0;
        // Only animate if not first render (page load)
        if (!isFirstRender) {
          // Fix position during animation, will be released after
          node.fx = node.x;
          node.fy = node.y;
          node._isAnimatingIn = true;
        }
      }
    });

    // Set zoom transform on first render
    if (isFirstRender && !hasFittedRef.current) {
      hasFittedRef.current = true;
      const initialTransform = calculateFitTransform(graphData.nodes, width, height);
      svg.call(zoomRef.current.transform, initialTransform);
    }

    // === LINKS WITH ENTER/UPDATE/EXIT ===
    const visibleLinks = graphData.links.filter(l => l.intensity !== 'hidden');
    const linksGroup = g.select('.links');

    // Data join for visible links with key function
    const linkSelection = linksGroup.selectAll('path.link-visible')
      .data(visibleLinks, d => d.id);

    // EXIT: Remove old links
    linkSelection.exit().remove();

    // ENTER: New links (now using path for Bezier curves)
    const linkEnter = linkSelection.enter()
      .append('path')
      .attr('class', d => {
        let classes = `link-visible link intensity-${d.intensity}`;
        if (d.isPending) classes += ' pending';
        return classes;
      })
      .attr('fill', 'none')
      .attr('stroke-width', d => intensityStroke[d.intensity] || 1)
      .each(function(d) {
        // Mark for animation only if not first render
        this._animateIn = d.isNew && !isFirstRender;
      });

    // Merge for updates
    const link = linkEnter.merge(linkSelection);

    // Update classes for all links (handles pending state changes)
    link.attr('class', d => {
      let classes = `link-visible link intensity-${d.intensity}`;
      if (d.isPending) classes += ' pending';
      return classes;
    });

    // Hit areas for links (using paths to match the curved visible links)
    const linkHitSelection = linksGroup.selectAll('path.link-hit')
      .data(visibleLinks, d => d.id);

    linkHitSelection.exit().remove();

    const linkHitEnter = linkHitSelection.enter()
      .append('path')
      .attr('class', 'link-hit')
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 20)
      .style('cursor', 'pointer');

    const linkHitArea = linkHitEnter.merge(linkHitSelection);

    // Link events
    const handleLinkInteraction = (event, d, isEnter) => {
      if (isEnter) {
        link.filter(l => l.id === d.id)
          .classed('highlighted', true)
          .style('stroke', intensityColors[d.intensity] || intensityColors.kiss);
        showLinkTooltip(event, d);
      } else {
        link.filter(l => l.id === d.id)
          .classed('highlighted', false)
          .style('stroke', null);
        onHideTooltip();
      }
    };

    // Handle link click to open feed modal
    const handleLinkClick = (event, d) => {
      event.stopPropagation();
      link.classed('highlighted', false).style('stroke', null);
      onHideTooltip();
      if (onOpenFeed) {
        onOpenFeed({
          id: d.id,
          person1FirstName: d.person1FirstName,
          person1LastName: d.person1LastName,
          person1Avatar: d.person1Avatar,
          person2FirstName: d.person2FirstName,
          person2LastName: d.person2LastName,
          person2Avatar: d.person2Avatar,
          intensity: d.intensity,
          date: d.date,
          context: d.context
        });
      }
    };

    if (isTouchDevice) {
      linkHitArea.on('click', handleLinkClick);
    } else {
      linkHitArea
        .on('click', handleLinkClick)
        .on('mouseenter', (event, d) => handleLinkInteraction(event, d, true))
        .on('mouseleave', (event, d) => handleLinkInteraction(event, d, false));
    }

    // === NODES WITH ENTER/UPDATE/EXIT ===
    const nodesGroup = g.select('.nodes');

    const nodeSelection = nodesGroup.selectAll('g.node')
      .data(graphData.nodes, d => d.id);

    // EXIT: Remove old nodes with scale animation
    nodeSelection.exit()
      .transition()
      .duration(500)
      .ease(d3.easeCubicIn)
      .attr('transform', d => `translate(${d.x},${d.y}) scale(0)`)
      .remove();

    // ENTER: New nodes - position group follows simulation, inner group handles scale
    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', d => {
        let classes = 'node';
        if (d.id === currentUserId) classes += ' current-user';
        if (d.isPending) classes += ' pending';
        return classes;
      })
      .attr('transform', d => `translate(${d.x},${d.y})`);

    // Check if we're in reveal mode (visibleNodeIds is a Set)
    const isRevealMode = visibleNodeIds instanceof Set;

    // Add all node sub-elements to entering nodes (wrapped in scale group)
    nodeEnter.each(function(d) {
      const nodeG = d3.select(this);

      // Animate scale during reveal or when new node is added
      const shouldAnimate = isRevealMode || d._isAnimatingIn;

      // Inner group for scale animation (starts at scale 0 if animating)
      const scaleGroup = nodeG.append('g')
        .attr('class', 'node-scale-group')
        .attr('transform', shouldAnimate ? 'scale(0)' : 'scale(1)');

      // Mark for animation
      d._shouldAnimate = shouldAnimate;

      // Clip path
      scaleGroup.append('clipPath')
        .attr('id', `clip-${d.id}`)
        .append('circle')
        .attr('r', d.size / 2);

      // Background circle
      scaleGroup.append('circle')
        .attr('class', 'node-bg')
        .attr('r', d.size / 2);

      // Avatar or initials
      if (d.avatar) {
        scaleGroup.append('image')
          .attr('href', d.avatar)
          .attr('x', -d.size / 2)
          .attr('y', -d.size / 2)
          .attr('width', d.size)
          .attr('height', d.size)
          .attr('clip-path', `url(#clip-${d.id})`)
          .attr('preserveAspectRatio', 'xMidYMid slice');
      } else {
        scaleGroup.append('text')
          .attr('class', 'node-initial')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', d.size * 0.4)
          .text(d.firstName.charAt(0).toUpperCase());
      }

      // Border
      scaleGroup.append('circle')
        .attr('class', 'node-border')
        .attr('r', d.size / 2);
    });

    // Icon configs for relationship types (single icon that grows and fades)
    const relationshipIcons = {
      couple: { emoji: '❤️', color: '#ffb6c1' },  // Light pink heart
      cuddle: { emoji: '🍑', color: '#ffcc99' },  // Light orange peach
      kiss: { emoji: '💋', color: '#ff6b6b' }     // Red lips
    };

    // Function to get relationship intensity for a node
    const getNodeRelationshipIntensity = (nodeId) => {
      const nodeLinks = graphData.links.filter(l => {
        const srcId = l.source.id ?? l.source;
        const tgtId = l.target.id ?? l.target;
        return srcId === nodeId || tgtId === nodeId;
      });
      if (nodeLinks.length === 0) return 'kiss';
      // Priority: couple > cuddle > kiss
      if (nodeLinks.some(l => l.intensity === 'couple')) return 'couple';
      if (nodeLinks.some(l => l.intensity === 'cuddle')) return 'cuddle';
      return 'kiss';
    };


    // Animate nodes scaling in with bounce and icon burst effect
    nodeEnter.filter(d => d._shouldAnimate).select('.node-scale-group')
      .transition()
      .duration(800)
      .ease(d3.easeElasticOut.amplitude(1).period(0.5))
      .attr('transform', 'scale(1)')
      .on('end', function() {
        const nodeG = d3.select(this.parentNode);
        const d = nodeG.datum();

        // Release fixed position so simulation can take over
        if (d._isAnimatingIn) {
          d.fx = null;
          d.fy = null;
          d._isAnimatingIn = false;
          if (simulationRef.current) {
            simulationRef.current.alpha(0.2).restart();
          }
        }

        // Get relationship type for this node
        const intensity = getNodeRelationshipIntensity(d.id);

        // Get icon config for this relationship type
        const iconConfig = relationshipIcons[intensity] || relationshipIcons.kiss;

        // Create simple grow-and-fade effect with single icon behind the node
        const effectGroup = nodeG.insert('g', ':first-child').attr('class', 'burst-effect');
        const iconSize = d.size * 1.5;

        effectGroup.append('text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', iconSize)
          .attr('transform', 'scale(0)')
          .attr('opacity', 0.8)
          .text(iconConfig.emoji)
          .transition()
          .duration(600)
          .ease(d3.easeQuadOut)
          .attr('transform', 'scale(1.5)')
          .attr('opacity', 0)
          .on('end', function() {
            effectGroup.remove();
          });
      });

    // Merge for updates
    const node = nodeEnter.merge(nodeSelection);

    // Update classes for all nodes (handles pending state changes)
    node.attr('class', d => {
      let classes = 'node';
      if (d.id === currentUserId) classes += ' current-user';
      if (d.isPending) classes += ' pending';
      return classes;
    });

    // UPDATE: Animate size changes for existing nodes
    nodeSelection.each(function(d) {
      const nodeG = d3.select(this);
      const scaleGroup = nodeG.select('.node-scale-group');

      // Animate circle sizes
      scaleGroup.select('clipPath circle')
        .transition()
        .duration(500)
        .attr('r', d.size / 2);

      scaleGroup.select('circle.node-bg')
        .transition()
        .duration(500)
        .attr('r', d.size / 2);

      scaleGroup.select('circle.node-border')
        .transition()
        .duration(500)
        .attr('r', d.size / 2);

      // Animate image size/position
      scaleGroup.select('image')
        .transition()
        .duration(500)
        .attr('x', -d.size / 2)
        .attr('y', -d.size / 2)
        .attr('width', d.size)
        .attr('height', d.size);

      // Animate text size
      scaleGroup.select('text.node-initial')
        .transition()
        .duration(500)
        .attr('font-size', d.size * 0.4);
    });

    // Calculate BFS distances from a node
    const calculateDistances = (startId) => {
      const distances = new Map();
      distances.set(startId, 0);
      const queue = [startId];

      // Build adjacency from current links
      const adj = new Map();
      graphData.nodes.forEach(n => adj.set(n.id, []));
      graphData.links.forEach(l => {
        const srcId = l.source.id ?? l.source;
        const tgtId = l.target.id ?? l.target;
        adj.get(srcId)?.push(tgtId);
        adj.get(tgtId)?.push(srcId);
      });

      while (queue.length > 0) {
        const current = queue.shift();
        const currentDist = distances.get(current);
        for (const neighbor of adj.get(current) || []) {
          if (!distances.has(neighbor)) {
            distances.set(neighbor, currentDist + 1);
            queue.push(neighbor);
          }
        }
      }
      return distances;
    };

    // Node interaction
    const highlightNode = (d, highlight) => {
      if (highlight) {
        const distances = calculateDistances(d.id);
        const maxDist = Math.max(...distances.values(), 1);

        // Apply distance-based styling to nodes
        node.each(function(n) {
          const dist = distances.get(n.id);
          const nodeEl = d3.select(this);

          if (n.id === d.id) {
            nodeEl.classed('highlighted', true);
            nodeEl.attr('data-distance', '0');
          } else if (dist !== undefined) {
            nodeEl.classed('highlighted', false);
            nodeEl.attr('data-distance', Math.min(dist, 5)); // Cap at 5 for CSS
          } else {
            // Disconnected node
            nodeEl.classed('highlighted', false);
            nodeEl.attr('data-distance', 'disconnected');
          }
        });

        // Style links based on whether they connect to hovered node
        link.each(function(l) {
          const linkEl = d3.select(this);
          const srcDist = distances.get(l.source.id) ?? Infinity;
          const tgtDist = distances.get(l.target.id) ?? Infinity;
          const minDist = Math.min(srcDist, tgtDist);

          if (l.source.id === d.id || l.target.id === d.id) {
            linkEl.classed('connected', true).classed('dimmed', false);
            linkEl.attr('data-distance', '0');
            // Apply intensity-specific color
            linkEl.style('stroke', intensityColors[l.intensity] || intensityColors.kiss);
          } else {
            linkEl.classed('connected', false).classed('dimmed', true);
            linkEl.attr('data-distance', Math.min(minDist, 5));
            linkEl.style('stroke', null); // Reset to CSS default
          }
        });
      } else {
        // Reset all
        node.classed('highlighted', false).attr('data-distance', null);
        link.classed('connected dimmed', false).attr('data-distance', null);
        link.style('stroke', null); // Reset stroke colors
      }
    };

    // Node click handler - opens profile feed modal
    const handleNodeClick = (event, d) => {
      event.stopPropagation();
      node.classed('highlighted', false);
      link.classed('connected dimmed', false);
      onHideTooltip();
      if (onNodeClick) {
        onNodeClick(d.id);
      }
    };

    if (isTouchDevice) {
      node.on('click', handleNodeClick);
    } else {
      node
        .on('click', handleNodeClick)
        .on('mouseenter', (event, d) => {
          highlightNode(d, true);
          showNodeTooltip(event, d);
        })
        .on('mouseleave', (event, d) => {
          highlightNode(d, false);
          onHideTooltip();
        });
    }

    // Drag behavior
    const drag = d3.drag()
      .on('start', (event, d) => {
        if (!event.active && simulationRef.current) simulationRef.current.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active && simulationRef.current) simulationRef.current.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag);

    // === SIMULATION ===
    const currentSettings = settingsRef.current;

    // Create or update simulation
    let simulation = simulationRef.current;
    if (!simulation) {
      simulation = d3.forceSimulation(graphData.nodes)
        .force('link', d3.forceLink(graphData.links)
          .id(d => d.id)
          .distance(d => currentSettings.linkDistance + ((d.source.size || MIN_NODE_SIZE) + (d.target.size || MIN_NODE_SIZE)) / 4)
          .strength(LINK_STRENGTH))
        .force('physics', forceCustomPhysics(currentSettings.repulsion, ATTRACTION_STRENGTH))
        .force('x', d3.forceX(width / 2).strength(CENTER_GRAVITY))
        .force('y', d3.forceY(height / 2).strength(CENTER_GRAVITY))
        .force('collision', d3.forceCollide()
          .radius(d => d.size / 2 + COLLISION_PADDING)
          .strength(1))
        .force('uncross', forceUncross(graphData.links))
        .force('edgeAvoid', forceEdgeAvoidNodes(graphData.links, graphData.nodes))
        .alphaDecay(0.02)
        .velocityDecay(0.5);

      simulationRef.current = simulation;
    } else {
      // Update existing simulation with new nodes/links
      simulation.nodes(graphData.nodes);
      simulation.force('link').links(graphData.links);
      simulation.force('uncross', forceUncross(graphData.links));
      simulation.force('edgeAvoid', forceEdgeAvoidNodes(graphData.links, graphData.nodes));
      // Gentle restart - new nodes are fixed, so only minor adjustments
      simulation.alpha(0.1).restart();
    }

    // Update positions on tick
    simulation.on('tick', () => {
      // Update curved link paths
      link.each(function(d) {
        const pathElem = d3.select(this);
        const pathData = calculateCurvedPath(d.source, d.target, graphData.nodes);
        pathElem.attr('d', pathData);

        // Animate new links drawing in
        if (this._animateIn && !animatedLinksRef.current.has(d.id)) {
          animatedLinksRef.current.add(d.id);
          const pathNode = this;
          const length = pathNode.getTotalLength ? pathNode.getTotalLength() : 200;
          pathElem
            .attr('stroke-dasharray', length)
            .attr('stroke-dashoffset', length)
            .transition()
            .duration(1200)
            .ease(d3.easeCubicInOut)
            .attr('stroke-dashoffset', 0)
            .on('end', () => {
              pathElem.attr('stroke-dasharray', null);
              this._animateIn = false;
            });
        }
      });

      // Update hit area paths to match curved links
      linkHitArea.attr('d', d => calculateCurvedPath(d.source, d.target, graphData.nodes));

      // Update node positions (scale is handled separately by inner group)
      node.attr('transform', d => `translate(${d.x},${d.y})`);

      // Store positions for persistence
      graphData.nodes.forEach(n => {
        nodePositionsRef.current.set(n.id, {
          x: n.x,
          y: n.y,
          vx: n.vx,
          vy: n.vy
        });
      });
    });

    // Update link IDs ref for tracking new links
    linkIdsRef.current = new Set(graphData.links.map(l => l.id));

    // Clean up stale node positions (for removed nodes)
    const currentNodeIds = new Set(graphData.nodes.map(n => n.id));
    for (const nodeId of nodePositionsRef.current.keys()) {
      if (!currentNodeIds.has(nodeId)) {
        nodePositionsRef.current.delete(nodeId);
      }
    }

    // Clean up stale animated links
    for (const linkId of animatedLinksRef.current) {
      if (!linkIdsRef.current.has(linkId)) {
        animatedLinksRef.current.delete(linkId);
      }
    }

    // Handle resize
    const handleResize = () => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      if (simulationRef.current) {
        simulationRef.current.force('x', d3.forceX(newWidth / 2).strength(CENTER_GRAVITY));
        simulationRef.current.force('y', d3.forceY(newHeight / 2).strength(CENTER_GRAVITY));
        simulationRef.current.alpha(0.3).restart();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      // Note: Don't stop simulation here as it's reused across renders
    };
  }, [graphData, currentUserId, onShowTooltip, onHideTooltip, onNodeClick, visibleNodeIds]);

  return (
    <div className="graph-container">
      <svg ref={svgRef} className="graph-svg" />
      {graphData.nodes.length > 0 && (
        <>
          {showSettings && (
            <div className="settings-panel">
              <div className="settings-header">
                <span>Display Settings</span>
                <button className="settings-close" onClick={() => setShowSettings(false)}>×</button>
              </div>

              <label className="settings-label">
                <span>Repulsion</span>
              </label>
              <DotSlider
                value={settings.repulsion}
                settingKey="repulsion"
                onChange={(val) => updateSetting('repulsion', val)}
              />

              <label className="settings-label">
                <span>Edge Distance</span>
              </label>
              <DotSlider
                value={settings.linkDistance}
                settingKey="linkDistance"
                onChange={(val) => updateSetting('linkDistance', val)}
              />

              <div className="settings-segmented">
                <label className="settings-label">
                  <span>Node Size</span>
                </label>
                <div className="segmented-control">
                  <button
                    type="button"
                    className={`segmented-btn ${settings.nodeSizeMode === 'connections' ? 'active' : ''}`}
                    onClick={() => setSettings(prev => ({ ...prev, nodeSizeMode: 'connections' }))}
                  >
                    Connections
                  </button>
                  <button
                    type="button"
                    className={`segmented-btn ${settings.nodeSizeMode === 'betweenness' ? 'active' : ''}`}
                    onClick={() => setSettings(prev => ({ ...prev, nodeSizeMode: 'betweenness' }))}
                  >
                    Influence
                  </button>
                  <button
                    type="button"
                    className={`segmented-btn ${settings.nodeSizeMode === 'both' ? 'active' : ''}`}
                    onClick={() => setSettings(prev => ({ ...prev, nodeSizeMode: 'both' }))}
                  >
                    Both
                  </button>
                </div>
              </div>

              <button className="settings-reset" onClick={resetSettings}>Reset All</button>
            </div>
          )}

          <div className="graph-buttons">
            <button className="graph-button" onClick={() => setShowSettings(!showSettings)} title="Settings">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <div className="refresh-button-wrapper">
              <button className="graph-button" onClick={handleRefresh} title="Refresh data">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
              {showRefreshMessage && (
                <span className="refresh-message">Data up to date</span>
              )}
            </div>
            <button className="graph-button" onClick={handleReset} title="Rearrange layout">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5" />
                <path d="M8 3H3v5" />
                <path d="M21 3l-7 7" />
                <path d="M3 3l7 7" />
                <path d="M16 21h5v-5" />
                <path d="M8 21H3v-5" />
                <path d="M21 21l-7-7" />
                <path d="M3 21l7-7" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default Graph;
