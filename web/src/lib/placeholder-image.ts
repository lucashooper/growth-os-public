/**
 * Generate a data URL for a gradient placeholder image
 * Creates visually appealing placeholders for posts without cover images
 */

const gradients = [
  ["#667eea", "#764ba2"], // Purple
  ["#f093fb", "#f5576c"], // Pink
  ["#4facfe", "#00f2fe"], // Blue
  ["#43e97b", "#38f9d7"], // Green  
  ["#fa709a", "#fee140"], // Sunset
  ["#30cfd0", "#330867"], // Ocean
  ["#a8edea", "#fed6e3"], // Pastel
  ["#ff9a9e", "#fecfef"], // Rose
  ["#ffecd2", "#fcb69f"], // Peach
  ["#ff6e7f", "#bfe9ff"], // Coral
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate a gradient placeholder SVG based on the post hook/id
 */
export function getPlaceholderImage(seed: string): string {
  const hash = hashString(seed);
  const [color1, color2] = gradients[hash % gradients.length];
  
  // Create SVG with gradient
  const svg = `
    <svg width="200" height="300" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="200" height="300" fill="url(#grad)" />
      <circle cx="100" cy="150" r="30" fill="white" opacity="0.2" />
      <circle cx="100" cy="150" r="20" fill="white" opacity="0.3" />
    </svg>
  `.trim();
  
  // Convert to data URL
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

/**
 * Get placeholder image with Growth OS branding
 */
export function getBrandedPlaceholder(seed: string): string {
  const hash = hashString(seed);
  const [color1, color2] = gradients[hash % gradients.length];
  
  const svg = `
    <svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="400" height="600" fill="url(#grad)" />
      <g transform="translate(200, 300)">
        <circle r="60" fill="white" opacity="0.15" />
        <circle r="45" fill="white" opacity="0.25" />
        <path d="M -15,-10 L 0,10 L 15,-10 Z" fill="white" opacity="0.4" transform="scale(2)" />
      </g>
    </svg>
  `.trim();
  
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}
