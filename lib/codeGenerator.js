const adjectives = [
  'bold', 'brave', 'bright', 'calm', 'clear', 'cool', 'crisp', 'daring', 'deep', 'eager',
  'fair', 'fast', 'fierce', 'fine', 'free', 'fresh', 'gentle', 'glad', 'golden', 'grand',
  'green', 'happy', 'keen', 'kind', 'lively', 'lucky', 'mellow', 'mighty', 'neat', 'noble',
  'pale', 'plain', 'proud', 'pure', 'quick', 'quiet', 'rapid', 'rare', 'rich', 'royal',
  'sharp', 'shiny', 'silent', 'silver', 'simple', 'sleek', 'smooth', 'soft', 'solid', 'stark',
  'steady', 'steep', 'still', 'strong', 'sunny', 'super', 'sweet', 'swift', 'tall', 'tender',
  'thick', 'tight', 'tiny', 'tough', 'true', 'vast', 'vivid', 'warm', 'wide', 'wild',
  'wise', 'witty', 'young', 'zesty', 'agile', 'ample', 'azure', 'bliss', 'chief', 'clever',
  'coral', 'cozy', 'dusty', 'early', 'faint', 'fiery', 'fleet', 'frost', 'gleam', 'glow',
  'gusty', 'hazy', 'ivory', 'jade', 'jolly', 'lunar', 'maple', 'misty', 'mossy', 'rusty'
];

const nouns = [
  'aurora', 'beacon', 'bloom', 'breeze', 'brook', 'canyon', 'cedar', 'cliff', 'cloud', 'coast',
  'coral', 'crane', 'creek', 'crown', 'dawn', 'delta', 'dune', 'eagle', 'ember', 'fern',
  'field', 'flame', 'flare', 'flora', 'forge', 'frost', 'glade', 'gleam', 'grove', 'haven',
  'hawk', 'heart', 'hedge', 'hill', 'horizon', 'iris', 'isle', 'jade', 'lake', 'lark',
  'leaf', 'light', 'lily', 'lotus', 'maple', 'marsh', 'mesa', 'mist', 'moon', 'moss',
  'north', 'oak', 'oasis', 'orbit', 'otter', 'palm', 'path', 'peak', 'pearl', 'pine',
  'pixel', 'plain', 'plum', 'pond', 'prism', 'pulse', 'rain', 'reef', 'ridge', 'river',
  'robin', 'rose', 'sage', 'shore', 'sky', 'slate', 'snow', 'spark', 'spire', 'spring',
  'star', 'stone', 'storm', 'sun', 'swift', 'tide', 'trail', 'vale', 'wave', 'willow',
  'wind', 'wing', 'wood', 'wren', 'zenith', 'birch', 'bloom', 'cove', 'drift', 'frost'
];

export function generateGroupCode() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `${adj}-${noun}-${num}`;
}
