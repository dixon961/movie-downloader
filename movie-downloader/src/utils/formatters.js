export function formatSize(bytes) {
  if (bytes === 0 || isNaN(bytes) || bytes === null || typeof bytes === 'undefined') return 'Unknown';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i < 0 || i >= sizes.length) return 'Unknown'; // Handle edge cases like very small numbers
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}