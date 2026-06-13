console.log('=== DEBUG ===');
console.log('require.resolve paths:', module.paths);
try {
  const e = require('electron');
  console.log('typeof electron:', typeof e);
  if (typeof e === 'string') console.log('electron path:', e);
  else console.log('electron keys:', Object.keys(e).slice(0,10));
} catch(err) {
  console.log('Error:', err.message);
}
console.log('process.type:', process.type);
console.log('process.versions.electron:', process.versions.electron);
