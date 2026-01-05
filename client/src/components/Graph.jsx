import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { calculateMetrics } from '../utils/graphMetrics';
import './Graph.css';

const MIN_NODE_SIZE = 20;
const MAX_NODE_SIZE = 60;
const DEGREE_WEIGHT = 0.4;
const BETWEENNESS_WEIGHT = 0.6;

// Force simulation parameters (non-configurable)
const LINK_STRENGTH = 0.8;
const COLLISION_PADDING = 15;
const CENTER_GRAVITY = 0.03;
const UNCROSS_STRENGTH = 0.5;

// Default settings (configurable)
const DEFAULT_SETTINGS = {
  repulsion: 12500,     // 1/r² repulsion strength
  linkDistance: 30,     // Target distance for connected nodes
  attraction: 10,       // 1/r attraction strength (clustering)
};

// Slider ranges for percentage calculation
const SLIDER_RANGES = {
  repulsion: { min: 1000, max: 15000 },
  linkDistance: { min: 30, max: 200 },
  attraction: { min: 10, max: 150 },
};

const toPercent = (value, key) => {
  const { min, max } = SLIDER_RANGES[key];
  return Math.round(((value - min) / (max - min)) * 100);
};

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

// Initialize nodes in circular layout
function initializeCircularLayout(nodes, width, height) {
  const count = nodes.length;
  const radius = Math.max(100, count * 30);
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

function Graph({ people, relationships, currentUserId, onShowTooltip, onHideTooltip }) {
  const svgRef = useRef(null);
  const simulationRef = useRef(null);
  const zoomRef = useRef(null);
  const gRef = useRef(null);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [dragging, setDragging] = useState(null);
  const settingsRef = useRef(settings);

  const graphData = useMemo(() => {
    if (people.length === 0) return { nodes: [], links: [] };

    const metrics = calculateMetrics(people, relationships);

    const nodes = people.map(person => {
      const m = metrics.get(person.id) || { degree: 0, betweenness: 0 };
      const normalizedDegree = m.degree / (metrics.maxDegree || 1);
      const normalizedBetweenness = m.betweenness / (metrics.maxBetweenness || 1);

      const sizeScore = normalizedDegree * DEGREE_WEIGHT + normalizedBetweenness * BETWEENNESS_WEIGHT;
      const size = MIN_NODE_SIZE + sizeScore * (MAX_NODE_SIZE - MIN_NODE_SIZE);

      return {
        id: person.id,
        firstName: person.first_name,
        lastName: person.last_name,
        avatar: person.avatar,
        bio: person.bio,
        isCiv: person.is_civ,
        degree: m.degree,
        betweenness: m.betweenness,
        size
      };
    });

    const links = relationships.map(rel => ({
      id: rel.id,
      source: rel.person1_id,
      target: rel.person2_id,
      intensity: rel.intensity || 'kiss',
      date: rel.date,
      context: rel.context,
      person1Name: `${rel.person1_first_name} ${rel.person1_last_name}`,
      person2Name: `${rel.person2_first_name} ${rel.person2_last_name}`
    }));

    return { nodes, links };
  }, [people, relationships]);

  const fitToScreen = useCallback((animate = false) => {
    if (!svgRef.current || !zoomRef.current || graphData.nodes.length === 0) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const transform = calculateFitTransform(graphData.nodes, width, height);
    const svg = d3.select(svgRef.current);

    if (animate) {
      svg.transition().duration(500).call(zoomRef.current.transform, transform);
    } else {
      svg.call(zoomRef.current.transform, transform);
    }
  }, [graphData.nodes]);

  const handleReset = useCallback(() => {
    if (!simulationRef.current) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    initializeCircularLayout(graphData.nodes, width, height);
    simulationRef.current.alpha(1).restart();

    // Use simulation end event for fit
    simulationRef.current.on('end.fit', () => {
      fitToScreen(true);
      simulationRef.current.on('end.fit', null);
    });
  }, [graphData.nodes, fitToScreen]);

  // Update simulation when settings change
  useEffect(() => {
    settingsRef.current = settings;
    if (!simulationRef.current) return;

    const linkForce = simulationRef.current.force('link');
    if (linkForce) {
      linkForce.distance(d => settings.linkDistance + ((d.source.size || MIN_NODE_SIZE) + (d.target.size || MIN_NODE_SIZE)) / 4);
    }

    simulationRef.current
      .force('physics', forceCustomPhysics(settings.repulsion, settings.attraction))
      .alpha(0.3)
      .restart();
  }, [settings]);

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: Number(value) }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = window.innerWidth;
    const height = window.innerHeight;

    svg.selectAll('*').remove();

    const g = svg.append('g');
    gRef.current = g;

    // Zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));

    svg.call(zoom);
    zoomRef.current = zoom;

    // Initialize positions
    initializeCircularLayout(graphData.nodes, width, height);

    // Intensity stroke widths
    const intensityStroke = { kiss: 1, cuddle: 3, couple: 5, hidden: 1 };

    // Detect touch device
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Helper to show node tooltip
    const showNodeTooltip = (event, d) => {
      onShowTooltip({
        type: 'node',
        firstName: d.firstName,
        lastName: d.lastName,
        avatar: d.avatar,
        bio: d.bio,
        connections: d.degree
      }, { x: event.clientX ?? event.touches?.[0]?.clientX, y: event.clientY ?? event.touches?.[0]?.clientY });
    };

    // Helper to show link tooltip
    const showLinkTooltip = (event, d) => {
      onShowTooltip({
        type: 'link',
        person1: d.person1Name,
        person2: d.person2Name,
        intensity: d.intensity,
        date: d.date,
        context: d.context
      }, { x: event.clientX ?? event.touches?.[0]?.clientX, y: event.clientY ?? event.touches?.[0]?.clientY });
    };

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

    // Links
    const linksGroup = g.append('g').attr('class', 'links');

    const link = linksGroup.selectAll('line.link-visible')
      .data(graphData.links)
      .join('line')
      .attr('class', d => `link-visible link intensity-${d.intensity}`)
      .attr('stroke-width', d => intensityStroke[d.intensity] || 1);

    const linkHitArea = linksGroup.selectAll('line.link-hit')
      .data(graphData.links)
      .join('line')
      .attr('class', 'link-hit')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 20)
      .style('cursor', 'pointer');

    // Link events
    const handleLinkInteraction = (event, d, isEnter) => {
      if (isEnter) {
        link.filter(l => l.id === d.id).classed('highlighted', true);
        showLinkTooltip(event, d);
      } else {
        link.filter(l => l.id === d.id).classed('highlighted', false);
        onHideTooltip();
      }
    };

    if (isTouchDevice) {
      linkHitArea.on('click', (event, d) => {
        event.stopPropagation();
        link.classed('highlighted', false);
        handleLinkInteraction(event, d, true);
      });
    } else {
      linkHitArea
        .on('mouseenter', (event, d) => handleLinkInteraction(event, d, true))
        .on('mouseleave', (event, d) => handleLinkInteraction(event, d, false));
    }

    // Nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(graphData.nodes)
      .join('g')
      .attr('class', d => d.id === currentUserId ? 'node current-user' : 'node');

    // Clip paths for avatars
    node.append('clipPath')
      .attr('id', d => `clip-${d.id}`)
      .append('circle')
      .attr('r', d => d.size / 2);

    // Node background
    node.append('circle')
      .attr('class', 'node-bg')
      .attr('r', d => d.size / 2);

    // Avatar images
    node.filter(d => d.avatar)
      .append('image')
      .attr('href', d => d.avatar)
      .attr('x', d => -d.size / 2)
      .attr('y', d => -d.size / 2)
      .attr('width', d => d.size)
      .attr('height', d => d.size)
      .attr('clip-path', d => `url(#clip-${d.id})`)
      .attr('preserveAspectRatio', 'xMidYMid slice');

    // Fallback initials
    node.filter(d => !d.avatar)
      .append('text')
      .attr('class', 'node-initial')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', d => d.size * 0.4)
      .text(d => d.firstName.charAt(0).toUpperCase());

    // Node border
    node.append('circle')
      .attr('class', 'node-border')
      .attr('r', d => d.size / 2);

    // CIV badge
    const civBadge = node.filter(d => d.isCiv == 1 || d.isCiv === true)
      .append('g')
      .attr('class', 'verified-badge')
      .attr('transform', d => `translate(${d.size / 2 - d.size * 0.1}, ${-d.size / 2 + d.size * 0.1})`);

    civBadge.append('circle')
      .attr('r', d => d.size * 0.2)
      .attr('fill', '#1d9bf0');

    civBadge.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', 'white')
      .attr('font-size', d => d.size * 0.14)
      .attr('font-weight', '700')
      .text('CIV');

    // Node interaction
    const highlightNode = (d, highlight) => {
      node.filter(n => n.id === d.id).classed('highlighted', highlight);
      link.classed('connected', l => highlight && (l.source.id === d.id || l.target.id === d.id));
      link.classed('dimmed', l => highlight && l.source.id !== d.id && l.target.id !== d.id);
    };

    if (isTouchDevice) {
      node.on('click', (event, d) => {
        event.stopPropagation();
        node.classed('highlighted', false);
        link.classed('connected dimmed', false);
        highlightNode(d, true);
        showNodeTooltip(event, d);
      });
    } else {
      node
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
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag);

    // Force simulation with custom physics
    const currentSettings = settingsRef.current;
    const simulation = d3.forceSimulation(graphData.nodes)
      // Links: strong attraction for connected nodes (shorter edges)
      .force('link', d3.forceLink(graphData.links)
        .id(d => d.id)
        .distance(d => currentSettings.linkDistance + ((d.source.size || MIN_NODE_SIZE) + (d.target.size || MIN_NODE_SIZE)) / 4)
        .strength(LINK_STRENGTH))
      // Custom physics: 1/r² repulsion + 1/r attraction
      .force('physics', forceCustomPhysics(currentSettings.repulsion, currentSettings.attraction))
      // Gentle gravity to keep graph centered
      .force('x', d3.forceX(width / 2).strength(CENTER_GRAVITY))
      .force('y', d3.forceY(height / 2).strength(CENTER_GRAVITY))
      // Collision: prevent overlap
      .force('collision', d3.forceCollide()
        .radius(d => d.size / 2 + COLLISION_PADDING)
        .strength(1))
      // Uncross: reduce edge crossings
      .force('uncross', forceUncross(graphData.links))
      .alphaDecay(0.01)
      .velocityDecay(0.4);

    simulationRef.current = simulation;

    // Update positions on tick
    let hasFitted = false;
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      linkHitArea
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);

      // Fit once when settled
      if (!hasFitted && simulation.alpha() < 0.1) {
        hasFitted = true;
        const transform = calculateFitTransform(graphData.nodes, width, height);
        svg.call(zoom.transform, transform);
      }
    });

    // Handle resize
    const handleResize = () => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      simulation.force('x', d3.forceX(newWidth / 2).strength(CENTER_GRAVITY));
      simulation.force('y', d3.forceY(newHeight / 2).strength(CENTER_GRAVITY));
      simulation.alpha(0.3).restart();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      simulation.stop();
    };
  }, [graphData, currentUserId, onShowTooltip, onHideTooltip]);

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
                {dragging === 'repulsion' && (
                  <span className="settings-value">{toPercent(settings.repulsion, 'repulsion')}%</span>
                )}
              </label>
              <input
                type="range"
                min={SLIDER_RANGES.repulsion.min}
                max={SLIDER_RANGES.repulsion.max}
                step="500"
                value={settings.repulsion}
                onChange={e => updateSetting('repulsion', e.target.value)}
                onMouseDown={() => setDragging('repulsion')}
                onMouseUp={() => setDragging(null)}
                onTouchStart={() => setDragging('repulsion')}
                onTouchEnd={() => setDragging(null)}
              />

              <label className="settings-label">
                <span>Edge Distance</span>
                {dragging === 'linkDistance' && (
                  <span className="settings-value">{toPercent(settings.linkDistance, 'linkDistance')}%</span>
                )}
              </label>
              <input
                type="range"
                min={SLIDER_RANGES.linkDistance.min}
                max={SLIDER_RANGES.linkDistance.max}
                step="10"
                value={settings.linkDistance}
                onChange={e => updateSetting('linkDistance', e.target.value)}
                onMouseDown={() => setDragging('linkDistance')}
                onMouseUp={() => setDragging(null)}
                onTouchStart={() => setDragging('linkDistance')}
                onTouchEnd={() => setDragging(null)}
              />

              <label className="settings-label">
                <span>Clustering</span>
                {dragging === 'attraction' && (
                  <span className="settings-value">{toPercent(settings.attraction, 'attraction')}%</span>
                )}
              </label>
              <input
                type="range"
                min={SLIDER_RANGES.attraction.min}
                max={SLIDER_RANGES.attraction.max}
                step="5"
                value={settings.attraction}
                onChange={e => updateSetting('attraction', e.target.value)}
                onMouseDown={() => setDragging('attraction')}
                onMouseUp={() => setDragging(null)}
                onTouchStart={() => setDragging('attraction')}
                onTouchEnd={() => setDragging(null)}
              />

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
            <button className="graph-button" onClick={handleReset} title="Reset graph">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default Graph;
