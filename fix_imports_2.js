const fs = require('fs');
const path = require('path');

const toolsDir = path.join(__dirname, 'src', 'mastra', 'tools');
const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.ts') && f !== 'index.ts');

files.forEach(file => {
  const filePath = path.join(toolsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // We removed `const client = getConvexClient();` before `await client.mutation(...)`. Let's put it back if it's missing.
  // Actually, we can just replace `await client.mutation` with `const client = getConvexClient();\n    await client.mutation`
  // as long as it's not already preceded by `const client = getConvexClient();`.
  
  // Wait, I can just do:
  content = content.replace(/(?<!const client = getConvexClient\(\);\s*)await client\.mutation/g, "const client = getConvexClient();\n    await client.mutation");

  // Also fix `const eventId = await client.mutation` that we broke
  content = content.replace(/(?<!const client = getConvexClient\(\);\s*)const (\w+) = await client\.mutation/g, "const client = getConvexClient();\n    const $1 = await client.mutation");

  // In addEvent and updateEvent, client was declared at the top of execute, so we have duplicate declarations now!
  // We can fix duplicate declarations by removing the top one if it's unused, but it IS used!
  
  fs.writeFileSync(filePath, content);
});

console.log('Fixed missing clients');
